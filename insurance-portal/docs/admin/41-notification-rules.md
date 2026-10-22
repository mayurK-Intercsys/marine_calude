# 41. Notification Rules

---

## 1. Overview
The **Notification Rules** module (`/admin/notificationRules`) configures the platform's event-driven notification routing matrix. It defines how lifecycle events (such as quotation creation, underwriting referrals, policy issuance, claim registration, and renewal reminders) map to specific delivery channels (`email`, `sms`, `whatsapp`, `inapp`), target recipients (`customer`, `broker`, `underwriters`, `ops`, or `custom`), and message templates.

---

## 2. Who Can Access
- **Required Permission**: `admin.notifications`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Form
Rendered via the `EntityManager` component:
- **Header**: "Notification rules" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: event` (e.g. `policy.issued`, `referral.created`, `claim.registered`).
- **Search Bar**: Substring search across events, template codes, and descriptions.
- **Table Columns**:
  1. `Event`: Platform trigger event name.
  2. `Channel`: Dispatch mode (`email`, `sms`, `whatsapp`, `inapp`).
  3. `Recipient`: Target audience classification (`customer`, `broker`, `underwriters`, `ops`, `custom`).
  4. `Custom recipients`: Comma-separated addresses (if recipient is `custom`).
  5. `Template code`: Key linking to `message_templates`.
  6. `Active`: Status checkmark (`✓` or `✗`).
  7. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Event**: Select dropdown containing all 14 platform event triggers.
- **Channel**: Select dropdown (`email`, `sms`, `whatsapp`, `inapp`).
- **Recipient**: Select dropdown (`customer`, `broker`, `underwriters`, `ops`, `custom`).
- **Custom recipients**: Text input (required if recipient is `custom`; comma-separated emails or phones).
- **Template code**: Text input linking to a valid template code in `/admin/templates`.
- **Description**: Summary notes on the business trigger.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique rule record ID | `8` |
| `event` | Select | Yes | *See Platform Events list below* | Lifecycle event triggering the rule | `policy.issued` |
| `channel` | Select | Yes | `email`, `sms`, `whatsapp`, `inapp` | Communication channel | `email` |
| `recipient` | Select | Yes | `customer`, `broker`, `underwriters`, `ops`, `custom` | Recipient routing target | `customer` |
| `custom_to` | String | Conditional | Comma-separated emails or phones | Target addresses if recipient is `custom` | `claims.lead@insurer.example` |
| `template_code`| String | Yes | Valid code in `message_templates` | Template to render and dispatch | `policy_issued` |
| `description` | String | No | Plain text | Functional explanation | `Customer policy schedule and receipt` |
| `active` | Boolean | Yes | `true`, `false` | Enables rule evaluation | `true` |

---

## 5. Complete Platform Event Triggers

| Event Code | Trigger Condition in Platform | Available Payload Data |
|---|---|---|
| `quote.saved` | Customer or broker saves an initial quotation | `quoteRef`, `productName`, `total`, `validUntil`, `link` |
| `referral.created` | Quote breaks an underwriting rule and requires review | `reference`, `customerName`, `reasons`, `link` |
| `referral.decided` | Underwriter approves or declines a referral | `reference`, `status`, `loading`, `warranty`, `link` |
| `policy.issued` | Payment confirmed; active policy schedule bound | `policyNo`, `customerName`, `total`, `inceptionDate`, `expiryDate`, `link` |
| `claim.registered` | Customer or broker submits a new loss notification | `reference`, `policyNo`, `lossDate`, `cause`, `link` |
| `renewal.ready` | Batch job generates renewal quote (45 days before expiry) | `policyNo`, `quoteRef`, `expiryDate`, `total`, `link` |
| `renewal.reminder` | Automated reminder dispatched at 30, 15, 7, and 1 days | `policyNo`, `daysLeft`, `total`, `link` |
| `autorenew.failed` | Saved card charge failed on auto-renewal attempt (7 days before) | `policyNo`, `error`, `link` |
| `invoice.due` | Monthly or quarterly adjustment invoice generated | `invoiceNo`, `policyNo`, `amount`, `dueDate`, `link` |
| `declaration.due` | Wage or marine monthly turnover declaration due | `policyNo`, `period`, `dueDate`, `link` |
| `payment.failed` | Customer card declined by payment gateway | `quoteRef`, `error`, `link` |
| `survey.completed` | Risk engineer submits completed survey report | `site`, `grade`, `recommendations`, `link` |
| `opencover.turnover`| Marine open cover certificate turnover reaches 80% / 100% | `policyNo`, `turnoverLimit`, `usedAmount`, `link` |
| `document.uploaded`| Customer or broker uploads verification document for review | `reference`, `docType`, `link` |

---

## 6. Recipient Routing Rules
- **`customer`**: Delivers to the email address or mobile number provided in the quote contact details.
- **`broker`**: Delivers to the signed-in broker user and carbon-copies the agency administrative contact.
- **`underwriters`**: Dispatches in-app notifications (bell icon) and emails to all users holding the `referrals.decide` permission.
- **`ops`**: Dispatches in-app notifications and emails to users with the `ops` role (e.g. for manual bank transfers and document verification).
- **`custom`**: Resolves literal emails or mobile numbers specified in `custom_to`.

---

## 7. Step-by-Step: Adding an In-App Notification Rule
1. Navigate to **Admin** -> **Notification rules** (`/admin/notificationRules`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Event**: Select `document.uploaded`.
   - **Channel**: Select `inapp`.
   - **Recipient**: Select `ops`.
   - **Template code**: Enter `document_uploaded`.
   - **Description**: `Alert operations underwriter team when claim documents are uploaded`.
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Notification Rule Modal for document.uploaded]*
5. Click **Save** (`admin.save`).
6. When a customer uploads a claim photo, an in-app badge will immediately alert operations staff under the bell icon.

---

## 8. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify recipient routing, template code, or active status.
- **Temporarily Silence Notifications**: Rather than deleting a rule, uncheck **Active** and save. The platform skips inactive rules during event dispatch.
- **Delete**: Click **Delete** and confirm prompt.

---

## 9. Approval Flow
- Notification rules apply immediately upon save and do **not** enter the `Pending changes` approval queue.
- Updates are audited under `config.notificationRules.create`, `config.notificationRules.update`, and `config.notificationRules.delete`.

---

## 10. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Target template in `/admin/templates` with matching `code` and `channel`.
- **Downstream Consumers (What uses this AFTER)**:
  - Event dispatcher (`api/src/lib/messaging.js`) iterates all active notification rules matching `event`, renders the appropriate template, and delivers to target recipients.

---

## 11. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Notification not sent | No active rule exists for the triggered event and channel. | Verify that a notification rule exists for the event with `active = true`. |
| Missing template error in logs | Template code specified in rule does not exist in `message_templates`. | Ensure `template_code` matches an existing record in `/admin/templates` for that channel. |
| In-app notification not received | Target user does not belong to the recipient group. | Confirm user has the required role (e.g. `ops` for `recipient = ops`). |

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="notificationRules"`.
- **API Endpoints**:
  - `GET /api/platform/entities/notificationRules?filter={event}`
  - `POST /api/platform/entities/notificationRules`
  - `PUT /api/platform/entities/notificationRules/:id`
  - `DELETE /api/platform/entities/notificationRules/:id`
- **Database Table**: `notification_rules`
- **Dispatcher Engine**: `api/src/lib/messaging.js` (`dispatch`).
