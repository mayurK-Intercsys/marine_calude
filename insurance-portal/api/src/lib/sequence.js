/** Gap-free, concurrency-safe counters (policy, quote, claim numbers). Call inside a transaction. */
async function nextValue(trx, name) {
  const row = await trx('sequences').where({ name }).forUpdate().first();
  if (!row) {
    await trx('sequences').insert({ name, next_val: 2 });
    return 1;
  }
  await trx('sequences').where({ name }).update({ next_val: row.next_val + 1 });
  return Number(row.next_val);
}

const pad = (n, width = 6) => String(n).padStart(width, '0');

module.exports = { nextValue, pad };
