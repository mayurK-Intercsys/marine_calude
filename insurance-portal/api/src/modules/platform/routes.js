/**
 * Admin module API (/api/platform). Each configuration entity is described once in ENTITIES
 * (table, columns, privilege); the admin screens render lists and forms from this metadata.
 * Every change is validated, audited, and takes effect without a deployment.
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db, json } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requirePermission } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const params = require('../../lib/params');
const licence = require('../../lib/licenceState');
const { verify } = require('../../lib/licence');
const messaging = require('../../lib/messaging');
const { evaluate } = require('../../lib/rules');
const catalog = require('../../lib/catalog');
const { badRequest, conflict, notFound, forbidden } = require('../../lib/errors');

const router = express.Router();
router.use(requireAuth, requirePermission('admin.access'));

/** Fields the system needs; administrators may relabel them and add tooltips, but not hide them or make them optional. */
const CORE_FIELDS = {
  'common.details': ['companyName', 'tradeLicence', 'licenceExpiry', 'contactName', 'contactIdNo', 'email', 'mobile', 'inceptionDate'],
  'auth.login': ['email', 'password'],
};

const col = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });
const CHANNELS = ['email', 'sms', 'whatsapp', 'inapp'];

const ENTITIES = {
  lookupLists: {
    table: 'lookup_lists', key: 'code', label: 'Drop-down lists', permission: 'admin.lookups', order: 'code',
    columns: [col('code', 'Code', 'text', { required: true, createOnly: true }), col('name', 'Name', 'text', { required: true }), col('product_code', 'Product', 'text'), col('description', 'Description', 'textarea')],
  },
  lookupValues: {
    table: 'lookup_values', key: 'id', label: 'Drop-down values', permission: 'admin.lookups', order: ['list_code', 'sort'], filter: 'list_code',
    columns: [col('list_code', 'List', 'select', { required: true, optionsFrom: 'lookupLists' }), col('code', 'Code', 'text', { required: true }), col('label_en', 'Label (English)', 'text', { required: true }),
      col('label_ar', 'Label (Arabic)', 'text', { required: true }), col('parent_code', 'Parent (cascading)', 'text'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean'), col('attributes', 'Extra attributes', 'json')],
  },
  parameters: {
    table: 'system_parameters', key: 'key', label: 'System parameters', permission: 'admin.parameters', order: ['group', 'key'], filter: 'group',
    columns: [col('key', 'Key', 'text', { required: true, createOnly: true }), col('group', 'Group', 'text', { required: true }), col('type', 'Type', 'select', { options: ['string', 'number', 'boolean', 'json', 'secret'], required: true }),
      col('value', 'Value', 'json'), col('description', 'Description', 'textarea')],
    after: () => params.invalidate(),
  },
  numberFormats: {
    table: 'number_formats', key: 'id', label: 'Number formats', permission: 'admin.numbering', order: ['entity', 'id'],
    columns: [col('entity', 'Document', 'select', { options: ['quote', 'renewal_quote', 'policy', 'claim', 'endorsement', 'invoice', 'certificate'], required: true }), col('product_code', 'Product (blank = all)', 'text'),
      col('country_code', 'Country (blank = all)', 'text'), col('channel', 'Channel (b2c / b2b, blank = all)', 'text'), col('pattern', 'Pattern', 'text', { required: true, hint: 'Tokens: {COUNTRY} {LINE} {CHANNEL} {PRODUCT} {YYYY} {YY} {MM} {POLICY} {SEQ:6}' }),
      col('description', 'Description', 'text'), col('active', 'Active', 'boolean')],
    validate: (row) => { if (row.pattern && !/\{SEQ:\d+\}/.test(row.pattern)) throw badRequest('PATTERN_NEEDS_SEQ', 'Pattern must contain {SEQ:n}'); },
  },
  templates: {
    table: 'message_templates', key: 'id', label: 'Email and SMS templates', permission: 'admin.templates', order: ['code', 'channel', 'locale'], filter: 'code',
    columns: [col('code', 'Code', 'text', { required: true }), col('channel', 'Channel', 'select', { options: CHANNELS, required: true }), col('locale', 'Language', 'select', { options: ['en', 'ar'], required: true }),
      col('subject', 'Subject', 'text'), col('body', 'Body (use {{placeholders}})', 'textarea', { required: true }), col('active', 'Active', 'boolean')],
  },
  notificationRules: {
    table: 'notification_rules', key: 'id', label: 'Notification rules', permission: 'admin.notifications', order: ['event', 'id'], filter: 'event',
    columns: [col('event', 'Event', 'select', { required: true, options: ['quote.saved', 'referral.created', 'referral.decided', 'policy.issued', 'claim.registered', 'renewal.ready', 'renewal.reminder', 'autorenew.failed', 'invoice.due', 'declaration.due', 'payment.failed', 'survey.completed', 'opencover.turnover', 'document.uploaded'] }),
      col('channel', 'Channel', 'select', { options: CHANNELS, required: true }), col('recipient', 'Recipient', 'select', { options: ['customer', 'broker', 'underwriters', 'ops', 'custom'], required: true }),
      col('custom_to', 'Custom recipients (comma separated)', 'text'), col('template_code', 'Template code', 'text', { required: true }), col('description', 'Description', 'text'), col('active', 'Active', 'boolean')],
  },
  commissionSchemes: {
    table: 'commission_schemes', key: 'id', label: 'Commission schemes', permission: 'admin.commission', order: ['id'],
    columns: [col('name', 'Name', 'text', { required: true }), col('broker_id', 'Broker (blank = any)', 'select', { optionsFrom: 'brokers' }), col('broker_tier', 'Broker tier', 'select', { options: ['', 'standard', 'preferred'] }),
      col('product_code', 'Product (blank = all)', 'text'), col('country_code', 'Country (blank = all)', 'text'), col('transactions', 'Transactions (blank = all)', 'json', { hint: '["new_business","renewal","endorsement"]' }),
      col('rate', 'Rate (0.15 = 15%)', 'number', { required: true }), col('effective_from', 'From', 'date', { required: true }), col('effective_to', 'To', 'date'), col('active', 'Active', 'boolean')],
    validate: (row) => { if (row.rate != null && (Number(row.rate) < 0 || Number(row.rate) > 0.5)) throw badRequest('RATE_OUT_OF_RANGE', 'Commission rate must be between 0 and 0.5'); },
  },
  fieldDefinitions: {
    table: 'field_definitions', key: 'id', label: 'Field properties', permission: 'admin.fields', order: ['screen', 'sort'], filter: 'screen',
    columns: [col('screen', 'Screen', 'text', { required: true }), col('field_key', 'Field', 'text', { required: true }), col('label_en', 'Label (English)', 'text'), col('label_ar', 'Label (Arabic)', 'text'),
      col('tooltip_en', 'Tooltip (English)', 'textarea'), col('tooltip_ar', 'Tooltip (Arabic)', 'textarea'), col('placeholder_en', 'Placeholder (English)', 'text'), col('placeholder_ar', 'Placeholder (Arabic)', 'text'),
      col('field_type', 'Field type', 'select', { options: ['text', 'number', 'money', 'date', 'select', 'radio', 'checkbox', 'textarea', 'email', 'tel'] }), col('lookup_list', 'Drop-down list', 'select', { optionsFrom: 'lookupLists' }),
      col('visible', 'Visible', 'boolean'), col('mandatory', 'Mandatory', 'boolean'), col('readonly', 'Read only', 'boolean'), col('min_value', 'Minimum', 'number'), col('max_value', 'Maximum', 'number'),
      col('pattern', 'Pattern (regular expression)', 'text'), col('default_value', 'Default', 'text'), col('help_slug', 'Help article', 'text'), col('sort', 'Order', 'number')],
    validate: (row) => {
      if (row.pattern) { try { new RegExp(row.pattern); } catch (_e) { throw badRequest('PATTERN_INVALID'); } } // eslint-disable-line no-new
      const locked = CORE_FIELDS[row.screen]?.includes(row.field_key);
      if (locked && (row.visible === false || row.mandatory === false || row.visible === 0 || row.mandatory === 0)) throw badRequest('FIELD_LOCKED', 'This field is required by the system and must stay visible and mandatory');
    },
  },
  helpArticles: {
    table: 'help_articles', key: 'id', label: 'Help manual', permission: 'admin.help', order: ['sort'], filter: 'category',
    columns: [col('slug', 'Slug', 'text', { required: true }), col('category', 'Category', 'text', { required: true }), col('title_en', 'Title (English)', 'text', { required: true }), col('title_ar', 'Title (Arabic)', 'text', { required: true }),
      col('body_en', 'Body (English, Markdown)', 'textarea', { required: true }), col('body_ar', 'Body (Arabic, Markdown)', 'textarea', { required: true }), col('audience', 'Audience', 'json', { hint: '["customer","broker","staff"]' }),
      col('sort', 'Order', 'number'), col('published', 'Published', 'boolean')],
  },
  roles: {
    table: 'roles', key: 'id', label: 'Roles', permission: 'admin.roles', order: ['system', 'code'],
    columns: [col('code', 'Code', 'text', { required: true, createOnly: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('base_role', 'Based on', 'select', { required: true, createOnly: true, options: ['customer', 'broker_admin', 'broker_user', 'underwriter', 'uw_manager', 'config_admin', 'ops', 'risk_engineer'] }),
      col('description', 'Description', 'text'), col('active', 'Active', 'boolean'), col('system', 'Built-in', 'boolean', { readonly: true })],
    protect: (row) => { if (row.system) throw conflict('SYSTEM_ROLE', 'Built-in roles cannot be deleted'); },
  },
  lobs: {
    approval: true,
    table: 'lobs', key: 'code', label: 'Lines of business', permission: 'admin.products', order: 'sort',
    columns: [col('code', 'Code', 'text', { required: true, createOnly: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('description', 'Description', 'textarea'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean')],
  },
  products: {
    approval: true,
    table: 'products', key: 'code', label: 'Products', permission: 'admin.products', order: 'code', noCreate: true, noDelete: true,
    columns: [col('code', 'Code', 'text', { readonly: true }), col('line', 'Line of business', 'select', { optionsFrom: 'lobs', required: true }), col('name_en', 'Name (English)', 'text', { required: true }),
      col('name_ar', 'Name (Arabic)', 'text', { required: true }), col('description_en', 'Description (English)', 'textarea'), col('description_ar', 'Description (Arabic)', 'textarea'),
      col('status', 'Status', 'select', { options: ['draft', 'active', 'retired'], required: true }), col('effective_from', 'Effective from', 'date'), col('effective_to', 'Effective to', 'date'), col('rater', 'Rating engine', 'text', { readonly: true })],
  },
  productCovers: {
    approval: true,
    table: 'product_covers', key: 'id', label: 'Covers', permission: 'admin.products', order: ['product_code', 'sort'], filter: 'product_code',
    columns: [col('product_code', 'Product', 'select', { optionsFrom: 'products', required: true }), col('code', 'Code', 'text', { required: true }), col('cover_type', 'Type', 'select', { options: ['basic', 'optional', 'clause'], required: true }),
      col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }), col('description_en', 'Description (English)', 'textarea'), col('description_ar', 'Description (Arabic)', 'textarea'),
      col('pricing', 'Pricing', 'json', { hint: 'e.g. {"method":"loading","pct":0.1} · {"method":"rate_on_total","permille":0.1} · {"method":"per_head","amount":6} · {"method":"referral_only"}' }),
      col('attributes', 'Screen attributes', 'json', { hint: 'e.g. {"input":"rentSI"} · {"plans":["complete"]} · {"products":["CAR","EAR"]}' }), col('referral', 'Needs underwriter', 'boolean'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean')],
  },
  productDeductibles: {
    approval: true,
    table: 'product_deductibles', key: 'id', label: 'Deductibles', permission: 'admin.products', order: ['product_code', 'sort'], filter: 'product_code',
    columns: [col('product_code', 'Product', 'select', { optionsFrom: 'products', required: true }), col('code', 'Code', 'text', { required: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('detail_en', 'Detail (English)', 'text'), col('detail_ar', 'Detail (Arabic)', 'text'), col('deductible_type', 'Type', 'select', { options: ['fixed', 'percent_of_claim', 'percent_of_si', 'greater_of', 'days'], required: true }),
      col('amount', 'Amount', 'number'), col('percent', 'Percent (0.01 = 1%)', 'number'), col('rating_factor', 'Premium factor (0.92 = 8% off)', 'number'), col('is_default', 'Default', 'boolean'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean')],
    validate: (row) => { if (row.rating_factor != null && (Number(row.rating_factor) <= 0 || Number(row.rating_factor) > 2)) throw badRequest('FACTOR_OUT_OF_RANGE', 'Premium factor must be between 0 and 2'); },
  },
  premiumAdjustments: {
    approval: true,
    table: 'premium_adjustments', key: 'id', label: 'Discounts and loadings', permission: 'admin.products', order: ['product_code', 'priority'], filter: 'product_code',
    columns: [col('product_code', 'Product (blank = all)', 'select', { optionsFrom: 'products' }), col('code', 'Code', 'text', { required: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('kind', 'Kind', 'select', { options: ['discount', 'loading'], required: true }), col('percent', 'Percent (0.05 = 5%)', 'number', { required: true }),
      col('condition', 'Applies when', 'json', { hint: '{"fact":"claims3y","op":"eq","value":0} · {"all":[…]} · {"any":[…]}; blank = always' }), col('channels', 'Channels', 'json', { hint: '["b2c"], ["b2b"] or blank for both' }),
      col('priority', 'Order of application', 'number'), col('stackable', 'Combines with others', 'boolean'), col('effective_from', 'From', 'date'), col('effective_to', 'To', 'date'), col('active', 'Active', 'boolean')],
    validate: (row) => { if (row.percent != null && (Number(row.percent) <= 0 || Number(row.percent) > 1)) throw badRequest('PERCENT_OUT_OF_RANGE', 'Percent must be above 0 and at most 1'); },
  },
  charges: {
    approval: true,
    table: 'charges', key: 'id', label: 'Charges and fees', permission: 'admin.products', order: ['product_code', 'sort'], filter: 'product_code',
    columns: [col('code', 'Code', 'text', { required: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('product_code', 'Product (blank = all)', 'select', { optionsFrom: 'products' }), col('country_code', 'Country (blank = all)', 'text'), col('charge_type', 'Type', 'select', { options: ['fixed', 'percent'], required: true }),
      col('amount', 'Amount (fixed)', 'number'), col('percent', 'Percent of premium', 'number'), col('min_amount', 'Minimum', 'number'), col('max_amount', 'Maximum', 'number'),
      col('taxable', 'Taxable', 'boolean'), col('refundable', 'Refundable on cancellation', 'boolean'), col('transactions', 'Transactions', 'json', { hint: '["new_business","renewal"]' }),
      col('condition', 'Applies when', 'json'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean')],
  },
  taxes: {
    approval: true,
    table: 'taxes', key: 'id', label: 'Taxes', permission: 'admin.products', order: ['country_code', 'priority'], filter: 'country_code',
    columns: [col('code', 'Code', 'text', { required: true }), col('name_en', 'Name (English)', 'text', { required: true }), col('name_ar', 'Name (Arabic)', 'text', { required: true }),
      col('country_code', 'Country', 'text', { required: true }), col('product_code', 'Product (blank = all)', 'select', { optionsFrom: 'products' }), col('rate', 'Rate (0.05 = 5%)', 'number', { required: true }),
      col('applies_to_fees', 'Also on fees', 'boolean'), col('condition', 'Applies when', 'json', { hint: '{"fact":"direction","op":"eq","value":"export"}' }), col('priority', 'Priority (lower first)', 'number'),
      col('effective_from', 'From', 'date'), col('effective_to', 'To', 'date'), col('active', 'Active', 'boolean')],
    validate: (row) => { if (row.rate != null && (Number(row.rate) < 0 || Number(row.rate) > 0.5)) throw badRequest('RATE_OUT_OF_RANGE', 'Tax rate must be between 0 and 0.5'); },
  },
  documentRequirements: {
    approval: true,
    table: 'document_requirements', key: 'id', label: 'Document requirements', permission: 'admin.products', order: ['event', 'sort'], filter: 'event',
    columns: [col('product_code', 'Product (blank = all)', 'select', { optionsFrom: 'products' }), col('event', 'When', 'select', { options: ['claim', 'referral', 'policy', 'survey'], required: true }),
      col('doc_type', 'Document type', 'select', { required: true, optionsFrom: 'docTypes' }), col('note_en', 'Note (English)', 'text'), col('note_ar', 'Note (Arabic)', 'text'),
      col('condition', 'Only when', 'json', { hint: '{"fact":"cause","op":"in","value":["theft"]} or an expression' }), col('mandatory', 'Mandatory', 'boolean'), col('sort', 'Order', 'number'), col('active', 'Active', 'boolean')],
  },
  outbox: {
    table: 'outbox', key: 'id', label: 'Sent messages', permission: 'admin.outbox', order: [{ column: 'id', order: 'desc' }], readOnly: true, filter: 'status',
    columns: [col('created_at', 'When', 'datetime'), col('event', 'Event'), col('channel', 'Channel'), col('to', 'To'), col('subject', 'Subject'), col('status', 'Status'), col('error', 'Error')],
  },
};

const OPTION_SOURCES = {
  docTypes: async () => (await db('lookup_values').where({ list_code: 'GLOBAL.documentTypes', active: true }).orderBy('sort')).map((v) => ({ value: v.code, label: v.label_en })),
  lobs: async () => (await db('lobs').orderBy('sort')).map((l) => ({ value: l.code, label: l.name_en })),
  products: async () => (await db('products').orderBy('code')).map((p) => ({ value: p.code, label: `${p.code} – ${p.name_en}` })),
  lookupLists: async () => (await db('lookup_lists').orderBy('code')).map((l) => ({ value: l.code, label: l.code })),
  brokers: async () => (await db('brokers').orderBy('name')).map((b) => ({ value: b.id, label: b.name })),
};

function entity(req) {
  const e = ENTITIES[req.params.entity];
  if (!e) throw notFound('ENTITY_NOT_FOUND');
  if (!req.user.permissions.includes(e.permission)) throw forbidden('PERMISSION_DENIED');
  return e;
}

/** Converts form input to column values (JSON columns serialised, blanks to null, booleans). */
function toRow(e, body, creating) {
  const row = {};
  for (const c of e.columns) {
    if (c.readonly || !(c.name in body)) continue;
    if (!creating && c.createOnly) continue;
    let v = body[c.name];
    if (v === '' || v === undefined) v = null;
    if (c.type === 'json' || (e.table === 'system_parameters' && c.name === 'value')) v = v === null ? null : json(typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (_err) { return v; } })() : v);
    else if (c.type === 'boolean') v = v === null ? false : Boolean(v);
    else if (c.type === 'number' && v !== null) v = Number(v);
    row[c.name] = v;
  }
  if (creating) for (const c of e.columns) if (c.required && (row[c.name] === null || row[c.name] === undefined)) throw badRequest('FIELD_REQUIRED', `${c.label} is required`);
  return row;
}

const maskSecrets = (e, rows) => (e.table === 'system_parameters' ? rows.map((r) => (r.type === 'secret' ? { ...r, value: r.value ? '••••••' : '' } : r)) : rows);

router.get('/meta', asyncHandler(async (req, res) => {
  const visible = Object.entries(ENTITIES).filter(([, e]) => req.user.permissions.includes(e.permission));
  const entities = {};
  for (const [name, e] of visible) {
    const columns = [];
    for (const c of e.columns) {
      // eslint-disable-next-line no-await-in-loop
      columns.push(c.optionsFrom ? { ...c, options: await OPTION_SOURCES[c.optionsFrom]() } : c);
    }
    entities[name] = { label: e.label, key: e.key, readOnly: Boolean(e.readOnly), noCreate: Boolean(e.noCreate), noDelete: Boolean(e.noDelete), filter: e.filter || null, columns };
  }
  res.json({ entities, permissions: req.user.permissions });
}));

router.get('/entities/:entity', asyncHandler(async (req, res) => {
  const e = entity(req);
  const q = db(e.table).limit(Math.min(Number(req.query.limit) || 500, 2000));
  if (Array.isArray(e.order) && typeof e.order[0] === 'object') q.orderBy(e.order); else q.orderBy([].concat(e.order).map((c) => ({ column: c })));
  if (e.filter && req.query.filter) q.where(e.filter, String(req.query.filter));
  if (req.query.q) {
    const term = `%${String(req.query.q)}%`;
    q.where((w) => e.columns.filter((c) => ['text', 'textarea'].includes(c.type)).forEach((c) => w.orWhere(c.name, 'like', term)));
  }
  res.json({ rows: maskSecrets(e, await q) });
}));

function checkCondition(row) {
  if (!('condition' in row) || row.condition == null) return;
  const c = JSON.parse(row.condition);
  if (c === null) return;
  try { evaluate(c, {}); } catch (err) { throw badRequest('CONDITION_INVALID', err.message); }
}

/* Create / update / delete, shared by direct edits and approved changes. */
async function applyCreate(e, name, body, userId) {
  if (e.readOnly || e.noCreate) throw badRequest('READ_ONLY');
  const row = toRow(e, body || {}, true);
  e.validate?.(row);
  checkCondition(row);
  const [id] = await db(e.table).insert(row);
  e.after?.();
  await audit(db, { userId, action: `config.${name}.create`, entity: e.table, entityId: e.key === 'id' ? id : row[e.key], data: row });
  return e.key === 'id' ? id : row[e.key];
}

async function applyUpdate(e, name, key, body, userId) {
  if (e.readOnly) throw badRequest('READ_ONLY');
  const before = await db(e.table).where({ [e.key]: key }).first();
  if (!before) throw notFound('RECORD_NOT_FOUND');
  const input = { ...body };
  if (e.table === 'system_parameters' && before.type === 'secret' && input.value === '••••••') delete input.value;
  const row = toRow(e, input, false);
  e.validate?.({ ...before, ...row });
  checkCondition(row);
  if (Object.keys(row).length) await db(e.table).where({ [e.key]: key }).update(row);
  e.after?.();
  await audit(db, { userId, action: `config.${name}.update`, entity: e.table, entityId: key, data: { before: e.table === 'system_parameters' && before.type === 'secret' ? '[secret]' : before, after: row } });
}

async function applyDelete(e, name, key, userId) {
  if (e.readOnly || e.noDelete) throw badRequest('READ_ONLY');
  const before = await db(e.table).where({ [e.key]: key }).first();
  if (!before) throw notFound('RECORD_NOT_FOUND');
  e.protect?.(before);
  await db(e.table).where({ [e.key]: key }).del();
  e.after?.();
  await audit(db, { userId, action: `config.${name}.delete`, entity: e.table, entityId: key, data: before });
}

/** With products.requireApproval on, product configuration edits wait for a second person. */
async function needsApproval(e) {
  return Boolean(e.approval) && Boolean(await params.get('products.requireApproval', false));
}

async function queue(req, e, operation, key, payload) {
  // Validate now so the approver only sees changes that can be applied.
  if (operation !== 'delete') {
    const row = toRow(e, payload || {}, operation === 'create');
    const before = key ? await db(e.table).where({ [e.key]: key }).first() : null;
    if (key && !before) throw notFound('RECORD_NOT_FOUND');
    e.validate?.({ ...(before || {}), ...row });
    checkCondition(row);
  }
  const before = key ? await db(e.table).where({ [e.key]: key }).first() : null;
  if (operation === 'delete' && !before) throw notFound('RECORD_NOT_FOUND');
  const [id] = await db('config_changes').insert({ entity: req.params.entity, operation, record_key: key == null ? null : String(key), payload: json(payload || null), before: json(before), requested_by: req.user.id });
  await audit(db, { userId: req.user.id, action: `config.${req.params.entity}.${operation}.requested`, entity: 'config_change', entityId: id });
  return id;
}

router.post('/entities/:entity', asyncHandler(async (req, res) => {
  const e = entity(req);
  if (await needsApproval(e)) return res.status(202).json({ status: 'pending_approval', changeId: await queue(req, e, 'create', null, req.body) });
  return res.status(201).json({ id: await applyCreate(e, req.params.entity, req.body, req.user.id) });
}));

router.put('/entities/:entity/:id', asyncHandler(async (req, res) => {
  const e = entity(req);
  if (await needsApproval(e)) return res.status(202).json({ status: 'pending_approval', changeId: await queue(req, e, 'update', req.params.id, req.body) });
  await applyUpdate(e, req.params.entity, req.params.id, req.body, req.user.id);
  return res.json({ ok: true });
}));

router.delete('/entities/:entity/:id', asyncHandler(async (req, res) => {
  const e = entity(req);
  if (await needsApproval(e)) return res.status(202).json({ status: 'pending_approval', changeId: await queue(req, e, 'delete', req.params.id, null) });
  await applyDelete(e, req.params.entity, req.params.id, req.user.id);
  return res.json({ ok: true });
}));

/* ---------- Pending configuration changes ---------- */
router.get('/changes', requirePermission('admin.products'), asyncHandler(async (req, res) => {
  const rows = await db('config_changes as c').leftJoin('users as u', 'u.id', 'c.requested_by').select('c.*', 'u.full_name as requester')
    .whereIn('c.status', String(req.query.status || 'pending').split(',')).orderBy('c.id', 'desc').limit(300);
  res.json({ changes: rows.map((c) => ({ id: c.id, entity: c.entity, label: ENTITIES[c.entity]?.label, operation: c.operation, key: c.record_key, payload: c.payload, before: c.before, status: c.status, requester: c.requester, requestedBy: c.requested_by, reason: c.reason, createdAt: c.created_at })) });
}));

async function loadChange(id) {
  const c = await db('config_changes').where({ id }).first();
  if (!c) throw notFound('CHANGE_NOT_FOUND');
  if (c.status !== 'pending') throw conflict('CHANGE_NOT_PENDING');
  return c;
}

router.post('/changes/:id/approve', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const c = await loadChange(Number(req.params.id));
  if (c.requested_by === req.user.id) throw forbidden('MAKER_CANNOT_APPROVE', 'A different person must approve this change');
  const e = ENTITIES[c.entity];
  let created = null;
  if (c.operation === 'create') created = await applyCreate(e, c.entity, c.payload, req.user.id);
  else if (c.operation === 'update') await applyUpdate(e, c.entity, c.record_key, c.payload, req.user.id);
  else await applyDelete(e, c.entity, c.record_key, req.user.id);
  await db('config_changes').where({ id: c.id }).update({ status: 'approved', decided_by: req.user.id, decided_at: new Date() });
  res.json({ ok: true, id: created });
}));

router.post('/changes/:id/reject', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const c = await loadChange(Number(req.params.id));
  await db('config_changes').where({ id: c.id }).update({ status: 'rejected', decided_by: req.user.id, decided_at: new Date(), reason: String(req.body?.reason || '').slice(0, 500) });
  await audit(db, { userId: req.user.id, action: 'config.change.reject', entity: 'config_change', entityId: c.id });
  res.json({ ok: true });
}));

/* ---------- Product overview ---------- */
router.get('/products/:code/overview', requirePermission('admin.products'), asyncHandler(async (req, res) => {
  const product = await catalog.getProduct(req.params.code);
  const [lob, countries, covers, deductibles, adjustments, charges, taxes, rates, rules] = await Promise.all([
    db('lobs').where({ code: product.line }).first(),
    db('product_countries').where({ product_code: product.code }).select('country_code', 'enabled_b2c', 'enabled_b2b'),
    db('product_covers').where({ product_code: product.code }).orderBy('sort'),
    db('product_deductibles').where({ product_code: product.code }).orderBy('sort'),
    db('premium_adjustments').where((q) => q.where({ product_code: product.code }).orWhereNull('product_code')).orderBy('priority'),
    db('charges').where((q) => q.where({ product_code: product.code }).orWhereNull('product_code')).orderBy('sort'),
    db('taxes').where((q) => q.where({ product_code: product.code }).orWhereNull('product_code')).orderBy(['country_code', 'priority']),
    db('rate_tables').where({ product_code: product.code }).whereIn('status', ['approved', 'draft', 'pending']).select('id', 'country_code', 'table_key', 'version', 'status'),
    db('referral_rules').where({ product_code: product.code }).count({ n: '*' }).first(),
  ]);
  res.json({
    product: { code: product.code, name: { en: product.name_en, ar: product.name_ar }, description: { en: product.description_en, ar: product.description_ar }, status: product.status, rater: product.rater, lob: lob && { code: lob.code, name: { en: lob.name_en, ar: lob.name_ar } } },
    countries, covers, deductibles, adjustments, charges, taxes, rateTables: rates, referralRules: Number(rules.n),
  });
}));

/* ---------- Roles and privileges ---------- */
router.get('/permissions', requirePermission('admin.roles'), asyncHandler(async (_req, res) => {
  res.json({ permissions: await db('permissions').orderBy(['module', 'code']) });
}));

router.get('/roles/:id/permissions', requirePermission('admin.roles'), asyncHandler(async (req, res) => {
  res.json({ codes: await db('role_permissions').where({ role_id: Number(req.params.id) }).pluck('permission_code') });
}));

router.put('/roles/:id/permissions', requirePermission('admin.roles'), asyncHandler(async (req, res) => {
  const { codes } = z.object({ codes: z.array(z.string().max(60)).max(200) }).parse(req.body);
  const role = await db('roles').where({ id: Number(req.params.id) }).first();
  if (!role) throw notFound('ROLE_NOT_FOUND');
  const known = new Set(await db('permissions').pluck('code'));
  if (codes.some((c) => !known.has(c))) throw badRequest('PERMISSION_UNKNOWN');
  if (role.code === 'config_admin' && !codes.includes('admin.roles')) throw conflict('LOCKOUT', 'The configuration administrator must keep role management');
  await db.transaction(async (trx) => {
    await trx('role_permissions').where({ role_id: role.id }).del();
    if (codes.length) await trx('role_permissions').insert(codes.map((c) => ({ role_id: role.id, permission_code: c })));
  });
  await audit(db, { userId: req.user.id, action: 'role.permissions', entity: 'role', entityId: role.id, data: { codes } });
  res.json({ ok: true });
}));

/* ---------- Users ---------- */
const userView = (u) => ({ id: u.id, email: u.email, mobile: u.mobile, name: u.full_name, role: u.role, roleId: u.role_id, roleName: u.role_name, brokerId: u.broker_id, broker: u.broker_name, active: Boolean(u.active), lastLoginAt: u.last_login_at, mustChangePassword: Boolean(u.must_change_password) });
const tempPassword = () => `Tmp-${crypto.randomBytes(5).toString('hex')}!9`;

router.get('/users', requirePermission('admin.users'), asyncHandler(async (req, res) => {
  const q = db('users').leftJoin('roles', 'roles.id', 'users.role_id').leftJoin('brokers', 'brokers.id', 'users.broker_id')
    .select('users.*', 'roles.name_en as role_name', 'brokers.name as broker_name').orderBy('users.id').limit(1000);
  if (req.query.type === 'staff') q.whereNot('users.role', 'customer');
  if (req.query.type === 'customer') q.where('users.role', 'customer');
  if (req.query.q) q.where((w) => w.where('users.email', 'like', `%${req.query.q}%`).orWhere('users.full_name', 'like', `%${req.query.q}%`).orWhere('users.mobile', 'like', `%${req.query.q}%`));
  const seats = await licence.current();
  const used = await db('users').where({ active: true }).whereNot('role', 'customer').count({ n: '*' }).first();
  res.json({ users: (await q).map(userView), seats: { used: Number(used.n), max: seats.maxUsers } });
}));

router.post('/users', requirePermission('admin.users'), asyncHandler(async (req, res) => {
  const b = z.object({ email: z.string().email(), name: z.string().min(2).max(160), roleId: z.number().int().positive(), brokerId: z.number().int().positive().nullable().optional() }).parse(req.body);
  const role = await db('roles').where({ id: b.roleId, active: true }).first();
  if (!role) throw notFound('ROLE_NOT_FOUND');
  if (role.base_role === 'customer') throw badRequest('CUSTOMERS_SELF_REGISTER', 'Customers register themselves with a one-time code');
  if (['broker_admin', 'broker_user'].includes(role.base_role) && !b.brokerId) throw badRequest('BROKER_REQUIRED');
  if (await db('users').where({ email: b.email.toLowerCase() }).first()) throw conflict('EMAIL_IN_USE');
  await licence.assertSeatAvailable();
  const password = tempPassword();
  const [id] = await db('users').insert({ email: b.email.toLowerCase(), full_name: b.name, role: role.base_role, role_id: role.id, broker_id: b.brokerId || null, password_hash: await bcrypt.hash(password, 10), must_change_password: true });
  await audit(db, { userId: req.user.id, action: 'user.create', entity: 'user', entityId: id, data: { email: b.email, roleId: role.id } });
  res.status(201).json({ id, temporaryPassword: password });
}));

router.put('/users/:id', requirePermission('admin.users'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().min(2).max(160).optional(), roleId: z.number().int().positive().optional(), brokerId: z.number().int().positive().nullable().optional(), active: z.boolean().optional() }).parse(req.body);
  const user = await db('users').where({ id: Number(req.params.id) }).first();
  if (!user) throw notFound('USER_NOT_FOUND');
  const patch = {};
  if (b.name) patch.full_name = b.name;
  if (b.brokerId !== undefined) patch.broker_id = b.brokerId;
  if (b.roleId) {
    const role = await db('roles').where({ id: b.roleId, active: true }).first();
    if (!role) throw notFound('ROLE_NOT_FOUND');
    if ((role.base_role === 'customer') !== (user.role === 'customer')) throw badRequest('ROLE_TYPE_CHANGE', 'A customer cannot become staff, or the reverse');
    patch.role_id = role.id;
    patch.role = role.base_role;
  }
  if (b.active !== undefined) {
    if (b.active && !user.active && user.role !== 'customer') await licence.assertSeatAvailable();
    if (!b.active && user.id === req.user.id) throw conflict('CANNOT_DEACTIVATE_SELF');
    patch.active = b.active;
  }
  if (Object.keys(patch).length) await db('users').where({ id: user.id }).update({ ...patch, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'user.update', entity: 'user', entityId: user.id, data: patch });
  res.json({ ok: true });
}));

router.post('/users/:id/reset-password', requirePermission('admin.users'), asyncHandler(async (req, res) => {
  const user = await db('users').where({ id: Number(req.params.id) }).first();
  if (!user || user.role === 'customer') throw notFound('USER_NOT_FOUND');
  const password = tempPassword();
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(password, 10), must_change_password: true });
  await audit(db, { userId: req.user.id, action: 'user.reset_password', entity: 'user', entityId: user.id });
  res.json({ temporaryPassword: password });
}));

/* ---------- Licence ---------- */
router.get('/licence', asyncHandler(async (_req, res) => {
  const l = await licence.current();
  const used = await db('users').where({ active: true }).whereNot('role', 'customer').count({ n: '*' }).first();
  const warnDays = Number(await params.get('licence.warnDays', 30));
  res.json({ licence: { ...l, seatsUsed: Number(used.n), warning: l.installed && l.daysLeft <= warnDays } });
}));

router.post('/licence', requirePermission('admin.licence'), asyncHandler(async (req, res) => {
  const { key } = z.object({ key: z.string().min(20).max(10000) }).parse(req.body);
  const v = verify(key);
  if (!v.valid) throw badRequest('LICENCE_INVALID', `Licence key is not valid (${v.reason})`);
  const p = v.payload;
  await db.transaction(async (trx) => {
    await trx('licences').update({ current: false });
    await trx('licences').insert({ licence_id: p.licenceId, licensee: p.licensee, modules: json(p.modules), max_users: p.maxUsers, valid_from: p.validFrom, valid_to: p.validTo, grace_days: p.graceDays ?? 15, licence_key: key, current: true, installed_by: req.user.id });
  });
  licence.invalidate();
  await audit(db, { userId: req.user.id, action: 'licence.install', entity: 'licence', entityId: p.licenceId, data: { licensee: p.licensee, modules: p.modules, validTo: p.validTo, maxUsers: p.maxUsers } });
  res.status(201).json({ licence: await licence.current() });
}));

/* ---------- Commission payouts ---------- */
router.get('/commissions', requirePermission('admin.commission'), asyncHandler(async (req, res) => {
  const q = db('commissions as c').join('brokers as b', 'b.id', 'c.broker_id').join('policies as p', 'p.id', 'c.policy_id')
    .select('c.*', 'b.name as broker', 'p.policy_no', 'p.currency').orderBy('c.id', 'desc').limit(1000);
  q.whereIn('c.status', String(req.query.status || 'earned,clawback').split(','));
  if (req.query.brokerId) q.where('c.broker_id', Number(req.query.brokerId));
  const rows = await q;
  const byBroker = {};
  for (const r of rows) { byBroker[r.broker] = (byBroker[r.broker] || 0) + Number(r.amount); }
  res.json({ lines: rows.map((r) => ({ id: r.id, broker: r.broker, brokerId: r.broker_id, policyNo: r.policy_no, transaction: r.transaction, base: r.base_amount, rate: Number(r.rate), amount: r.amount, status: r.status, schemeId: r.scheme_id, paidAt: r.paid_at, payoutRef: r.payout_ref, currency: r.currency, createdAt: r.created_at })), totals: byBroker });
}));

router.post('/commissions/pay', requirePermission('admin.commission'), asyncHandler(async (req, res) => {
  const { ids, reference } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000), reference: z.string().min(2).max(80) }).parse(req.body);
  const n = await db('commissions').whereIn('id', ids).whereIn('status', ['earned', 'clawback']).update({ status: 'paid', paid_at: new Date(), payout_ref: reference });
  await audit(db, { userId: req.user.id, action: 'commission.pay', entity: 'commission', data: { ids, reference, updated: n } });
  res.json({ paid: n });
}));

/* ---------- Messaging ---------- */
router.post('/email/test', requirePermission('admin.templates'), asyncHandler(async (req, res) => {
  const { to } = z.object({ to: z.string().email() }).parse(req.body);
  const r = await messaging.deliver({ to, channel: 'email', template: 'test_email', data: {}, event: 'admin.test' });
  const row = await db('outbox').where({ id: r.id }).first();
  res.json({ status: row.status, error: row.error });
}));

router.get('/audit', requirePermission('admin.audit'), asyncHandler(async (req, res) => {
  const q = db('audit_log').leftJoin('users', 'users.id', 'audit_log.user_id').orderBy('audit_log.id', 'desc').limit(300).select('audit_log.*', 'users.full_name');
  if (req.query.action) q.where('audit_log.action', 'like', `${req.query.action}%`);
  res.json({ entries: (await q).map((a) => ({ id: a.id, at: a.created_at, user: a.full_name, action: a.action, entity: a.entity, entityId: a.entity_id, data: a.data })) });
}));

module.exports = router;
