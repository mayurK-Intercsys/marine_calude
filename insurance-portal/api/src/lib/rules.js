/**
 * Tiny rule evaluator for configurable referral rules.
 * A condition is { all: [...] }, { any: [...] } or { fact, op, value }.
 */
const OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  truthy: (a) => Boolean(a),
};

function evaluate(condition, facts) {
  if (!condition || typeof condition !== 'object') return false;
  if (Array.isArray(condition.all)) return condition.all.every((c) => evaluate(c, facts));
  if (Array.isArray(condition.any)) return condition.any.some((c) => evaluate(c, facts));
  const op = OPS[condition.op];
  if (!op) throw new Error(`Unknown rule operator: ${condition.op}`);
  return op(facts[condition.fact], condition.value);
}

/** Returns the rules whose condition matches, as reasons shown to users and underwriters. */
function matchRules(rules, facts) {
  return rules
    .filter((r) => evaluate(r.condition, facts))
    .map((r) => ({ code: r.code, description: { en: r.description_en, ar: r.description_ar } }));
}

module.exports = { evaluate, matchRules };
