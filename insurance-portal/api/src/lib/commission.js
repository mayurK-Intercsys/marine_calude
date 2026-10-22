/** Commission rate from the most specific active scheme (broker > tier; product; country; transaction), else the broker's default. */
async function rateFor(conn, { broker, productCode, countryCode, transaction, date }) {
  const day = date || new Date().toISOString().slice(0, 10);
  const rows = await conn('commission_schemes').where({ active: true }).andWhere('effective_from', '<=', day)
    .andWhere((q) => q.whereNull('effective_to').orWhere('effective_to', '>=', day));
  const score = (s) => {
    if ((s.broker_id && s.broker_id !== broker.id) || (s.broker_tier && s.broker_tier !== broker.tier) || (s.product_code && s.product_code !== productCode)
      || (s.country_code && s.country_code !== countryCode) || (Array.isArray(s.transactions) && s.transactions.length && !s.transactions.includes(transaction))) return -1;
    return (s.broker_id ? 8 : 0) + (s.broker_tier ? 4 : 0) + (s.product_code ? 2 : 0) + (s.country_code ? 1 : 0);
  };
  const best = rows.map((s) => ({ s, sc: score(s) })).filter((x) => x.sc >= 0).sort((a, b) => b.sc - a.sc || b.s.id - a.s.id)[0];
  return best ? { rate: Number(best.s.rate), schemeId: best.s.id } : { rate: Number(broker.commission_rate), schemeId: null };
}

module.exports = { rateFor };
