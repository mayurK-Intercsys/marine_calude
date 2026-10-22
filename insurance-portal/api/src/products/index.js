/** Product raters by products.rater. WC and Engineering raters are added in later phases. */
const raters = {
  fire: require('./fire/rater'),
  marine: require('./marine/rater'),
  wc: require('./wc/rater'),
  engineering: require('./engineering/rater'),
};

function getRater(name) {
  const rater = raters[name];
  if (!rater) {
    const err = new Error(`No rater registered for ${name}`);
    err.code = 'RATER_NOT_AVAILABLE';
    throw err;
  }
  return rater;
}

module.exports = { getRater };
