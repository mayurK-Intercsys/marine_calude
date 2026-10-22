/**
 * Rule engine. Published rule sets (per product and purpose) hold:
 *  - rules: condition (JSON condition or expression) -> action: refer | decline | message | set
 *  - decision tables: inputs (expressions) and rows of cells; a cell is "-" (any), a comparison
 *    ("> 5000000", "<= 2", "in ['a','b']", "!= 'x'") or a value ("'light'", "true", "3"); the
 *    matching row's outcome is applied (hit policy "first" or "collect")
 * Facts are the rating facts plus risk fields. Values set by rules are visible to later rules.
 */
const { db } = require('../db');
const expr = require('./expr');
const legacy = require('./rules');

function conditionMet(condition, facts) {
  if (condition === null || condition === undefined || condition === true) return true;
  if (typeof condition === 'string') return Boolean(expr.run(condition, facts));
  if (typeof condition === 'object' && condition.expr) return Boolean(expr.run(condition.expr, facts));
  return legacy.evaluate(condition, facts);
}

function cellMatches(cell, value) {
  const c = String(cell ?? '').trim();
  if (c === '' || c === '-' || c === '*') return true;
  const src = /^(<=|>=|==|!=|<|>|in\s)/.test(c) ? `$ ${c}` : `$ == (${c})`;
  return Boolean(expr.run(src, { $: value }));
}

function apply(outcome, base, facts, result) {
  const action = outcome.action;
  const reason = { code: outcome.code || base.code, description: { en: outcome.name_en || base.name_en || outcome.code, ar: outcome.name_ar || base.name_ar || outcome.code } };
  if (action === 'refer') result.refer.push(reason);
  else if (action === 'decline') result.decline.push(reason);
  else if (action === 'message') result.messages.push(reason);
  else if (action === 'set') {
    const value = outcome.expr !== undefined ? expr.run(String(outcome.expr), facts) : outcome.value;
    facts[outcome.name] = value;
    result.values[outcome.name] = value;
  }
}

/** Runs one rule set's content (rules + decision tables) against facts. */
function runSet(set, rules, tables, inputFacts) {
  const facts = { ...inputFacts };
  const result = { refer: [], decline: [], messages: [], values: {}, fired: [] };
  const items = [
    ...rules.filter((r) => r.active).map((r) => ({ kind: 'rule', priority: r.priority, r })),
    ...tables.filter((t) => t.active).map((t) => ({ kind: 'table', priority: t.priority, t })),
  ].sort((a, b) => a.priority - b.priority);
  for (const it of items) {
    if (it.kind === 'rule') {
      const r = it.r;
      if (!conditionMet(r.condition, facts)) continue;
      apply({ action: r.action, ...(r.params || {}) }, r, facts, result);
      result.fired.push(r.code);
      if (r.stop) break;
    } else {
      const t = it.t;
      const values = t.inputs.map((i) => expr.run(i.expr, facts));
      const hits = t.rows.filter((row) => row.when.every((cell, n) => cellMatches(cell, values[n])));
      for (const row of t.hit_policy === 'first' ? hits.slice(0, 1) : hits) {
        apply(row.then, { code: t.code, name_en: t.name, name_ar: t.name }, facts, result);
        result.fired.push(`${t.code}${row.label ? `:${row.label}` : ''}`);
      }
    }
  }
  return result;
}

async function contentOf(setId, conn = db) {
  const [rules, tables] = await Promise.all([
    conn('rules').where({ rule_set_id: setId }).orderBy('priority'),
    conn('decision_tables').where({ rule_set_id: setId }).orderBy('priority'),
  ]);
  return { rules, tables };
}

/** Published sets for a product and purpose (country-specific sets apply in addition to general ones). */
async function publishedSets(productCode, countryCode, purpose, conn = db) {
  return conn('rule_sets').where({ product_code: productCode, purpose, status: 'published' })
    .andWhere((q) => q.whereNull('country_code').orWhere('country_code', countryCode)).orderBy('id');
}

/** Evaluates all published rule sets for a product and purpose; merges their outcomes. */
async function run({ productCode, countryCode, purpose = 'underwriting', facts }, conn = db) {
  const merged = { refer: [], decline: [], messages: [], values: {}, fired: [], sets: [] };
  for (const set of await publishedSets(productCode, countryCode, purpose, conn)) {
    // eslint-disable-next-line no-await-in-loop
    const { rules, tables } = await contentOf(set.id, conn);
    const r = runSet(set, rules, tables, { ...facts, ...merged.values });
    merged.refer.push(...r.refer);
    merged.decline.push(...r.decline);
    merged.messages.push(...r.messages);
    Object.assign(merged.values, r.values);
    merged.fired.push(...r.fired);
    merged.sets.push({ id: set.id, code: set.code, version: set.version });
  }
  const seen = new Set();
  merged.refer = merged.refer.filter((x) => (seen.has(x.code) ? false : seen.add(x.code)));
  return merged;
}

/** Checks a condition or cell expression parses (for admin validation). */
function checkCondition(condition) {
  if (typeof condition === 'string') expr.check(condition);
  else if (condition && typeof condition === 'object' && condition.expr) expr.check(condition.expr);
  else if (condition && typeof condition === 'object') legacy.evaluate(condition, {});
}

module.exports = { run, runSet, contentOf, conditionMet, cellMatches, checkCondition };
