/** Risk-data schemas by product line. */
const schemas = {
  fire: require('./fire/schema').riskSchema,
  marine: require('./marine/schema').riskSchema,
  wc: require('./wc/schema').riskSchema,
  engineering: require('./engineering/schema').riskSchema,
};

module.exports = { riskSchemaFor: (line) => schemas[line] };
