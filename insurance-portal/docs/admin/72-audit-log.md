# 72. Audit Log

---

## 1. Overview
The **Audit Log** module (`/admin/audit`) provides an immutable, chronological compliance ledger capturing every significant administrative, actuarial, and operational action performed across the platform. It records configuration mutations, rate changes, user provisioning, privilege assignments, underwriting approvals, financial settlements, and license activations with user attribution, entity identifiers, timestamps, and serialized before/after change payloads.

---

## 2. Who Can Access
- **Required Permission**: `admin.audit`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
  - `uw_manager` (Underwriting Manager)

---

## 3. Screen Walkthrough

### Master Audit Trail Table
- **Header**: "Audit log" (`admin.audit`).
- **Action Prefix Filter**: Text input allowing instant filtering by action namespace (e.g. `config.`, `policy.`, `user.`, `rates.`, `rules.`, `licence.`).
- **Table Columns**:
  1. `When`: Localized date and time with seconds (e.g. `22/10/2026, 12:15:30`).
  2. `User`: Full name of the user who executed the action (`users.full_name`) or `—` for system batch jobs.
  3. `Action`: Monospace action identifier tag (e.g. `config.charges.update`, `user.reset_password`).
  4. `Entity`: Target entity classification and primary key (e.g. `charges 1`, `user 15`, `rate_table 4`).
  5. `Payload Data`: Serialized JSON snippet displaying the input arguments, diffs, or before/after state snapshots.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique audit record identifier | `1204` |
| `at` (`created_at`)| Timestamp | Auto | ISO Timestamp | Timestamp of action execution | `2026-10-22 14:32:05` |
| `user` | String | Auto | User full name or null | Operating user full name | `Sara Al Nuaimi` |
| `user_id` | Integer (FK) | No | Valid ID in `users` or null | Operating user primary key | `3` |
| `action` | String | Yes | Namespaced action string | Action classification code | `config.charges.update` |
| `entity` | String | Yes | Database table or entity name | Target entity modified | `charges` |
| `entity_id` | String | No | Primary key value as string | Identifier of target record | `1` |
| `data` | JSON | No | JSON object or null | Snapshot of mutation, before/after diffs | `{"before":{"amount":50},"after":{"amount":75}}` |

---

## 5. Standard Action Catalog

| Action Namespace | Action Code | Triggering Platform Event | Stored Data Payload |
|---|---|---|---|
| **Configuration** | `config.{entity}.create` | Entity added in Admin console | Full inserted row attributes |
| | `config.{entity}.update` | Entity edited in Admin console | `{ before: {...}, after: {...} }` |
| | `config.{entity}.delete` | Entity deleted in Admin console | Snapshot of deleted record |
| | `config.{entity}.requested` | Maker submitted change to pending queue | Operation and proposed payload |
| | `config.change.reject` | Checker rejected a pending change | Staged change ID and reason |
| **Users & Roles** | `user.create` | New staff or broker account created | Email and assigned role ID |
| | `user.update` | User updated (role, active, broker) | Patched fields object |
| | `user.reset_password` | Temporary password generated for staff | Target user ID |
| | `role.permissions` | Privileges updated for a role | Array of granted permission codes |
| **Engines & Rates** | `rates.draft` | Rate table draft cloned | Source rate table ID |
| | `rates.edit` | Rate table draft data edited | `{ before: {...}, after: {...} }` |
| | `rates.approve` | Checker approved live rate table | Target rate table ID |
| | `rules.submit` | Rule set submitted with passed tests | Test suite total count |
| | `rules.approve` | Checker approved live rule set | Target rule set ID |
| | `rating.approve` | Checker approved dynamic rating model | Target model ID |
| **Financials** | `commission.pay` | Commission batch marked paid | `{ ids: [...], reference: 'WIRE-123' }` |
| | `licence.install` | New tenant licence key installed | Licensee, modules, maxUsers, validTo |

---

## 6. Step-by-Step: Investigating an Administrative Change
1. Sign in as Configuration Administrator or Underwriting Manager (`config1@portal.test`).
2. Navigate to **Admin** -> **Audit log** (`/admin/audit`).
3. In the filter box, enter `config.charges`.
4. *[Screenshot Placeholder: Audit Log Screen filtered by config.charges]*
5. Locate the relevant row:
   - Identify the user who performed the action (`config1@portal.test`).
   - Note the exact timestamp.
   - Inspect the `data` column:
     `{"before": {"code": "POLICY_FEE", "amount": 50}, "after": {"amount": 75}}`
6. Verify whether the modification complied with approved underwriting minutes.

---

## 7. How to Edit / Deactivate / Delete
- **Strict Immutability**: The audit log is an append-only compliance record.
- Records **cannot** be altered, updated, or deleted through the administration console.
- Database triggers and API permissions prevent truncating or modifying `audit_log` rows.

---

## 8. Approval Flow
- The Audit Log is a read-only monitoring interface and does not participate in approval workflows.

---

## 9. Dependencies
- **Underlying Engine**:
  - `api/src/lib/audit.js` (`audit(db, { userId, action, entity, entityId, data })`) is invoked by all mutating controllers.

---

## 10. Common Errors & Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| User column shows `—` | Action was executed by background daily job or system scheduler. | Expected for automated cron jobs (e.g. renewal batch creation). |
| Data column truncated | The UI truncates preview strings to 140 characters for table readability. | Inspect raw database record or query `/api/platform/audit` directly to view untruncated JSON. |

---

## 11. Sample Record
- **ID**: `892`
- **When**: `2026-10-22 11:20:45`
- **User**: `Sara Al Nuaimi`
- **Action**: `user.update`
- **Entity**: `user 14`
- **Data**: `{"active": false}`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/audit/page.js`
- **API Endpoint**: `GET /api/platform/audit?action={prefix}`
- **Database Table**: `audit_log`
- **Ordering**: `ORDER BY id DESC LIMIT 300`
- **Audit Helper**: `api/src/lib/audit.js`
