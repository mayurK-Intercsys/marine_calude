/**
 * Messaging: templates (EN/AR) rendered with {{placeholders}}, delivered by email (SMTP via
 * Admin → System parameters), SMS / WhatsApp (adapter; "log" records only) or in-app, every
 * message recorded in the outbox. emit(event) applies the configurable notification rules.
 */
const nodemailer = require('nodemailer');
const { db } = require('../db');
const params = require('./params');

const sent = [];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const render = (text, data, html) => String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (html ? esc(data[k]) : String(data[k] ?? '')));

async function template(code, channel, locale) {
  const rows = await db('message_templates').where({ code, channel, active: true }).whereIn('locale', [locale || 'en', 'en']);
  return rows.find((r) => r.locale === locale) || rows.find((r) => r.locale === 'en') || null;
}

async function layout(bodyHtml, locale) {
  const name = await params.get('general.insurerName', '[INSURER]');
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#f5f7fa;font-family:Arial,'IBM Plex Sans Arabic',sans-serif;color:#0f1b2d">
<div style="max-width:600px;margin:0 auto;padding:24px"><div style="background:#12355b;color:#fff;padding:16px 20px;font-weight:bold;font-size:18px">${esc(name)}</div>
<div style="background:#fff;padding:20px;border:1px solid #d9dee5;line-height:1.6">${bodyHtml}</div>
<p style="font-size:12px;color:#4a5568">${esc(name)}</p></div></body></html>`;
}

let transport = null;
let transportKey = '';
async function mailer() {
  const cfg = {
    host: await params.get('email.smtp.host', ''), port: Number(await params.get('email.smtp.port', 587)), secure: Boolean(await params.get('email.smtp.secure', false)),
    user: await params.get('email.smtp.user', ''), pass: await params.get('email.smtp.password', ''),
  };
  const key = JSON.stringify(cfg);
  if (!transport || key !== transportKey) {
    transport = cfg.host === 'json'
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined });
    transportKey = key;
  }
  return transport;
}

/**
 * Sends one message. `template` is a template code; if no template exists the data is recorded as is.
 * `userId` is required for in-app messages.
 */
async function deliver({ to, channel = 'email', template: code, data = {}, locale = 'en', event = null, related = {}, userId = null }) {
  sent.push({ to, channel, template: code, data, at: new Date().toISOString() });
  const tpl = code ? await template(code, channel, locale) : null;
  let subject = tpl ? render(tpl.subject, data, false) : code;
  let body = tpl ? render(tpl.body, data, channel === 'email') : JSON.stringify(data);
  if (channel === 'email' && tpl) body = await layout(body, locale);

  const row = { event, template_code: code, channel, to: String(to).slice(0, 200), subject: subject ? subject.slice(0, 300) : null, body, status: 'logged', related_entity: related.entity || null, related_id: related.id == null ? null : String(related.id) };
  try {
    if (channel === 'inapp') {
      if (userId) await db('user_notifications').insert({ user_id: userId, title: (subject || code || '').slice(0, 200), body: tpl ? render(tpl.body, data, false) : body, link: data.link || null });
      row.status = 'sent';
    } else if (channel === 'email' && await params.get('email.smtp.enabled', false)) {
      const info = await (await mailer()).sendMail({ from: await params.get('email.from', 'no-reply@insurer.example'), to, subject, html: body });
      row.status = 'sent';
      row.provider_ref = String(info.messageId || '').slice(0, 200);
      row.sent_at = new Date();
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[${channel}] ${code} -> ${to}`);
    }
  } catch (e) {
    row.status = 'failed';
    row.error = String(e.message).slice(0, 500);
  }
  const [id] = await db('outbox').insert(row);
  return { id, status: row.status };
}

async function recipients(rule, ctx) {
  const users = (q) => q.where({ active: true }).select('id', 'email', 'mobile', 'locale');
  switch (rule.recipient) {
    case 'customer': {
      const c = ctx.customer || {};
      if (rule.channel === 'inapp') return c.userId ? [{ userId: c.userId, to: `user:${c.userId}`, locale: c.locale }] : [];
      const to = rule.channel === 'email' ? c.email : c.mobile;
      return to ? [{ to, locale: c.locale || 'en', userId: c.userId }] : [];
    }
    case 'broker': {
      if (!ctx.brokerId) return [];
      const rows = await users(db('users').where({ broker_id: ctx.brokerId }).whereIn('role', rule.channel === 'inapp' ? ['broker_admin', 'broker_user'] : ['broker_admin']));
      return rows.map((u) => ({ to: rule.channel === 'inapp' ? `user:${u.id}` : (rule.channel === 'email' ? u.email : u.mobile), userId: u.id, locale: u.locale })).filter((r) => r.to);
    }
    case 'underwriters':
    case 'ops': {
      const roles = rule.recipient === 'ops' ? ['ops'] : ['underwriter', 'uw_manager'];
      const rows = await users(db('users').whereIn('role', roles));
      return rows.map((u) => ({ to: rule.channel === 'inapp' ? `user:${u.id}` : (rule.channel === 'email' ? u.email : u.mobile), userId: u.id, locale: u.locale })).filter((r) => r.to);
    }
    case 'custom':
      return String(rule.custom_to || '').split(',').map((s) => s.trim()).filter(Boolean).map((to) => ({ to, locale: 'en' }));
    default:
      return [];
  }
}

/**
 * Raises an event. Active notification rules for the event decide who gets what, on which channel.
 * With `dedupeKey`, each rule and recipient is notified once per entity (e.g. one reminder per day count).
 * Returns the number of messages sent.
 */
async function emit(event, ctx = {}) {
  const rules = await db('notification_rules').where({ event, active: true });
  let count = 0;
  for (const rule of rules) {
    // eslint-disable-next-line no-await-in-loop
    for (const r of await recipients(rule, ctx)) {
      if (ctx.dedupeKey && ctx.entity && ctx.entityId != null) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await db('notification_log').insert({ entity: ctx.entity, entity_id: ctx.entityId, kind: `${ctx.dedupeKey}:${rule.id}`.slice(0, 40), recipient: String(r.to).slice(0, 160) });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY') continue;
          throw e;
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await deliver({ to: r.to, channel: rule.channel, template: rule.template_code, data: ctx.data || {}, locale: r.locale || 'en', event, related: { entity: ctx.entity, id: ctx.entityId }, userId: r.userId });
      count += 1;
    }
  }
  return count;
}

module.exports = { deliver, emit, render, sent };
