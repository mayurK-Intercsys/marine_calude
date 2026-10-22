'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import AdminShell, { useAdminMeta } from '@/components/admin/AdminShell';
import EntityManager from '@/components/admin/EntityManager';
import { ErrorNotice } from '@/components/ui';

function Privileges({ role, onClose }) {
  const { t } = useI18n();
  const [all, setAll] = useState([]);
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api('/platform/permissions').then((r) => setAll(r.permissions)).catch(setError);
    api(`/platform/roles/${role.id}/permissions`).then((r) => setCodes(r.codes)).catch(setError);
  }, [role.id]);
  if (!codes) return null;
  const modules = [...new Set(all.map((p) => p.module))];
  return (
    <section className="card stack-sm">
      <h2>{t('admin.privileges')}: {role.name_en}</h2>
      {modules.map((m) => (
        <fieldset key={m}><legend className="legend">{m}</legend>
          <div className="choices">{all.filter((p) => p.module === m).map((p) => (
            <label className="choice" key={p.code} title={p.code}><input type="checkbox" checked={codes.includes(p.code)} onChange={(e) => setCodes(e.target.checked ? [...codes, p.code] : codes.filter((c) => c !== p.code))} />{p.description}</label>
          ))}</div>
        </fieldset>
      ))}
      <ErrorNotice error={error} />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={async () => { setError(null); try { await api(`/platform/roles/${role.id}/permissions`, { method: 'PUT', body: { codes } }); onClose(); } catch (e) { setError(e); } }}>{t('admin.save')}</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('admin.cancel')}</button>
      </div>
    </section>
  );
}

export default function RolesPage() {
  const { t } = useI18n();
  const meta = useAdminMeta();
  const [role, setRole] = useState(null);
  return (
    <AdminShell>
      {role ? <Privileges role={role} onClose={() => setRole(null)} /> : null}
      {meta?.entities?.roles ? <EntityManager name="roles" meta={meta.entities.roles} extraActions={(r) => <button type="button" className="btn-link" onClick={() => setRole(r)}>{t('admin.editPrivileges')}</button>} /> : null}
    </AdminShell>
  );
}
