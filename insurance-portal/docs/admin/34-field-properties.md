# 34. Field Properties

---

## 1. Overview
The **Field Properties** module (`/admin/fieldDefinitions`) provides a centralized interface for configuring UI form field behaviors, labels, and validations across all customer and broker journeys. Administrators can customize bilingual labels, add rich contextual tooltips in English and Arabic, enforce minimum and maximum numerical limits, apply regular expression validation patterns, connect inputs to master drop-down lists, toggle mandatory requirements, or link fields to online help articles without touching application source code.

---

## 2. Who Can Access
- **Required Permission**: `admin.fields`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Field properties".
- **Filter Bar**: `Filter: screen` (e.g. `common.details`, `fire.premise`, `marine.shipment`, `wc.workforce`, `engineering.items`).
- **Search Bar**: Substring search across screen name, field key, English label, and Arabic label.
- **Table Columns**:
  1. `Screen`: Form screen identifier (e.g. `common.details`).
  2. `Field`: UI field key name (e.g. `tradeLicence`).
  3. `Label (English)`: Custom label text (blank inherits built-in translation).
  4. `Field type`: Control type (`text`, `number`, `money`, `date`, `select`, `radio`, `checkbox`, `textarea`, `email`, `tel`).
  5. `Drop-down list`: Linked list from `lookup_lists` if field is a selection menu.
  6. `Visible`: Screen visibility flag (`✓` or `✗`).
  7. `Mandatory`: Required field flag (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Screen**: Required screen code (e.g. `fire.premise`).
- **Field**: Required field key (e.g. `construction`).
- **Bilingual Labels**: `Label (English)` and `Label (Arabic)`. Leaving blank preserves the built-in i18n translation.
- **Bilingual Tooltips**: `Tooltip (English)` and `Tooltip (Arabic)`. Rendered on hover, focus, or tap.
- **Bilingual Placeholders**: `Placeholder (English)` and `Placeholder (Arabic)`.
- **Field type**: Select dropdown (`text`, `number`, `money`, `date`, `select`, etc.).
- **Drop-down list**: Select dropdown dynamically populated from `lookup_lists`.
- **Behavior Flags**: `Visible`, `Mandatory`, `Read only` checkboxes.
- **Validation Bounds**: `Minimum` and `Maximum` numbers.
- **Pattern**: Regular expression string for client and server validation (e.g. `^CN-\d{7}$`).
- **Default**: Default initial value.
- **Help article**: Slug linking to an online help article in `/help/:slug`.
- **Order**: Integer sort index.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record ID | `15` |
| `screen` | String | Yes | Valid screen identifier | Target form screen | `common.details` |
| `field_key` | String | Yes | Alphanumeric field identifier | HTML input field key | `tradeLicence` |
| `label_en` | String | No | Text or blank | Overriding English label | `Commercial Registration No.` |
| `label_ar` | String | No | Text or blank | Overriding Arabic label | `رقم السجل التجاري` |
| `tooltip_en` | Text | No | Text | English helper tooltip text | `As shown on your DED trade licence` |
| `tooltip_ar` | Text | No | Text | Arabic helper tooltip text | `كما هو موضح في الرخصة التجارية` |
| `placeholder_en`| String | No | Text | English placeholder text | `e.g. CN-1234567` |
| `placeholder_ar`| String | No | Text | Arabic placeholder text | `مثال: CN-1234567` |
| `field_type` | Select | No | `text`, `number`, `money`, `date`, `select`, `radio`, `checkbox`, `textarea`, `email`, `tel` | Form input rendering mode | `text` |
| `lookup_list` | Select (FK) | No | Valid code in `lookup_lists` | Drop-down list source | `FIRE.construction` |
| `visible` | Boolean | Yes | `true`, `false` | Renders or hides field in UI | `true` |
| `mandatory` | Boolean | Yes | `true`, `false` | Enforces required input | `true` |
| `readonly` | Boolean | Yes | `true`, `false` | Renders input as disabled | `false` |
| `min_value` | Number | No | Numeric value | Minimum acceptable number | `0` |
| `max_value` | Number | No | Numeric value | Maximum acceptable number | `100000000` |
| `pattern` | String | No | Valid RegExp string | Regex pattern checked client & API | `^CN-\d{7}$` |
| `default_value`| String | No | String | Initial form value | `AED` |
| `help_slug` | String | No | Valid slug in `help_articles` | Opens help article drawer | `trade-licence-guide` |
| `sort` | Integer | No | Integer | Field display sequence | `10` |

---

## 5. Supported Journey Screens

The front-end journeys dynamically load field properties through `/api/ui/fields/:screen`:

| Screen Code | Journey Step & Description |
|---|---|
| `common.details` | Customer and company details (all products) |
| `common.payment` | Payment method and billing details (all products) |
| `auth.login` | Portal sign-in form |
| `fire.premise` | Fire: Property location, construction, and protection |
| `fire.business` | Fire: Business occupancy and trade |
| `fire.cover` | Fire: Sums insured and extension selections |
| `fire.quote` | Fire: Quotation breakdown and deductible selection |
| `marine.type` | Marine: Cover type selection (single transit, open cover) |
| `marine.shipment` | Marine: Cargo goods, packaging, vessel, voyage origin/destination |
| `marine.value` | Marine: Invoice value, freight, duty, clauses (ICC-A/B/C) |
| `marine.quote` | Marine: Quotation summary and war/strikes options |
| `marine.opencover` | Marine: Open cover turnover estimates, commodity shares, limits |
| `marine.certificate`| Marine: Open cover certificate declaration |
| `wc.workforce` | Workmen's Comp: Trade, job types, headcount, wage bands |
| `wc.plan` | Workmen's Comp: Plan selection (Essential vs Complete) |
| `engineering.type` | Engineering: Product classification (CAR, EAR, CPM, MB, EEI) |
| `engineering.items`| Engineering: CPM equipment fleet item details |
| `engineering.project`| Engineering: CAR/EAR project parameters, permit, contract value |
| `engineering.annual`| Engineering: Annual CAR declared projects |
| `engineering.cover`| Engineering: Third-party liability and add-on covers |
| `policy.servicing` | Policy servicing (claims, contact changes, cancellation) |

*Note on Repeated Rows*: Multi-item screens (e.g. multiple buildings or equipment rows) share a base key definition (`building0`, `building1` -> `building`).

---

## 6. Step-by-Step: Adding a Tooltip and Regex Validation
1. Navigate to **Admin** -> **Field properties** (`/admin/fieldDefinitions`).
2. In the **Filter** box, enter `common.details`.
3. Locate the field `tradeLicence`.
4. Click **Edit**.
5. *[Screenshot Placeholder: Field Properties Edit Form showing Tooltip and Pattern]*
6. Update:
   - **Tooltip (English)**: `Enter your 7-digit trade licence number issued by the Economic Development Department.`
   - **Tooltip (Arabic)**: `أدخل رقم رخصة التجارة المكون من 7 أرقام والصادر من دائرة التنمية الاقتصادية.`
   - **Pattern (regular expression)**: `^\d{7}$`
   - **Placeholder (English)**: `e.g. 1234567`
7. Click **Save** (`admin.save`).
8. Refresh the quote details page: hover over the info icon next to Trade Licence to see the localized tooltip; enter an invalid string to verify that regex validation prevents submission.

---

## 7. Approval Flow
- Field definitions apply immediately and do **not** enter the `Pending changes` approval queue.
- Updates are audited under `config.fieldDefinitions.create`, `config.fieldDefinitions.update`, and `config.fieldDefinitions.delete`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Linked `lookup_lists` if assigning a drop-down source.
  - Linked `help_articles` if specifying `help_slug`.
- **Downstream Consumers (What uses this AFTER)**:
  - UI front-end components render tooltips, placeholders, and enforce client-side validation.
  - API validation middleware (`/api/quotes`) evaluates mandatory and pattern rules on customer submissions.

---

## 9. Business Rules & Validations: System Core Fields Lock
To prevent platform lockouts or broken insurance contracts, core legal identity fields are strictly locked against hiding or being made optional:

### Locked Core Fields (`CORE_FIELDS`)
- **`common.details`**: `companyName`, `tradeLicence`, `licenceExpiry`, `contactName`, `contactIdNo`, `email`, `mobile`, `inceptionDate`.
- **`auth.login`**: `email`, `password`.

### Enforcement Rule
If an administrator sets `visible = false` or `mandatory = false` on any locked core field, the API rejects the update with HTTP 400 `FIELD_LOCKED`:
*"This field is required by the system and must stay visible and mandatory"*.

### Regex Syntax Validation
When saving, the `pattern` string is validated by compiling it (`new RegExp(row.pattern)`). If invalid, the API rejects with HTTP 400 `PATTERN_INVALID`.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `FIELD_LOCKED` | Attempted to hide or make a core field optional. | Core identity fields (email, signatory, licence) must remain visible and mandatory. Leave checkboxes checked. |
| `PATTERN_INVALID` | Invalid regular expression syntax in `pattern` field. | Test regex syntax (e.g. ensure brackets and escaping are valid) before saving. |
| Tooltip not showing in Arabic | `tooltip_ar` field was left blank. | Enter the Arabic translation in `tooltip_ar`. |

---

## 11. Sample Configuration: Emirates ID Validation
- **Screen**: `common.details`
- **Field**: `contactIdNo`
- **Label (English)**: `Emirates ID of Signatory`
- **Label (Arabic)**: `الهوية الإماراتية للمفوض بالتوقيع`
- **Pattern**: `^784-[0-9]{4}-[0-9]{7}-[0-9]{1}$`
- **Placeholder**: `784-1985-1234567-1`
- **Tooltip**: `Must be a valid 15-digit UAE Emirates ID format.`
- **Mandatory**: `true`
- **Visible**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="fieldDefinitions"`.
- **API Endpoints**:
  - `GET /api/platform/entities/fieldDefinitions?filter={screen}`
  - `POST /api/platform/entities/fieldDefinitions`
  - `PUT /api/platform/entities/fieldDefinitions/:id`
  - `DELETE /api/platform/entities/fieldDefinitions/:id`
  - Front-end consumer: `GET /api/ui/fields/:screen`
- **Database Table**: `field_definitions`
- **Client Cache Helper**: `web/lib/fieldConfig.js`
