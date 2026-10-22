# 52. Covers

---

## 1. Overview
The **Covers** module (`/admin/productCovers`) manages the peril, clause, and add-on coverage components attached to insurance products. It defines core basic perils, standard shipping clauses, and optional commercial extensions, establishing their bilingual naming, UI input attributes, automated pricing formulas, referral requirements, and display sequence on customer and broker journey screens.

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Covers" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: product_code` (e.g. `FIRE`, `MARINE`, `WC`, `ENG`).
- **Search Bar**: Substring search across cover code, English name, and Arabic name.
- **Table Columns**:
  1. `Product`: Associated product code (e.g. `FIRE`).
  2. `Code`: Unique cover code (e.g. `X01`, `ICC-A`, `SEC_A`).
  3. `Type`: Cover category (`basic`, `optional`, `clause`).
  4. `Name (English)`: English commercial name.
  5. `Needs underwriter`: Referral flag checkmark (`referral`).
  6. `Order`: Integer display sequence (`sort`).
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Product** (`product_code`): Select dropdown populated from `products`.
- **Code**: Identifier string (e.g. `X05`).
- **Type** (`cover_type`): Select dropdown (`basic`, `optional`, `clause`).
- **Name (English)**: Required English label.
- **Name (Arabic)**: Required Arabic label.
- **Description (English)**: Long-form explanation rendered in policy documents.
- **Description (Arabic)**: Long-form Arabic explanation.
- **Pricing**: JSON editor specifying pricing method. Hint: `{"method":"loading","pct":0.1} · {"method":"rate_on_total","permille":0.1} · {"method":"per_head","amount":6} · {"method":"referral_only"}`.
- **Screen attributes**: JSON editor specifying UI bindings (e.g. `{"input":"rentSI"}` or `{"plans":["complete"]}`).
- **Needs underwriter** (`referral`): Checkbox toggle. When selected, choosing this cover sends the quote to human underwriting review.
- **Order**: Integer sort index.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record identifier | `24` |
| `product_code` | Select (FK) | Yes | Valid code in `products` | Associated parent product | `FIRE` |
| `code` | String | Yes | Alphanumeric (2–30 chars) | System identifier for cover | `X01` |
| `cover_type` | Select | Yes | `basic`, `optional`, `clause` | Functional coverage classification | `optional` |
| `name_en` | String | Yes | 2–160 characters | English title | `Loss of Rent` |
| `name_ar` | String | Yes | 2–160 characters | Arabic title | `فقدان الإيجار` |
| `description_en`| Textarea | No | Plain text | Detailed policy schedule wording (EN) | `Indemnifies actual loss of rent...` |
| `description_ar`| Textarea | No | Plain text | Detailed policy schedule wording (AR) | `تعويض عن الإيجار المفقود الفعلي...` |
| `pricing` | JSON | No | Valid pricing JSON object | Calculation algorithm for add-on premium | `{"method": "loading", "pct": 0.1}` |
| `attributes` | JSON | No | Valid JSON object | UI screen and journey bindings | `{"input": "rentSI"}` |
| `referral` | Boolean | Yes | `true`, `false` | If true, forces human underwriter review | `false` |
| `sort` | Integer | No | Integer | Display sequence order | `21` |
| `active` | Boolean | Yes | `true`, `false` | Availability in quote flow | `true` |

---

## 5. Cover Classifications & Pricing Methods

### Cover Types
1. **`basic`**: Mandatory core perils automatically included in base pricing (e.g. Fire Perils P01–P10, WC Statutory Compensation Section A).
2. **`clause`**: Marine standard trade clauses (e.g. Institute Cargo Clauses ICC-A, ICC-B, ICC-C).
3. **`optional`**: Commercial add-ons selected optionally by the customer or broker.

### Supported Pricing Structures (`pricing`)

| Pricing Method | JSON Formula | Description | Calculation Example |
|---|---|---|---|
| `loading` | `{"method": "loading", "pct": 0.10}` | Adds a percentage of technical base premium | Base premium AED 2,000 * 10% = AED 200 |
| `rate_on_total`| `{"method": "rate_on_total", "permille": 0.15}`| Multiplies permille rate against total sum insured | Sum Insured AED 1,000,000 * 0.15 / 1000 = AED 150 |
| `per_head` | `{"method": "per_head", "amount": 6}` | Flat fee per declared employee head | 50 employees * AED 6 = AED 300 |
| `fixed` | `{"method": "fixed", "amount": 250}` | Flat monetary amount | Fixed AED 250 fee |
| `referral_only`| `{"method": "referral_only"}` | Cover cannot be priced online; triggers human referral | Sent to Underwriter queue |

---

## 6. Step-by-Step: Adding an Optional Cover Extension
1. Navigate to **Admin** -> **Covers** (`/admin/productCovers`).
2. Type `FIRE` into the **Filter** box.
3. Click **Add** (`admin.add`).
4. In the modal:
   - **Product**: Select `FIRE`.
   - **Code**: `X06`.
   - **Type**: Select `optional`.
   - **Name (English)**: `Landlord’s Fixtures and Fittings`.
   - **Name (Arabic)**: `تركيبات ومثبتات المالك`.
   - **Pricing**: `{"method": "loading", "pct": 0.05}`.
   - **Screen attributes**: `{}`.
   - **Needs underwriter**: Leave unchecked.
   - **Order**: `26`.
   - **Active**: Checked.
5. *[Screenshot Placeholder: Add Cover Modal with X06 and loading pricing]*
6. Click **Save** (`admin.save`).
7. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it is immediately active.

---

## 7. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify names, pricing parameters, or referral flags.
- **Deactivate**: Uncheck **Active** to hide the cover from quotation journeys. Inactive covers disappear from quote screens immediately and cannot be selected on new quotes.
- **Delete**: Click **Delete** and confirm. Only delete if no existing policies or quotes store this cover code.

---

## 8. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, mutations route to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before changes take effect.

---

## 9. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Product record in `products`.
- **Downstream Consumers (What uses this AFTER)**:
  - Front-end quote screens render covers dynamically from `product_covers`.
  - Quotation engine applies the `pricing` formula and evaluates `referral` flags.
  - Policy document generator renders cover names and descriptions in the Policy Schedule.

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Malformed JSON in Pricing | Syntax error in `pricing` field. | Ensure pricing is valid JSON matching one of the supported methods (e.g. `{"method":"loading","pct":0.1}`). |
| Quote referred unexpectedly | Cover has `referral: true` or `pricing: {"method":"referral_only"}`. | If human underwriter review is not desired, set `referral: false` and provide an automated pricing formula. |
| Cover missing from quote step | Cover is marked `active: false` or filtered by screen attributes. | Verify `active` is checked and check `attributes` filter (e.g. `plans`). |

---

## 11. Sample Configuration: Marine ICC-A Clause
- **Product**: `MARINE`
- **Code**: `ICC-A`
- **Type**: `clause`
- **Name (English)**: `Institute Cargo Clauses (A) – All Risks`
- **Name (Arabic)**: `شروط معهد مكتتبي التأمين للبضائع (أ) – جميع الأخطار`
- **Pricing**: `null` (Included in marine cargo technical base rate)
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="productCovers"`.
- **API Endpoints**:
  - `GET /api/platform/entities/productCovers?filter={product_code}`
  - `POST /api/platform/entities/productCovers`
  - `PUT /api/platform/entities/productCovers/:id`
  - `DELETE /api/platform/entities/productCovers/:id`
- **Database Table**: `product_covers`
- **Order Index**: `['product_code', 'sort']`
