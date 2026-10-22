# 32. System Parameters

---

## 1. Overview
The **System Parameters** module (`/admin/parameters`) controls tenant-wide operational settings, security thresholds, integration credentials, and governance policies. It allows administrators to update tenant branding, session expiration windows, multi-factor authentication (OTP) limits, document upload quotas, SMTP server credentials, and maker-checker approval requirements without restarting backend services.

---

## 2. Who Can Access
- **Required Permission**: `admin.parameters`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "System parameters".
- **Filter Bar**: `Filter: group` (e.g. `general`, `security`, `email`, `sms`, `documents`, `licence`, `products`).
- **Search Bar**: Substring search across keys and descriptions.
- **Table Columns**:
  1. `Key`: Dot-notated parameter identifier (e.g. `security.otpMinutes`).
  2. `Group`: Functional subsystem category.
  3. `Type`: Data type (`string`, `number`, `boolean`, `json`, `secret`).
  4. `Value`: Current parameter value (masked as `••••••` for secret types).
  5. `Description`: Administrative documentation of purpose and impact.
  6. `Actions`: **Edit** (Create and Delete are also available).

### Edit Parameter Modal
- **Key**: Parameter identifier (read-only when editing).
- **Group**: Categorization string.
- **Type**: Select dropdown (`string`, `number`, `boolean`, `json`, `secret`).
- **Value**: Dynamic input field based on type:
  - `boolean`: Checkbox.
  - `number`: Numeric input.
  - `secret`: Text field displaying `••••••` (leaving unchanged preserves existing secret).
  - `json`: JSON code editor textarea.
  - `string`: Standard text input.
- **Description**: Textarea.

---

## 4. Complete System Parameters Reference

| Key | Group | Type | Default Value | Description & Business Impact |
|---|---|---|---|---|
| `general.insurerName` | `general` | `string` | `[INSURER LEGAL NAME]` | Legal insurer entity name rendered in policy schedules, certificates, and invoices |
| `general.supportEmail` | `general` | `string` | `support@insurer.example` | Customer support email displayed in portal headers and notification footers |
| `general.supportPhone` | `general` | `string` | `[HELPLINE]` | Customer helpline number displayed across customer and broker journeys |
| `general.defaultLocale` | `general` | `string` | `en` | Default portal language fallback (`en` or `ar`) |
| `security.sessionHours` | `security` | `number` | `12` | JWT authentication session lifetime in hours |
| `security.otpMinutes` | `security` | `number` | `5` | Validity window in minutes for customer sign-in one-time passcodes |
| `security.otpMaxPer15Min`| `security` | `number` | `5` | Rate-limit: maximum OTP code requests allowed per 15 minutes per phone/email |
| `email.smtp.enabled` | `email` | `boolean`| `false` | When true, dispatches live emails via SMTP; when false, records messages in outbox only |
| `email.smtp.host` | `email` | `string` | `""` | SMTP mail server hostname (use `json` to test mock delivery) |
| `email.smtp.port` | `email` | `number` | `587` | SMTP mail server port (e.g. 587 for STARTTLS, 465 for SSL) |
| `email.smtp.secure` | `email` | `boolean`| `false` | True for SSL/TLS connections on port 465 |
| `email.smtp.user` | `email` | `string` | `""` | SMTP authentication username |
| `email.smtp.password` | `email` | `secret` | `""` | SMTP authentication password (stored encrypted and masked) |
| `email.from` | `email` | `string` | `Insurance Portal <no-reply@insurer.example>` | Standard sender address in email header |
| `sms.provider` | `sms` | `string` | `log` | SMS gateway adapter (`log` records to DB; custom adapters connect to SMS gateways) |
| `sms.senderId` | `sms` | `string` | `INSURER` | Alphanumeric SMS Sender ID registered with telecom authority |
| `documents.maxSizeMb` | `documents`| `number` | `10` | Maximum file size allowed for customer and broker document uploads (MB) |
| `documents.allowedTypes` | `documents`| `json` | `["application/pdf", "image/jpeg", "image/png"]` | MIME types allowed for file uploads (validated via magic bytes inspection) |
| `licence.warnDays` | `licence` | `number` | `30` | Number of days before licence expiry to trigger administrative warning banner |
| `products.requireApproval`| `products`| `boolean`| `false` | Enables 4-eyes maker-checker approval queue (`/admin/changes`) for product configuration |

---

## 5. Step-by-Step: How to Configure System Parameters

### Example: Enabling the Product Configuration Approval Queue
1. Navigate to **Admin** -> **System parameters** (`/admin/parameters`).
2. Type `products` into the **Filter** box.
3. Locate `products.requireApproval`.
4. Click **Edit**.
5. *[Screenshot Placeholder: Edit Modal for products.requireApproval toggle]*
6. Toggle the **Value** checkbox to checked (`true`).
7. Click **Save** (`admin.save`).
8. The backend automatically calls `params.invalidate()`. All subsequent edits to products, covers, deductibles, charges, and taxes will immediately route to `/admin/changes`.

### Example: Configuring Production SMTP
1. In `/admin/parameters`, type `email` into the **Filter** box.
2. Edit `email.smtp.host` -> set to your provider (e.g. `smtp.sendgrid.net`).
3. Edit `email.smtp.port` -> set to `587`.
4. Edit `email.smtp.user` -> enter API user (e.g. `apikey`).
5. Edit `email.smtp.password` -> enter API key.
6. Edit `email.smtp.enabled` -> toggle to `true`.
7. Navigate to **Email and SMS templates** (`/admin/templates`) and use **Send a test email** to verify delivery.

---

## 6. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** on any parameter row. Modify value or description.
- **Secret Handling**: For `secret` parameters (such as `email.smtp.password`), the UI renders `••••••`. If you do not enter a new value, the existing password is preserved without overwrite.
- **Delete**: Core system parameters should never be deleted. Deleting a required parameter causes the platform to fall back to hardcoded code defaults.

---

## 7. Approval Flow
- System parameter edits take effect immediately and do **not** enter the `Pending changes` approval queue.
- Updates trigger the in-process cache eviction hook `params.invalidate()` and are audited under `config.parameters.update`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - None (initialized via database migrations and seeds).
- **Downstream Consumers (What uses this AFTER)**:
  - `params.get(key, default)` is called throughout the API for session timeouts, OTP validation, document checks, and email dispatch.

---

## 9. Business Rules & Validations
1. **Cache Invalidation**: The API caches parameters in memory for high-performance reading. Any mutation via `/api/platform/entities/parameters` triggers `params.invalidate()`, reloading fresh values on the next request without process restarts.
2. **Secret Masking**: Secret parameters are masked in GET API responses to prevent credential exposure in browser developer tools or audit logs.
3. **Data Type Parsing**: Values submitted as strings for `number`, `boolean`, or `json` types are automatically parsed and typecast by the platform router (`toRow`).

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Emails remaining in outbox as `logged` | `email.smtp.enabled` is `false`. | Set `email.smtp.enabled` to `true` and configure valid SMTP host and credentials. |
| Upload fails with `FILE_TOO_LARGE` | Upload exceeds `documents.maxSizeMb`. | Increase `documents.maxSizeMb` or compress the document before uploading. |
| Customer OTP expiring too quickly | `security.otpMinutes` is set too low. | Increase `security.otpMinutes` (e.g. from 5 to 10 minutes). |

---

## 11. Sample Configuration: Staging vs Production Parameters
- **Staging / QA**:
  - `email.smtp.host`: `json` (Records message structure without sending real emails)
  - `products.requireApproval`: `false` (Enables rapid testing by single admin)
  - `security.sessionHours`: `24`
- **Production**:
  - `email.smtp.host`: `smtp.mailgun.org`
  - `email.smtp.enabled`: `true`
  - `products.requireApproval`: `true` (Enforces strict four-eyes maker-checker compliance)
  - `security.sessionHours`: `8`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="parameters"`.
- **API Endpoints**:
  - `GET /api/platform/entities/parameters`
  - `PUT /api/platform/entities/parameters/:key`
- **Database Table**: `system_parameters`
- **Internal Helper**: `api/src/lib/params.js` (`get`, `invalidate`).
