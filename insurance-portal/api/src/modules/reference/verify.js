const express = require('express');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');

const router = express.Router();

/** Public check behind the QR code on every document. Shows only what a landlord or bank needs. */
router.get('/:policyNo', asyncHandler(async (req, res) => {
  const p = await db('policies').join('customers', 'customers.id', 'policies.customer_id').join('products', 'products.code', 'policies.product_code')
    .where('policies.policy_no', req.params.policyNo)
    .select('policies.policy_no', 'policies.status', 'policies.inception_date', 'policies.expiry_date', 'customers.company_name', 'products.name_en', 'products.name_ar').first();
  if (!p) return res.status(404).json({ valid: false });
  return res.json({ valid: p.status === 'active', policyNo: p.policy_no, status: p.status, insured: p.company_name, product: { en: p.name_en, ar: p.name_ar }, inceptionDate: p.inception_date, expiryDate: p.expiry_date });
}));

module.exports = router;
