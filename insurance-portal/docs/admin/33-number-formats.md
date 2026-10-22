# 33. Number Formats

---

## 1. Overview
The **Number Formats** module (`/admin/numberFormats`) configures the sequential identification patterns used to generate unique, gap-free reference numbers for insurance documents. It controls the structure of quotation numbers, renewal quotations, active policy schedules, loss claim notifications, endorsements, tax invoices, and marine shipment certificates, supporting product, country, and channel-specific scoping.

---

## 2. Who Can Access
- **Required Permission**: `admin.numbering`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Form
Rendered via the `EntityManager` component:
- **Header**: "Number formats" with **Add** button (`admin.add`).
- **Search Bar**: Substring search across entity names, patterns, and descriptions.
- **Table Columns**:
  1. `Document` (`entity`): Document type (`quote`, `renewal_quote`, `policy`, `claim`, `endorsement`, `invoice`, `certificate`).
  2. `Product (blank = all)`: Specific product code or blank for global format.
  3. `Country (blank = all)`: Specific ISO country code or blank for global format.
  4. `Channel (b2c / b2b, blank = all)`: Distribution channel scope.
  5. `Pattern`: Tokenized numbering pattern.
  6. `Description`: Administrative description.
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Document** (`entity`): Select dropdown (`quote`, `renewal_quote`, `policy`, `claim`, `endorsement`, `invoice`, `certificate`).
- **Product**: Text input (leave empty for tenant default).
- **Country**: Text input (e.g. `AE`).
- **Channel**: Text input (`b2c`, `b2b`, or empty).
- **Pattern**: String input with mandatory `{SEQ:n}` token. Hint: `{COUNTRY} {LINE} {CHANNEL} {PRODUCT} {YYYY} {YY} {MM} {POLICY} {SEQ:6}`.
- **Description**: Plain text notes.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record identifier | `3` |
| `entity` | Select | Yes | `quote`, `renewal_quote`, `policy`, `claim`, `endorsement`, `invoice`, `certificate` | Target document classification | `policy` |
| `product_code` | String | No | Valid code in `products` or blank | Limits pattern to specified product | `FIRE` |
| `country_code` | String | No | 2-char ISO country code or blank | Limits pattern to specified country | `AE` |
| `channel` | String | No | `b2c`, `b2b`, or blank | Limits pattern to sales channel | `b2b` |
| `pattern` | String | Yes | Must contain `{SEQ:\d+}` | Sequential pattern string with tokens | `{COUNTRY}-{LINE}-{CHANNEL}-{YYYY}-{SEQ:6}` |
| `description` | String | No | Text | Explanation of numbering scheme | `Standard commercial policy numbering` |
| `active` | Boolean | Yes | `true`, `false` | Enables pattern evaluation | `true` |

---

## 5. Token Reference & Replacement Rules

The sequential number generator (`api/src/lib/numbering.js`) dynamically substitutes the following tokens at document creation:

| Token | Replacement Value | Example |
|---|---|---|
| `{COUNTRY}` | 2-character ISO country code of the risk | `AE` |
| `{LINE}` | Statutory line or product line code | `FIR`, `MAR`, `WC`, `ENG` |
| `{PRODUCT}` | Complete product code | `FIRE`, `MARINE` |
| `{CHANNEL}` | Uppercase sales channel | `B2C`, `B2B` |
| `{YYYY}` | 4-digit Gregorian year of issue/inception | `2026` |
| `{YY}` | 2-digit year of issue/inception | `26` |
| `{MM}` | 2-digit zero-padded current month | `10` |
| `{POLICY}` | Parent policy number (available for endorsements, certificates, invoices) | `AE-FIR-B2C-2026-000105` |
| `{SEQ:n}` | **Mandatory** gap-free atomic integer counter padded to `n` digits | `{SEQ:6}` -> `000105` |

---

## 6. Default Seeded Number Formats

| Document (`entity`) | Default Pattern | Example Generated Number |
|---|---|---|
| `quote` | `Q-{COUNTRY}-{LINE}-{YYYY}-{SEQ:6}` | `Q-AE-FIR-2026-000142` |
| `renewal_quote` | `R-{COUNTRY}-{LINE}-{YYYY}-{SEQ:6}` | `R-AE-FIR-2026-000018` |
| `policy` | `{COUNTRY}-{LINE}-{CHANNEL}-{YYYY}-{SEQ:6}` | `AE-FIR-B2C-2026-000105` |
| `claim` | `CLM-{COUNTRY}-{YYYY}-{SEQ:6}` | `CLM-AE-2026-000007` |
| `endorsement` | `{POLICY}-E{SEQ:3}` | `AE-FIR-B2C-2026-000105-E001` |
| `invoice` | `{POLICY}-INV{SEQ:3}` | `AE-FIR-B2C-2026-000105-INV001` |
| `certificate` | `{POLICY}/{SEQ:4}` | `AE-MAR-B2B-2026-000050/0001` |

---

## 7. Step-by-Step: How to Create a Product-Specific Number Format
1. Navigate to **Admin** -> **Number formats** (`/admin/numberFormats`).
2. Click **Add** (`admin.add`).
3. Enter:
   - **Document**: Select `policy`.
   - **Product**: Enter `MOTOR`.
   - **Country**: Enter `AE`.
   - **Channel**: Leave empty (applies to both B2C and B2B).
   - **Pattern**: `MOT-{COUNTRY}-{YYYY}-{SEQ:6}`.
   - **Description**: `Motor policy numbering sequence`.
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Number Format Form showing MOT-{COUNTRY}-{YYYY}-{SEQ:6}]*
5. Click **Save** (`admin.save`).
6. All future motor policies will be numbered like `MOT-AE-2026-000001`.

---

## 8. Specificity & Resolution Hierarchy
When issuing a document, the numbering service resolves the most specific matching format:
1. `entity + product_code + country_code + channel` (Most specific)
2. `entity + product_code + country_code`
3. `entity + product_code`
4. `entity + country_code`
5. `entity` (Tenant global fallback)

---

## 9. Business Rules & Validations
1. **Mandatory Sequence Token**: Every pattern must contain at least one `{SEQ:n}` token (e.g. `{SEQ:6}` or `{SEQ:4}`). Submitting a pattern without `{SEQ:n}` is rejected with HTTP 400 `PATTERN_NEEDS_SEQ`:
   *"Pattern must contain {SEQ:n}"*.
2. **Atomic Counter Allocation**: Counters are maintained in table `number_sequences` grouped by prefix. Counters increment atomically in database transactions to guarantee strictly sequential, gap-free numbers.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `PATTERN_NEEDS_SEQ` | The pattern lacks `{SEQ:n}`. | Add a sequence token such as `{SEQ:6}` to the pattern string. |
| Duplicate Policy Numbers | Modifying format in production without changing prefix. | When changing formats, ensure the static prefix or date token changes so counter restarts do not collide with older documents. |

---

## 11. Sample Configuration: Claims Numbering
- **Document**: `claim`
- **Product**: `FIRE`
- **Pattern**: `CLM-FIRE-{YYYY}-{MM}-{SEQ:5}`
- **Generated**: `CLM-FIRE-2026-10-00001`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="numberFormats"`.
- **API Endpoints**:
  - `GET /api/platform/entities/numberFormats`
  - `POST /api/platform/entities/numberFormats`
  - `PUT /api/platform/entities/numberFormats/:id`
  - `DELETE /api/platform/entities/numberFormats/:id`
- **Database Tables**: `number_formats`, `number_sequences`.
- **Generator Library**: `api/src/lib/numbering.js`.
