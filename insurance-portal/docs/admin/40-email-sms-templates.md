# 40. Email and SMS Templates

---

## 1. Overview
The **Email and SMS Templates** module (`/admin/templates`) manages the communication copy dispatched across email, SMS, WhatsApp, and in-app notifications. Administrators can author bilingual English and Arabic templates using dynamic mustache `{{placeholder}}` variables, inspect the wrapper layout, and trigger live end-to-end SMTP test dispatches directly from the administrative console.

---

## 2. Who Can Access
- **Required Permission**: `admin.templates`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Test Email Workbench (`TestEmail`)
A dedicated diagnostic card rendered above the template management table:
- **Header**: "Send a test email" (`admin.testEmail`).
- **Email Input**: Field `te` for entering a recipient address.
- **Send Button**: Calls `/api/platform/email/test` to dispatch a live test email through the configured SMTP provider.
- **Result Banner**: Displays delivery outcome (`testResult`) showing status (e.g. `sent` or `logged`) and error details if delivery failed.

### Templates Master Table
Rendered via the `EntityManager` component:
- **Header**: "Email and SMS templates" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: code` (e.g. `otp`, `quote_saved`, `policy_issued`, `referral_created`).
- **Search Bar**: Substring search across template code, subject, and body text.
- **Table Columns**:
  1. `Code`: Template identifier (e.g. `policy_issued`).
  2. `Channel`: Dispatch channel badge (`email`, `sms`, `whatsapp`, `inapp`).
  3. `Language`: Language code (`en` or `ar`).
  4. `Subject`: Email subject line (or notification title).
  5. `Active`: Status checkmark (`✓` or `✗`).
  6. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Code**: Unique template code string (e.g. `claim_acknowledged`).
- **Channel**: Select dropdown (`email`, `sms`, `whatsapp`, `inapp`).
- **Language**: Select dropdown (`en` for English, `ar` for Arabic).
- **Subject**: String input (rendered for email and in-app channels).
- **Body**: Multi-line textarea containing HTML / plain text and `{{placeholders}}`. Hint: `Body (use {{placeholders}})`.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique template ID | `12` |
| `code` | String | Yes | Alphanumeric / snake_case (2–60 chars) | Functional template identifier | `policy_issued` |
| `channel` | Select | Yes | `email`, `sms`, `whatsapp`, `inapp` | Delivery channel | `email` |
| `locale` | Select | Yes | `en`, `ar` | Content language | `en` |
| `subject` | String | Conditional | Text (required for email/inapp) | Email subject line or notification title | `Your policy {{policyNo}} is issued` |
| `body` | Textarea | Yes | HTML or plain text with `{{placeholders}}` | Message content body | `<p>Dear {{customerName}}, your policy {{policyNo}} is ready.</p>` |
| `active` | Boolean | Yes | `true`, `false` | Enables template resolution | `true` |

---

## 5. Supported Dynamic Placeholders

The messaging engine (`api/src/lib/messaging.js`) interpolates data objects into `{{tokens}}` at dispatch:

| Placeholder Token | Resolved Value | Available Events |
|---|---|---|
| `{{customerName}}` | Full name of policyholder or authorized contact | All customer events |
| `{{quoteRef}}` | Quotation reference number | `quote.saved`, `referral.*` |
| `{{policyNo}}` | Active policy number | `policy.issued`, `renewal.*`, `endorsement.*` |
| `{{productName}}` | Localized product commercial name | All product events |
| `{{total}}` | Formatted premium currency string (e.g. `AED 4,250.00`) | Quotes, policies, invoices |
| `{{validUntil}}` | Formatted expiry date of quotation | `quote.saved` |
| `{{inceptionDate}}`| Policy cover start date | `policy.issued` |
| `{{expiryDate}}` | Policy cover end date | `policy.issued`, `renewal.*` |
| `{{link}}` | One-click authenticated deep-link to portal document / quote | All notifications |
| `{{reference}}` | Claim or referral tracking reference | Claims, referrals |
| `{{code}}` | 6-digit numeric OTP authentication code | Sign-in, registration |
| `{{minutes}}` | Validity window of OTP in minutes | Sign-in, registration |
| `{{docType}}` | Localized document type name | `document.uploaded` |

---

## 6. Email Layout & HTML Wrapper
When dispatching via the `email` channel, the message body is automatically wrapped inside the platform's responsive email template:
- Header: Insurer legal name (`general.insurerName`) and logo.
- Content: The rendered `body` HTML.
- Footer: Customer helpline (`general.supportPhone`), support email (`general.supportEmail`), and statutory disclaimer.

---

## 7. Step-by-Step: Editing a Template and Sending a Test Email

### Step 1: Edit an Existing Template
1. Navigate to **Admin** -> **Email and SMS templates** (`/admin/templates`).
2. Type `policy_issued` into the **Filter** box.
3. Locate the row with `channel = email` and `locale = en`. Click **Edit**.
4. Update the **Subject**:
   `Welcome to {{insurerName}} — Your policy {{policyNo}} is issued`
5. In the **Body**, add custom wording:
   ```html
   <p>Dear {{customerName}},</p>
   <p>Thank you for choosing us. Your {{productName}} policy <strong>{{policyNo}}</strong> has been successfully issued.</p>
   <p>Coverage is active from {{inceptionDate}} to {{expiryDate}}. Total premium paid: {{total}}.</p>
   <p><a href="{{link}}">Download your Policy Schedule and Tax Invoice</a></p>
   ```
6. Click **Save** (`admin.save`).

### Step 2: Test Live SMTP Dispatch
1. In the **Send a test email** card at the top of the screen:
2. Enter your email in the **Email** input (e.g. `admin@insurer.example`).
3. Click **Send** (`admin.send`).
4. *[Screenshot Placeholder: Send a Test Email Card showing status 'sent']*
5. Inspect the result message:
   - If SMTP is configured and active: `Result: sent`
   - If SMTP is disabled (`email.smtp.enabled = false`): `Result: logged` (Check `/admin/outbox`)
   - If credentials failed: `Result: failed [Error message]`

---

## 8. Approval Flow
- Template modifications apply immediately and do **not** enter the `Pending changes` approval queue.
- Actions are audited under `config.templates.update`.

---

## 9. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - System parameters in `email.smtp.*` for live email delivery.
- **Downstream Consumers (What uses this AFTER)**:
  - Notification Rules (`/admin/notificationRules`) map system events to these template codes.
  - Authentication engine (`/api/auth`) uses template `otp`.
  - Document uploads use template `document_uploaded`.

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| `Result: failed Connection timeout` | SMTP host or port blocked by firewall. | Verify `email.smtp.host` and `email.smtp.port` in `/admin/parameters`. Confirm firewall permits outbound connections on port 587. |
| Missing placeholder values in email | Token name misspelled in template body. | Verify placeholder spelling against the supported tokens table (e.g. use `{{policyNo}}`, not `{{policy_number}}`). |
| Arabic text rendering left-to-right | Missing RTL styling in raw HTML snippet. | Wrap Arabic content in `<div dir="rtl">` or rely on the portal layout's automatic locale direction. |

---

## 11. Sample Configuration: SMS OTP Template
- **Code**: `otp`
- **Channel**: `sms`
- **Language**: `en`
- **Subject**: `null` (Not used for SMS)
- **Body**: `Your sign-in code is {{code}}. It expires in {{minutes}} minutes.`
- **Arabic Body**: `رمز الدخول الخاص بك هو {{code}}. تنتهي صلاحيته خلال {{minutes}} دقائق.`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="templates"`.
- **API Endpoints**:
  - `GET /api/platform/entities/templates?filter={code}`
  - `POST /api/platform/entities/templates`
  - `PUT /api/platform/entities/templates/:id`
  - `DELETE /api/platform/entities/templates/:id`
  - Test Email Endpoint: `POST /api/platform/email/test` (requires `admin.templates`)
- **Database Table**: `message_templates`
- **Dispatcher Engine**: `api/src/lib/messaging.js` (`deliver`, `render`).
