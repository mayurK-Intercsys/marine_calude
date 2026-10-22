# 53. Deductibles

---

## 1. Overview
The **Deductibles** module (`/admin/productDeductibles`) configures the customer- and product-level excess structures for insurance losses. It supports fixed sums, percentages of loss, percentages of sum insured, "greater-of" structures (percentage with minimum floor), and time deductibles (days). For products with elective deductibles (such as Fire), each option can define a premium rating factor (e.g. 8% premium reduction for selecting a higher excess).

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Deductibles" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: product_code` (e.g. `FIRE`, `MARINE`, `ENG`).
- **Search Bar**: Substring search across code, English name, and details.
- **Table Columns**:
  1. `Product`: Associated product code.
  2. `Code`: Unique deductible code (e.g. `standard`, `high`, `CAR.natcat`).
  3. `Name (English)`: English title.
  4. `Type`: Structure type (`fixed`, `percent_of_claim`, `percent_of_si`, `greater_of`, `days`).
  5. `Amount`: Fixed monetary amount (AED).
  6. `Percent`: Percentage value (`0.01 = 1%`).
  7. `Default`: Default pre-selected option checkmark (`is_default`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Product** (`product_code`): Select dropdown from `products`.
- **Code**: Identifier string.
- **Name (English)**: Required English label.
- **Name (Arabic)**: Required Arabic label.
- **Detail (English)**: Explanatory note (e.g. `10% of claim, min AED 2,500`).
- **Detail (Arabic)**: Explanatory note in Arabic.
- **Type** (`deductible_type`): Select dropdown (`fixed`, `percent_of_claim`, `percent_of_si`, `greater_of`, `days`).
- **Amount**: Fixed amount or minimum threshold.
- **Percent**: Fraction (e.g. `0.01` for 1%).
- **Premium factor** (`rating_factor`): Multiplier applied to premium (e.g. `0.92` for an 8% discount; `1.0` for base rate).
- **Default** (`is_default`): Checkbox indicating standard pre-selected tier.
- **Order**: Integer sort index.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record ID | `2` |
| `product_code` | Select (FK) | Yes | Valid code in `products` | Associated product | `FIRE` |
| `code` | String | Yes | Alphanumeric (2–40 chars) | System identifier | `high` |
| `name_en` | String | Yes | 2–160 characters | Commercial option title (EN) | `High Deductible (Lower Premium)` |
| `name_ar` | String | Yes | 2–160 characters | Commercial option title (AR) | `تحمل مرتفع (قسط أقل)` |
| `detail_en` | String | No | Text | Customer-facing explanation (EN) | `AED 10,000 each claim` |
| `detail_ar` | String | No | Text | Customer-facing explanation (AR) | `10,000 درهم لكل مطالبة` |
| `deductible_type`| Select | Yes | `fixed`, `percent_of_claim`, `percent_of_si`, `greater_of`, `days` | Excess calculation logic | `fixed` |
| `amount` | Number | No | Non-negative numeric | Fixed excess or minimum floor | `10000` |
| `percent` | Number | No | Decimal fraction (`0.05 = 5%`) | Percentage factor | `0.01` |
| `rating_factor` | Number | No | `0 < rating_factor <= 2` | Premium multiplier | `0.92` |
| `is_default` | Boolean | Yes | `true`, `false` | Default selected choice | `false` |
| `sort` | Integer | No | Integer | Presentation order | `2` |
| `active` | Boolean | Yes | `true`, `false` | Active availability | `true` |

---

## 5. Deductible Types & Calculation Logic

| Type Code | Formula / Execution Rule | Example Loss Case | Deductible Paid by Insured |
|---|---|---|---|
| `fixed` | Deductible = `amount` | Loss of AED 40,000 with AED 2,500 fixed | **AED 2,500** |
| `percent_of_claim` | Deductible = `percent * claimLoss` | Loss of AED 50,000 at 10% | **AED 5,000** |
| `percent_of_si` | Deductible = `percent * sumInsured` | Location SI AED 1,000,000 at 1% | **AED 10,000** |
| `greater_of` | Deductible = `max(amount, percent * claimLoss)` | Loss AED 20,000 at 10% min AED 3,000 | **AED 3,000** (3,000 > 2,000) |
| `days` | Time excess: loss during first `N` days excluded | 14 days waiting period in CAR testing | Losses in days 1–14 excluded |

---

## 6. Step-by-Step: Creating a New Deductible Tier
1. Navigate to **Admin** -> **Deductibles** (`/admin/productDeductibles`).
2. Type `FIRE` into the **Filter** box.
3. Click **Add** (`admin.add`).
4. In the modal:
   - **Product**: Select `FIRE`.
   - **Code**: `super_high`.
   - **Name (English)**: `Super High Deductible`.
   - **Name (Arabic)**: `تحمل فائق الارتفاع`.
   - **Detail (English)**: `AED 25,000 each and every loss`.
   - **Detail (Arabic)**: `25,000 درهم لكل خسارة`.
   - **Type**: Select `fixed`.
   - **Amount**: `25000`.
   - **Premium factor**: `0.85` (15% discount on technical premium).
   - **Default**: Leave unchecked.
   - **Order**: `3`.
   - **Active**: Checked.
5. *[Screenshot Placeholder: Add Deductible Form with 0.85 rating factor]*
6. Click **Save** (`admin.save`).
7. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it is immediately active on quotation journeys.

---

## 7. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to adjust amounts, percentages, or rating factors.
- **Deactivate**: Uncheck **Active** to hide the deductible option from future quotations.
- **Delete**: Click **Delete**. Ensure no pending quotes are actively referencing this deductible code.

---

## 8. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, saving updates routes to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before the new deductible factor affects quotation pricing.

---

## 9. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Product in `products`.
- **Downstream Consumers (What uses this AFTER)**:
  - Quotation step renders selectable deductible cards.
  - Rating engine applies `rating_factor` to the technical premium.
  - Policy Schedule prints the exact deductible terms.
  - Claims module checks the deductible threshold when settling claim losses.

---

## 10. Business Rules & Validations
1. **Factor Range Constraint**: If `rating_factor` is supplied, it must satisfy:
   `0 < rating_factor <= 2.0`
   Submitting a negative number or a multiplier exceeding 2 throws HTTP 400 `FACTOR_OUT_OF_RANGE`:
   *"Premium factor must be between 0 and 2"*.
2. **Single Default**: Only one deductible per product should have `is_default = true`.

---

## 11. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `FACTOR_OUT_OF_RANGE` | Premium factor is `<= 0` or `> 2`. | Ensure rating factor is a valid multiplier (e.g. `0.92` for 8% discount, `1.0` for base rate). |
| Customer cannot select deductible | Option has `active = false`. | Verify that `active` is checked. |

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="productDeductibles"`.
- **API Endpoints**:
  - `GET /api/platform/entities/productDeductibles?filter={product_code}`
  - `POST /api/platform/entities/productDeductibles`
  - `PUT /api/platform/entities/productDeductibles/:id`
  - `DELETE /api/platform/entities/productDeductibles/:id`
- **Database Table**: `product_deductibles`
- **Order Index**: `['product_code', 'sort']`
