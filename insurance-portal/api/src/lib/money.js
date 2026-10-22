/** Round half away from zero to the currency's decimal places (AED 2, OMR/BHD/KWD 3). */
function round(value, decimals = 2) {
  const n = Number(value) || 0;
  const factor = 10 ** decimals;
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * factor) / factor;
}

module.exports = { round };
