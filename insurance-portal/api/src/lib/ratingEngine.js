/**
 * Dynamic rating engine. A rating model (Admin → Rating models) is data:
 *
 *   { requiredTables: [...], constants: { NAME: value },
 *     steps: [
 *       { "set": "name", "expr": "..." }                         // calculate a variable
 *       { "each": "list expr", "as": "loc", "index": "i",        // loop; nested steps; optional collect
 *         "collect": "locs", "steps": [ ... ] }
 *       { "error": "CODE", "when": "expr", "field": "expr" }     // validation error (collected)
 *       { "checkpoint": true }                                   // stop with { valid:false, errors } if any
 *       { "return": { "path": "expr", ... }, "when": "expr" }    // finish early (e.g. not quotable)
 *       { "fail": "CODE", "when": "expr" }                       // configuration error
 *     ],
 *     output: { "dotted.path": "expr", ... } }
 *
 * Inputs available to expressions: risk, tables, settings, country, authority, uwTerms,
 * sanctionsHit, existingExposure, context, channel, plus the model constants.
 */
const { compile, evaluate, ExprError } = require('./expr');

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i += 1) o = (o[parts[i]] ||= {});
  o[parts[parts.length - 1]] = value;
}

function build(fields, scope, budget, where) {
  const out = {};
  for (const [path, src] of Object.entries(fields)) {
    try {
      setPath(out, path, evaluate(compile(src), scope, budget));
    } catch (e) {
      throw wrap(e, `${where} "${path}"`);
    }
  }
  return out;
}

function wrap(e, where) {
  if (e.code === 'RATING_FACTOR_MISSING') return e;
  const err = new ExprError(`${where}: ${e.message}`, e.code || 'EXPRESSION_ERROR');
  return err;
}

function exec(steps, scope, errors, budget, path, ctx) {
  for (let n = 0; n < steps.length; n += 1) {
    const step = steps[n];
    const where = `${path}[${n}]`;
    const ev = (src, label) => {
      try { return evaluate(compile(src), scope, budget); } catch (e) { throw wrap(e, `${where} ${label}`); }
    };
    if ('set' in step) scope.vars[step.set] = ev(step.expr, `set ${step.set}`);
    else if ('each' in step) {
      const list = ev(step.each, 'each') ?? [];
      if (!Array.isArray(list)) throw new ExprError(`${where}: "each" needs a list`);
      const collected = [];
      for (let i = 0; i < list.length; i += 1) {
        const child = { vars: { [step.as || 'item']: list[i], [step.index || 'index']: i }, parent: scope };
        const r = exec(step.steps || [], child, errors, budget, `${where}.steps`, ctx);
        if (r) return r;
        if (step.collect) collected.push({ ...child.vars });
      }
      if (step.collect) scope.vars[step.collect] = collected;
    } else if ('error' in step) {
      if (!step.when || ev(step.when, 'when')) errors.push({ code: step.error, ...(step.field ? { field: ev(step.field, 'field') } : {}) });
    } else if ('checkpoint' in step) {
      if (errors.length) return { valid: false, errors: [...errors] };
    } else if ('return' in step) {
      if (!step.when || ev(step.when, 'when')) return build(step.return, scope, budget, `${where} return`);
    } else if ('call' in step) {
      if (!step.when || ev(step.when, 'when')) return runEntry(ctx.model, step.call, ctx.inputs, budget);
    } else if ('fail' in step) {
      if (!step.when || ev(step.when, 'when')) { const e = new Error(`${step.fail}`); e.code = step.fail; throw e; }
    } else throw new ExprError(`${where}: unknown step`);
  }
  return null;
}

function entryOf(model, name) {
  if (name === 'rate' && model.steps) return model;
  const e = model.entries?.[name];
  if (!e) throw new ExprError(`Model has no entry "${name}"`);
  return e;
}

function runEntry(model, name, inputs, budget = { steps: 0 }) {
  const entry = entryOf(model, name);
  const scope = { vars: { ...(model.constants || {}), ...inputs }, parent: null };
  const errors = [];
  const early = exec(entry.steps || [], scope, errors, budget, `${name}.steps`, { model, inputs });
  if (early) return early;
  if (errors.length) return { valid: false, errors };
  return build(entry.output || {}, scope, budget, `${name}.output`);
}

/**
 * Runs a model entry (default "rate"); returns the rater result (valid / quotable / breakdown / facts ...).
 * Models may define several entries (e.g. "certificate" for open-cover certificates); a { "call": "entry" }
 * step hands over to another entry with the same inputs.
 */
function run(model, inputs, entry = 'rate') {
  return runEntry(model, entry, inputs);
}

/** Parses every expression in a model; returns a list of problems (empty when valid). */
function validate(model) {
  const problems = [];
  const tryExpr = (src, where) => { try { compile(src); } catch (e) { problems.push(`${where}: ${e.message}`); } };
  const walk = (steps, path) => (steps || []).forEach((s, n) => {
    const w = `${path}[${n}]`;
    if ('set' in s) tryExpr(s.expr, `${w} set ${s.set}`);
    else if ('each' in s) { tryExpr(s.each, `${w} each`); walk(s.steps, `${w}.steps`); }
    else if ('error' in s || 'fail' in s || 'return' in s) {
      if (s.when) tryExpr(s.when, `${w} when`);
      if (s.field) tryExpr(s.field, `${w} field`);
      if (s.return) Object.entries(s.return).forEach(([k, v]) => tryExpr(v, `${w} return ${k}`));
    } else if ('call' in s) {
      if (s.when) tryExpr(s.when, `${w} when`);
      if (s.call !== 'rate' && !model.entries?.[s.call]) problems.push(`${w}: calls unknown entry "${s.call}"`);
    } else if (!('checkpoint' in s)) problems.push(`${w}: unknown step`);
  });
  if (!model || typeof model !== 'object') return ['Model must be an object'];
  if (!model.steps && !model.entries?.rate) problems.push('Model needs "steps" or an "entries.rate"');
  walk(model.steps, 'steps');
  Object.entries(model.output || {}).forEach(([k, v]) => tryExpr(v, `output ${k}`));
  Object.entries(model.entries || {}).forEach(([name, e]) => {
    walk(e.steps, `${name}.steps`);
    Object.entries(e.output || {}).forEach(([k, v]) => tryExpr(v, `${name}.output ${k}`));
  });
  (model.prepare || []).forEach((p, n) => {
    if (!PROVIDERS[p.provider]) problems.push(`prepare[${n}]: unknown provider "${p.provider}"`);
    if (p.when) tryExpr(p.when, `prepare[${n}] when`);
    if (p.arg) tryExpr(p.arg, `prepare[${n}] arg`);
  });
  return problems;
}

/** Lookups a model can ask for before rating (results arrive as context.<as>). */
const PROVIDERS = {
  vessel: (integrations, arg) => integrations.vessels.lookup(arg || {}),
  natcatZone: (integrations, arg) => integrations.geo.zoneFor(arg || {}),
  permitVerified: async (integrations, arg) => (await integrations.permits.verify(arg || {})).verified,
};

async function prepare(model, risk, integrations) {
  const out = {};
  await Promise.all((model.prepare || []).map(async (p) => {
    if (p.when && !evaluate(compile(p.when), { vars: { risk }, parent: null })) return;
    const arg = p.arg ? evaluate(compile(p.arg), { vars: { risk }, parent: null }) : undefined;
    out[p.as] = await PROVIDERS[p.provider](integrations, arg);
  }));
  return out;
}

module.exports = { run, validate, prepare, PROVIDERS: Object.keys(PROVIDERS) };
