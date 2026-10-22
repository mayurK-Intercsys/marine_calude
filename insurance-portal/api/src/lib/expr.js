/**
 * Expression language for configurable rules and rating models.
 *
 * Safe by construction: expressions are parsed into a tree and interpreted; there is no access to
 * JavaScript, globals or prototypes, only to the variables supplied and the built-in functions below.
 * Evaluation is bounded (steps and collection sizes) so a bad expression cannot hang the server.
 *
 *   Literals      12  1.5  'text'  "text"  true  false  null  [1, 2]  {a: 1, 'b': x}
 *   Access        risk.locations[0].sumsInsured.STK   (null-safe: missing parts give null)
 *   Operators     + - * / %   == != (strict)   < <= > >=   in   && || ?? !   cond ? a : b
 *   Functions     see BUILTINS; collection functions take an expression evaluated per item,
 *                 with `item` and `index` available: sum(locations, item.si), any(list, item > 3)
 */
const { round } = require('./money');

class ExprError extends Error {
  constructor(message, code = 'EXPRESSION_ERROR') {
    super(message);
    this.code = code;
  }
}

const MAX_STEPS = 2000000;
const MAX_LIST = 20000;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/* ---------------- tokenizer ---------------- */
const PUNCT = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '.', ',', '(', ')', '[', ']', '{', '}'];

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; } else { s += src[j]; j += 1; }
      }
      if (j >= src.length) throw new ExprError('Unterminated string');
      tokens.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i));
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw new ExprError(`Unexpected character "${c}"`);
    tokens.push({ t: 'op', v: p });
    i += p.length;
  }
  tokens.push({ t: 'eof' });
  return tokens;
}

/* ---------------- parser (precedence climbing) ---------------- */
function parse(src) {
  const tokens = tokenize(String(src));
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++]; // eslint-disable-line no-plusplus
  const isOp = (v) => peek().t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new ExprError(`Expected "${v}"`); next(); };

  const BIN = [['??'], ['||'], ['&&'], ['==', '!=', '===', '!=='], ['<', '<=', '>', '>=', 'in'], ['+', '-'], ['*', '/', '%']];

  function expression() {
    const cond = binary(0);
    if (isOp('?')) {
      next();
      const a = expression();
      expect(':');
      const b = expression();
      return { k: 'cond', cond, a, b };
    }
    return cond;
  }
  function binary(level) {
    if (level >= BIN.length) return unary();
    let left = binary(level + 1);
    for (;;) {
      const tok = peek();
      const op = tok.t === 'op' || (tok.t === 'id' && tok.v === 'in') ? tok.v : null;
      if (!op || !BIN[level].includes(op)) return left;
      next();
      left = { k: 'bin', op, left, right: binary(level + 1) };
    }
  }
  function unary() {
    if (isOp('!') || isOp('-') || isOp('+')) { const op = next().v; return { k: 'un', op, arg: unary() }; }
    return postfix(primary());
  }
  function postfix(node) {
    let n = node;
    for (;;) {
      if (isOp('.')) {
        next();
        const id = next();
        if (id.t !== 'id') throw new ExprError('Expected a property name');
        n = { k: 'get', obj: n, key: { k: 'lit', v: id.v } };
      } else if (isOp('[')) {
        next();
        const key = expression();
        expect(']');
        n = { k: 'get', obj: n, key };
      } else return n;
    }
  }
  function args() {
    const list = [];
    if (!isOp(')')) { do { list.push(expression()); } while (isOp(',') && next()); }
    expect(')');
    return list;
  }
  function primary() {
    const tok = next();
    if (tok.t === 'num' || tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true') return { k: 'lit', v: true };
      if (tok.v === 'false') return { k: 'lit', v: false };
      if (tok.v === 'null') return { k: 'lit', v: null };
      if (tok.v === 'undefined') return { k: 'lit', v: undefined };
      if (isOp('(')) {
        next();
        if (!BUILTINS[tok.v] && !LAZY[tok.v]) throw new ExprError(`Unknown function "${tok.v}"`);
        return { k: 'call', fn: tok.v, args: args() };
      }
      return { k: 'var', name: tok.v };
    }
    if (tok.t === 'op' && tok.v === '(') { const e = expression(); expect(')'); return e; }
    if (tok.t === 'op' && tok.v === '[') {
      const items = [];
      if (!isOp(']')) { do { items.push(expression()); } while (isOp(',') && next()); }
      expect(']');
      return { k: 'arr', items };
    }
    if (tok.t === 'op' && tok.v === '{') {
      const props = [];
      if (!isOp('}')) {
        do {
          const key = next();
          if (key.t !== 'id' && key.t !== 'str') throw new ExprError('Expected a property name');
          if (FORBIDDEN.has(key.v)) throw new ExprError('Property not allowed');
          expect(':');
          props.push([key.v, expression()]);
        } while (isOp(',') && next());
      }
      expect('}');
      return { k: 'obj', props };
    }
    throw new ExprError(tok.t === 'eof' ? 'Unexpected end of expression' : `Unexpected "${tok.v}"`);
  }

  const ast = expression();
  if (peek().t !== 'eof') throw new ExprError(`Unexpected "${peek().v}"`);
  return ast;
}

/* ---------------- evaluation ---------------- */
const num = (v) => Number(v) || 0;
const isNil = (v) => v === null || v === undefined;

function siteKey(address) {
  const a = address || {};
  return [a.building, a.area, a.city].map((p) => String(p || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonthsIso(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function monthsBetween(a, b) {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  let m = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
  if (d2.getUTCDate() > d1.getUTCDate()) m += 1;
  return Math.max(1, m);
}

const asList = (v) => {
  if (isNil(v)) return [];
  if (!Array.isArray(v)) throw new ExprError('Expected a list');
  if (v.length > MAX_LIST) throw new ExprError('List too long');
  return v;
};

/** Eager functions: arguments are evaluated first. */
const BUILTINS = {
  min: (...a) => Math.min(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map(Number)),
  max: (...a) => Math.max(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map(Number)),
  round: (x, d = 0) => round(x, d),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
  num,
  pos: (x) => Math.max(0, num(x)),
  str: (x) => (isNil(x) ? '' : String(x)),
  upper: (x) => String(x ?? '').toUpperCase(),
  lower: (x) => String(x ?? '').toLowerCase(),
  len: (x) => (isNil(x) ? 0 : x.length ?? Object.keys(x).length),
  includes: (list, v) => Array.isArray(list) && list.includes(v),
  has: (obj, key) => !isNil(obj) && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key),
  keys: (obj) => (isNil(obj) ? [] : Object.keys(obj)),
  values: (obj) => (isNil(obj) ? [] : Object.values(obj)),
  coalesce: (...a) => a.find((v) => !isNil(v)) ?? null,
  /** Table lookup that fails loudly when the key is missing (a configuration error). */
  lookup: (obj, key, name) => {
    if (isNil(obj) || !Object.prototype.hasOwnProperty.call(obj, key)) throw new ExprError(`Missing ${name || 'table'} factor for "${key}"`, 'RATING_FACTOR_MISSING');
    return obj[key];
  },
  /** Banded value: first band whose `upTo` is null or >= value; returns its `field` (default factor). */
  band: (bands, value, field = 'factor', limit = 'upTo', fallback = 1) => {
    const b = asList(bands).find((x) => isNil(x[limit]) || value <= x[limit]);
    return b ? b[field] : fallback;
  },
  /** Sum of the non-negative numeric values of the given keys of an object. */
  sumValues: (obj, keys) => asList(keys).reduce((s, k) => s + Math.max(0, num(obj?.[k])), 0),
  siteKey,
  today: () => new Date().toISOString().slice(0, 10),
  addDays: addDaysIso,
  addMonths: addMonthsIso,
  annualExpiry: (iso) => addDaysIso(addMonthsIso(iso, 12), -1),
  daysBetween: (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000),
  daysInclusive: (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1,
  monthsBetween,
  year: (iso) => Number(String(iso || '').slice(0, 4)),
  fixed: (x, d) => Number(Number(x).toFixed(d)),
  merge: (...objs) => Object.assign({}, ...objs.filter((o) => o && typeof o === 'object')),
};

/** Lazy functions: they receive the unevaluated arguments. */
const LAZY = {
  if: (args, scope, ev) => (ev(args[0], scope) ? ev(args[1], scope) : (args[2] ? ev(args[2], scope) : null)),
  sum: (args, scope, ev) => each(args, scope, ev).reduce((s, v) => s + Number(v), 0),
  count: (args, scope, ev) => (args[1] ? each(args, scope, ev).filter(Boolean).length : asList(ev(args[0], scope)).length),
  any: (args, scope, ev) => perItem(args, scope, ev, (list, f) => list.some(f)),
  all: (args, scope, ev) => perItem(args, scope, ev, (list, f) => list.every(f)),
  map: (args, scope, ev) => each(args, scope, ev),
  filter: (args, scope, ev) => perItem(args, scope, ev, (list, f) => list.filter(f)),
  find: (args, scope, ev) => perItem(args, scope, ev, (list, f) => list.find(f)) ?? null,
  max_of: (args, scope, ev) => Math.max(...each(args, scope, ev).map(Number)),
  min_of: (args, scope, ev) => Math.min(...each(args, scope, ev).map(Number)),
  product: (args, scope, ev) => each(args, scope, ev).reduce((p, v) => p * Number(v), args[2] ? ev(args[2], scope) : 1),
  /** Groups a list by a key (first-seen order): [{ key, items }]. */
  group: (args, scope, ev) => {
    const out = [];
    const index = new Map();
    asList(ev(args[0], scope)).forEach((item, i) => {
      const key = ev(args[1], child(scope, { item, index: i }));
      if (!index.has(key)) { index.set(key, out.length); out.push({ key, items: [] }); }
      out[index.get(key)].items.push(item);
    });
    return out;
  },
};

function child(scope, vars) { return { vars, parent: scope }; }
function perItem(args, scope, ev, fn) {
  const list = asList(ev(args[0], scope));
  return fn(list, (item, index) => ev(args[1], child(scope, { item, index })));
}
function each(args, scope, ev) {
  const list = asList(ev(args[0], scope));
  return list.map((item, index) => ev(args[1], child(scope, { item, index })));
}

function lookupVar(scope, name) {
  for (let s = scope; s; s = s.parent) if (Object.prototype.hasOwnProperty.call(s.vars, name)) return s.vars[name];
  return undefined;
}

function evaluate(ast, scope, budget = { steps: 0 }) {
  const ev = (node, sc) => {
    budget.steps += 1;
    if (budget.steps > MAX_STEPS) throw new ExprError('Expression too expensive', 'EXPRESSION_LIMIT');
    switch (node.k) {
      case 'lit': return node.v;
      case 'var': return lookupVar(sc, node.name);
      case 'arr': return node.items.map((x) => ev(x, sc));
      case 'obj': return Object.fromEntries(node.props.map(([k, v]) => [k, ev(v, sc)]));
      case 'get': {
        const obj = ev(node.obj, sc);
        const key = ev(node.key, sc);
        if (isNil(obj)) return undefined;
        if (FORBIDDEN.has(String(key))) throw new ExprError('Property not allowed');
        if (typeof obj !== 'object' && typeof obj !== 'string') return undefined;
        return Object.prototype.hasOwnProperty.call(obj, key) || (typeof obj === 'string' && key === 'length') || (Array.isArray(obj) && key === 'length') ? obj[key] : undefined;
      }
      case 'un': {
        const v = ev(node.arg, sc);
        if (node.op === '!') return !v;
        if (node.op === '-') return -v;
        return +v;
      }
      case 'cond': return ev(node.cond, sc) ? ev(node.a, sc) : ev(node.b, sc);
      case 'bin': {
        if (node.op === '&&') { const l = ev(node.left, sc); return l ? ev(node.right, sc) : l; }
        if (node.op === '||') { const l = ev(node.left, sc); return l || ev(node.right, sc); }
        if (node.op === '??') { const l = ev(node.left, sc); return isNil(l) ? ev(node.right, sc) : l; }
        const l = ev(node.left, sc);
        const r = ev(node.right, sc);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '%': return l % r;
          case '==': case '===': return l === r || (isNil(l) && isNil(r));
          case '!=': case '!==': return !(l === r || (isNil(l) && isNil(r)));
          case '<': return l < r;
          case '<=': return l <= r;
          case '>': return l > r;
          case '>=': return l >= r;
          case 'in': return Array.isArray(r) ? r.includes(l) : (!isNil(r) && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, l));
          default: throw new ExprError(`Unknown operator ${node.op}`);
        }
      }
      case 'call': {
        if (LAZY[node.fn]) return LAZY[node.fn](node.args, sc, ev);
        return BUILTINS[node.fn](...node.args.map((a) => ev(a, sc)));
      }
      default: throw new ExprError('Bad expression');
    }
  };
  return ev(ast, scope);
}

const cache = new Map();
function compile(src) {
  const key = String(src);
  if (!cache.has(key)) {
    if (cache.size > 5000) cache.clear();
    cache.set(key, parse(key));
  }
  return cache.get(key);
}

/** Evaluates an expression string against plain variables (or a scope from child()). */
function run(src, vars = {}, budget) {
  const scope = vars && vars.vars && 'parent' in vars ? vars : { vars, parent: null };
  return evaluate(compile(src), scope, budget);
}

/** Throws ExprError if the expression does not parse. */
function check(src) { compile(src); return true; }

module.exports = { run, check, compile, evaluate, child, ExprError, BUILTINS: Object.keys(BUILTINS), LAZY: Object.keys(LAZY), siteKey };
