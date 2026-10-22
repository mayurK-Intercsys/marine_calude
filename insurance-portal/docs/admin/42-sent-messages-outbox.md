# 42. Sent Messages (Outbox)

---

## 1. Overview
The **Sent Messages (Outbox)** module (`/admin/outbox`) is an immutable operational message ledger. It tracks every communication dispatched by the platform across email, SMS, WhatsApp, and in-app channels. Support agents, operations staff, and developers use this screen to verify message delivery, inspect destination addresses, confirm OTP code generation, and troubleshoot SMTP or SMS provider transmission failures.

---

## 2. Who Can Access
- **Required Permission**: `admin.outbox`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
  - `ops` (Operations)
  - Custom roles with `admin.outbox`

---

## 3. Screen Walkthrough

### Master Outbox Ledger
Rendered via the `EntityManager` component in read-only mode:
- **Header**: "Sent messages" with a `Read only` badge (`admin.readOnly`).
- **Filter Bar**: `Filter: status` (e.g. `sent`, `logged`, `failed`).
- **Search Bar**: Substring search across `to`, `subject`, `event`, and `error`.
- **Table Columns**:
  1. `When`: ISO timestamp of dispatch attempt (`created_at`).
  2. `Event`: Triggering lifecycle event (e.g. `policy.issued`, `auth.otp`).
  3. `Channel`: Dispatch mode (`email`, `sms`, `whatsapp`, `inapp`).
  4. `To`: Destination email address, mobile number, or user ID.
  5. `Subject`: Message subject line or summary header.
  6. `Status`: Delivery status badge:
     - `sent` (Green): Successfully transmitted via external SMTP or SMS provider.
     - `logged` (Muted): Recorded to outbox without external dispatch (e.g. when `email.smtp.enabled = false` in development/staging).
     - `failed` (Red): Transmission rejected by gateway or network error.
  7. `Error`: Full error message returned by transport adapter (if failed).

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique message tracking ID | `1542` |
| `created_at` | Timestamp | Auto | ISO Timestamp | Timestamp message was queued/sent | `2026-10-22 11:45:10` |
| `event` | String | Yes | Platform event code | Originating business event | `policy.issued` |
| `channel` | Enum | Yes | `email`, `sms`, `whatsapp`, `inapp` | Dispatch transport channel | `email` |
| `to` | String | Yes | Email address, E.164 phone, or user ID | Target recipient destination | `customer@example.com` |
| `subject` | String | No | Plain text | Message title or subject line | `Your policy AE-FIR-B2C-2026-000105 is issued` |
| `status` | Enum | Yes | `sent`, `logged`, `failed` | Transmission status | `sent` |
| `error` | Text | No | System error string or null | Gateway error trace if transmission failed | `Connection timeout to smtp.mailgun.org:587` |

---

## 5. Step-by-Step: Investigating a Failed Customer Notification
1. Sign in as an Operations specialist or Administrator (`ops@portal.test` or `config1@portal.test`).
2. Navigate to **Admin** -> **Sent messages** (`/admin/outbox`).
3. In the **Filter** box, enter `failed` to isolate undelivered messages.
4. *[Screenshot Placeholder: Outbox Table filtered by status='failed']*
5. Locate the message for the customer:
   - Inspect the `To` column to ensure the customer's email address is spelled correctly.
   - Inspect the `Error` column to identify the failure cause (e.g. `Invalid recipient email address` or `SMTP 550 Mailbox does not exist`).
6. If the email address was incorrect, navigate to `/admin/fieldDefinitions` or the customer policy page to update contact records, then re-dispatch from the policy servicing screen.

---

## 6. How to Edit / Deactivate / Delete
- **Read-Only Ledger**: The outbox is an append-only compliance audit trail.
- Records **cannot** be created, edited, or deleted through the administration console (`readOnly: true`, `noCreate: true`, `noDelete: true`).
- Records persist indefinitely to maintain legal proof of policy and cancellation notices.

---

## 7. Approval Flow
- The Outbox is a read-only monitoring interface and does not participate in maker-checker approval workflows.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Messaging engine (`api/src/lib/messaging.js`) inserts into `outbox` on every dispatch call.
- **Downstream Consumers (What uses this AFTER)**:
  - Operations team verifies delivery proof for statutory renewal and cancellation notices.
  - Test email tool (`/admin/templates`) queries the outbox to confirm diagnostic test outcomes.

---

## 9. Business Rules & Security
1. **Append-Only Immutability**: The `outbox` table cannot be altered via administrative APIs. Even configuration administrators cannot truncate or modify outbox entries.
2. **Secret Scrubbing**: OTP authentication codes sent via SMS/Email are logged with standard text; passwords or credit card tokens are never logged.

---

## 10. Common Errors & Troubleshooting

| Outbox Status / Error | Cause | Resolution |
|---|---|---|
| `logged` | Outbound SMTP is disabled (`email.smtp.enabled = false`). | If live email delivery is desired, set `email.smtp.enabled` to `true` in `/admin/parameters`. |
| `failed (ECONNREFUSED)` | SMTP host is unreachable. | Check `email.smtp.host` and `email.smtp.port` in `/admin/parameters`. |
| `failed (Invalid login)` | SMTP credentials rejected by mail provider. | Update `email.smtp.user` and `email.smtp.password` in `/admin/parameters`. |

---

## 11. Sample Record
- **ID**: `2041`
- **When**: `2026-10-22 12:15:30`
- **Event**: `quote.saved`
- **Channel**: `email`
- **To**: `khaled.almansoori@business.ae`
- **Subject**: `Your quote Q-AE-FIR-2026-000210`
- **Status**: `sent`
- **Error**: `—`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="outbox"`.
- **API Endpoint**: `GET /api/platform/entities/outbox?status={status}&q={query}`
- **Database Table**: `outbox`
- **Ordering**: `ORDER BY id DESC LIMIT 500`
