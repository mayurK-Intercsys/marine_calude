const { forbidden } = require('./errors');

/**
 * Who may see a quote: the anonymous holder of its resume token, its customer,
 * the broker firm that owns it, its creator, or insurer staff.
 */
function canAccessQuote(user, quote, token) {
  if (token && token === quote.resume_token) return true;
  if (!user) return false;
  if (user.isStaff) return true;
  if (quote.created_by && quote.created_by === user.id) return true;
  if (user.role === 'customer' && user.customerId && quote.customer_id === user.customerId) return true;
  if (user.isBroker && quote.broker_id && quote.broker_id === user.brokerId) return true;
  return false;
}

function assertQuoteAccess(user, quote, token) {
  if (!canAccessQuote(user, quote, token)) throw forbidden('QUOTE_ACCESS_DENIED');
}

function canAccessPolicy(user, policy) {
  if (!user) return false;
  if (user.isApi) return user.apiPolicyId === policy.id;
  if (user.isStaff) return true;
  if (user.role === 'customer') return user.customerId === policy.customer_id;
  if (user.isBroker) return policy.broker_id === user.brokerId;
  return false;
}

function assertPolicyAccess(user, policy) {
  if (!canAccessPolicy(user, policy)) throw forbidden('POLICY_ACCESS_DENIED');
}

module.exports = { canAccessQuote, assertQuoteAccess, canAccessPolicy, assertPolicyAccess };
