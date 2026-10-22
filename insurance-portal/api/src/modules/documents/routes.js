/**
 * Document upload (/api/documents): files attached to quotes, policies, claims, referrals and
 * surveys, with type and size limits (System parameters), content sniffing, virus scanning,
 * a required-documents checklist (Admin → Document requirements) and staff review.
 */
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requirePermission } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { audit } = require('../../lib/audit');
const params = require('../../lib/params');
const storage = require('../../lib/storage');
const integrations = require('../../integrations');
const ruleEngine = require('../../lib/ruleEngine');
const { emit } = require('../../lib/messaging');
const { AppError, badRequest, forbidden, notFound } = require('../../lib/errors');

const router = express.Router();
router.use(requireAuth);

/** The real type from the first bytes; the file name and browser-supplied type are not trusted. */
function sniff(buf) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

const canSeeQuote = (user, q) => user.isStaff || (user.role === 'customer' && q.customer_id && q.customer_id === user.customerId) || (user.isBroker && q.broker_id === user.brokerId);

/** Resolves the record a document belongs to, checks access, and gives what the checklist needs. */
async function target(user, entity, id) {
  if (entity === 'policy') {
    const policy = await db('policies').where({ id }).first();
    if (!policy) throw notFound('POLICY_NOT_FOUND');
    assertPolicyAccess(user, policy);
    return { productCode: policy.product_code, reference: policy.policy_no, event: 'policy', facts: policy.risk_data };
  }
  if (entity === 'claim') {
    const claim = await db('claims').where({ id }).first();
    if (!claim) throw notFound('CLAIM_NOT_FOUND');
    const policy = await db('policies').where({ id: claim.policy_id }).first();
    assertPolicyAccess(user, policy);
    return { productCode: policy.product_code, reference: claim.claim_no, event: 'claim', facts: { ...policy.risk_data, cause: claim.cause, ...(claim.data || {}) } };
  }
  if (entity === 'quote' || entity === 'referral') {
    let quote;
    if (entity === 'referral') {
      const ref = await db('referrals').where({ id }).first();
      if (!ref) throw notFound('REFERRAL_NOT_FOUND');
      if (!ref.quote_id) {
        if (!user.isStaff) throw forbidden();
        return { productCode: null, reference: `REF-${ref.id}`, event: 'referral', facts: {} };
      }
      quote = await db('quotes').where({ id: ref.quote_id }).first();
    } else quote = await db('quotes').where({ id }).first();
    if (!quote) throw notFound('QUOTE_NOT_FOUND');
    if (!canSeeQuote(user, quote)) throw forbidden();
    // A referral's documents are the quote's documents, so customer and underwriter see the same files.
    return { productCode: quote.product_code, reference: quote.ref, event: 'referral', facts: { ...(quote.risk_data || {}), ...(quote.rating?.facts || {}) }, canonical: { entity: 'quote', id: quote.id } };
  }
  if (entity === 'survey') {
    if (!user.isStaff) throw forbidden();
    const s = await db('surveys').where({ id }).first();
    if (!s) throw notFound('SURVEY_NOT_FOUND');
    return { productCode: null, reference: `SURVEY-${s.id}`, event: 'survey', facts: {} };
  }
  throw badRequest('ENTITY_INVALID');
}

async function labels() {
  const rows = await db('lookup_values').where({ list_code: 'GLOBAL.documentTypes' });
  return Object.fromEntries(rows.map((r) => [r.code, { en: r.label_en, ar: r.label_ar }]));
}

const view = (d, names) => ({ id: d.id, docType: d.doc_type, docTypeName: names[d.doc_type] || { en: d.doc_type, ar: d.doc_type }, fileName: d.file_name, mime: d.mime, size: d.size, status: d.status, reviewNote: d.review_note, uploadedBy: d.uploaded_by, createdAt: d.created_at });

async function checklist(t, docs, names) {
  const reqs = await db('document_requirements').where({ event: t.event, active: true }).andWhere((q) => q.whereNull('product_code').orWhere('product_code', t.productCode || '')).orderBy('sort');
  return reqs.filter((r) => ruleEngine.conditionMet(r.condition, t.facts)).map((r) => {
    const mine = docs.filter((d) => d.doc_type === r.doc_type && d.status !== 'rejected');
    return { docType: r.doc_type, name: names[r.doc_type] || { en: r.doc_type, ar: r.doc_type }, note: { en: r.note_en, ar: r.note_ar }, mandatory: Boolean(r.mandatory), provided: mine.length > 0, verified: mine.some((d) => d.status === 'verified') };
  });
}

router.get('/', asyncHandler(async (req, res) => {
  const { entity, entityId } = z.object({ entity: z.enum(['quote', 'policy', 'claim', 'referral', 'survey']), entityId: z.coerce.number().int().positive() }).parse(req.query);
  const t = await target(req.user, entity, entityId);
  const c = t.canonical || { entity, id: entityId };
  const docs = await db('documents').where({ entity: c.entity, entity_id: c.id }).whereNull('deleted_at').orderBy('id');
  const names = await labels();
  const list = await checklist(t, docs, names);
  res.json({ documents: docs.map((d) => view(d, names)), checklist: list, complete: list.every((c) => !c.mandatory || c.provided), types: Object.entries(names).map(([code, name]) => ({ code, name })) });
}));

router.post('/', asyncHandler(async (req, res, next) => {
  const maxMb = Number(await params.get('documents.maxSizeMb', 10));
  multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(1, Math.floor(maxMb * 1024 * 1024)), files: 1, fields: 10 } }).single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', `Files can be up to ${maxMb} MB`));
    if (err) return next(badRequest('UPLOAD_FAILED', err.message));
    return next();
  });
}), asyncHandler(async (req, res) => {
  const b = z.object({ entity: z.enum(['quote', 'policy', 'claim', 'referral', 'survey']), entityId: z.coerce.number().int().positive(), docType: z.string().min(2).max(60) }).parse(req.body);
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const t = await target(req.user, b.entity, b.entityId);
  const names = await labels();
  if (!names[b.docType]) throw badRequest('DOC_TYPE_UNKNOWN');
  const mime = sniff(req.file.buffer);
  const allowed = await params.get('documents.allowedTypes', ['application/pdf', 'image/jpeg', 'image/png']);
  if (!mime || !allowed.includes(mime)) throw new AppError(415, 'FILE_TYPE_NOT_ALLOWED', 'Upload a PDF, JPEG or PNG file');
  const scan = await integrations.antivirus.scan(req.file.buffer);
  if (!scan.clean) throw new AppError(422, 'FILE_INFECTED', 'The file failed the virus check');
  const c = t.canonical || { entity: b.entity, id: b.entityId };
  const key = await storage.put(req.file.buffer);
  const safeName = String(req.file.originalname || 'document').replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  const [id] = await db('documents').insert({
    entity: c.entity, entity_id: c.id, doc_type: b.docType, file_name: safeName, mime, size: req.file.size,
    sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), storage_key: key, uploaded_by: req.user.id,
  });
  await audit(db, { userId: req.user.id, action: 'document.upload', entity: b.entity, entityId: b.entityId, data: { documentId: id, docType: b.docType, size: req.file.size } });
  if (!req.user.isStaff) await emit('document.uploaded', { entity: 'document', entityId: id, data: { reference: t.reference, docType: names[b.docType].en } });
  res.status(201).json({ document: view(await db('documents').where({ id }).first(), names) });
}));

async function loadDoc(req) {
  const d = await db('documents').where({ id: Number(req.params.id) }).whereNull('deleted_at').first();
  if (!d) throw notFound('DOCUMENT_NOT_FOUND');
  await target(req.user, d.entity, d.entity_id);
  return d;
}

router.get('/:id/download', asyncHandler(async (req, res) => {
  const d = await loadDoc(req);
  const buf = await storage.get(d.storage_key);
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${d.file_name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  res.send(buf);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const d = await loadDoc(req);
  const reviewer = req.user.permissions?.includes('documents.review');
  if (!reviewer && (d.uploaded_by !== req.user.id || d.status !== 'uploaded')) throw forbidden('DOCUMENT_LOCKED', 'Documents can be removed by the person who uploaded them until they are reviewed');
  await db('documents').where({ id: d.id }).update({ deleted_at: new Date() });
  await audit(db, { userId: req.user.id, action: 'document.delete', entity: d.entity, entityId: d.entity_id, data: { documentId: d.id } });
  res.json({ ok: true });
}));

router.post('/:id/review', requirePermission('documents.review'), asyncHandler(async (req, res) => {
  const d = await loadDoc(req);
  const b = z.object({ status: z.enum(['verified', 'rejected']), note: z.string().max(300).optional() }).parse(req.body);
  await db('documents').where({ id: d.id }).update({ status: b.status, review_note: b.note || null, reviewed_by: req.user.id });
  await audit(db, { userId: req.user.id, action: `document.${b.status}`, entity: d.entity, entityId: d.entity_id, data: { documentId: d.id } });
  res.json({ ok: true });
}));

module.exports = router;
