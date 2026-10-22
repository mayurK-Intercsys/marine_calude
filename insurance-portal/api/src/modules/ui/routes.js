/**
 * Screen configuration for the front end (public, cached by the browser for a minute):
 * field properties (label, tooltip, visibility, mandatory, type), help articles and drop-down values.
 * Plus the signed-in user's in-app notifications.
 */
const express = require('express');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth } = require('../../middleware/auth');
const licence = require('../../lib/licenceState');
const { notFound } = require('../../lib/errors');

const router = express.Router();
const cache = (res) => res.set('Cache-Control', 'public, max-age=60');

router.get('/fields', asyncHandler(async (req, res) => {
  const q = db('field_definitions').orderBy(['screen', 'sort']);
  if (req.query.screen) q.whereIn('screen', String(req.query.screen).split(','));
  const rows = await q;
  const out = {};
  for (const f of rows) {
    (out[f.screen] ||= {})[f.field_key] = {
      label: { en: f.label_en, ar: f.label_ar }, tooltip: f.tooltip_en || f.tooltip_ar ? { en: f.tooltip_en, ar: f.tooltip_ar } : null,
      placeholder: f.placeholder_en || f.placeholder_ar ? { en: f.placeholder_en, ar: f.placeholder_ar } : null,
      type: f.field_type, lookupList: f.lookup_list, visible: Boolean(f.visible), mandatory: Boolean(f.mandatory), readonly: Boolean(f.readonly),
      min: f.min_value == null ? null : Number(f.min_value), max: f.max_value == null ? null : Number(f.max_value), pattern: f.pattern, defaultValue: f.default_value, help: f.help_slug,
    };
  }
  cache(res).json({ fields: out });
}));

router.get('/lookups/:code', asyncHandler(async (req, res) => {
  const rows = await db('lookup_values').where({ list_code: req.params.code, active: true }).orderBy('sort');
  if (!rows.length && !(await db('lookup_lists').where({ code: req.params.code }).first())) throw notFound('LOOKUP_NOT_FOUND');
  cache(res).json({ values: rows.map((v) => ({ code: v.code, name: { en: v.label_en, ar: v.label_ar }, parent: v.parent_code, ...(v.attributes || {}) })) });
}));

router.get('/help', asyncHandler(async (req, res) => {
  const rows = await db('help_articles').where({ published: true }).orderBy('sort');
  const audience = req.query.audience ? String(req.query.audience) : null;
  cache(res).json({ articles: rows.filter((a) => !audience || !a.audience || a.audience.includes(audience)).map((a) => ({ slug: a.slug, category: a.category, title: { en: a.title_en, ar: a.title_ar } })) });
}));

router.get('/help/:slug', asyncHandler(async (req, res) => {
  const a = await db('help_articles').where({ slug: req.params.slug, published: true }).first();
  if (!a) throw notFound('HELP_NOT_FOUND');
  cache(res).json({ article: { slug: a.slug, category: a.category, title: { en: a.title_en, ar: a.title_ar }, body: { en: a.body_en, ar: a.body_ar } } });
}));

router.get('/licence-banner', asyncHandler(async (_req, res) => {
  const l = await licence.current();
  res.json({ active: l.active, inGrace: Boolean(l.inGrace), daysLeft: l.daysLeft ?? null });
}));

router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const rows = await db('user_notifications').where({ user_id: req.user.id }).orderBy('id', 'desc').limit(50);
  const unread = await db('user_notifications').where({ user_id: req.user.id }).whereNull('read_at').count({ n: '*' }).first();
  res.json({ unread: Number(unread.n), notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), at: n.created_at })) });
}));

router.post('/notifications/read', requireAuth, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
  const q = db('user_notifications').where({ user_id: req.user.id }).whereNull('read_at');
  if (ids) q.whereIn('id', ids);
  res.json({ updated: await q.update({ read_at: new Date() }) });
}));

module.exports = router;
