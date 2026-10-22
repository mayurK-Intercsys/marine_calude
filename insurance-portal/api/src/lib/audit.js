const { json } = require('../db');

/** Every create, change, override and decision is logged (BRD NFR: audit). */
async function audit(conn, { userId = null, action, entity, entityId = null, data = null, ip = null }) {
  await conn('audit_log').insert({ user_id: userId, action, entity, entity_id: entityId == null ? null : String(entityId), data: json(data), ip });
}

module.exports = { audit };
