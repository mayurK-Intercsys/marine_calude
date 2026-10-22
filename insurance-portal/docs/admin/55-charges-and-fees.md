# 55. Charges and Fees

---

## 1. Overview
The **Charges and Fees** module (`/admin/charges`) configures non-premium administrative levies added to insurance policies and invoices. It manages fixed policy issuance fees, inspection surcharges, percentage-based service charges with minimum/maximum caps, taxability flags (whether the charge is subject to VAT), refundability rules upon policy cancellation, and transaction-type scoping (`new_business`, `renewal`, `endorsement`).

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Charges and fees" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: product_code` (e.g. `FIRE`, `MARINE`, `WC`, `ENG`).
- **Search Bar**: Substring search across code, English name, and Arabic name.
- **Table Columns**:
  1. `Code`: Unique fee identifier (e.g. `POLICY_FEE`, `INSPECTION_FEE`).
  2. `Name (English)`: English commercial fee name.
  3. `Product`: Associated product code (blank = global).
  4. `Type`: Fee structure (`fixed` or `percent`).
  5. `Amount (fixed)`: Fixed fee amount (AED).
  6. `Taxable`: Taxability checkmark (`taxable`).
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Code**: Identifier string (e.g. `POLICY_FEE`).
- **Name (English)**: Required English label.
- **Name (Arabic)**: Required Arabic label.
- **Product** (`product_code`): Select dropdown from `products` (blank = all products).
- **Country** (`country_code`): 2-character ISO country code (blank = all countries).
- **Type** (`charge_type`): Select dropdown (`fixed` or `percent`).
- **Amount (fixed)**: Fixed fee currency amount (e.g. `50`).
- **Percent of premium**: Decimal fraction if percentage fee (e.g. `0.02` for 2%).
- **Minimum**: Minimum floor amount for percentage fees (`min_amount`).
- **Maximum**: Maximum ceiling cap for percentage fees (`max_amount`).
- **Taxable**: Checkbox toggle. If true, subject to VAT when tax has `applies_to_fees = true`.
- **Refundable on cancellation** (`refundable`): Checkbox toggle.
- **Transactions**: JSON array of applicable transactions (e.g. `["new_business", "renewal"]`).
- **Applies when** (`condition`): JSON rule condition for selective application.
- **Order**: Integer sort index.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record ID | `1` |
| `code` | String | Yes | Alphanumeric / uppercase | System fee identifier | `POLICY_FEE` |
| `name_en` | String | Yes | 2–160 characters | Commercial fee name in English | `Policy Issuance Fee` |
| `name_ar` | String | Yes | 2–160 characters | Commercial fee name in Arabic | `رسوم إصدار الوثيقة` |
| `product_code` | Select (FK) | No | Valid product code or blank | Scopes charge to a specific product | `FIRE` |
| `country_code` | String | No | 2-char ISO country code or blank | Scopes charge to a specific country | `AE` |
| `charge_type` | Select | Yes | `fixed`, `percent` | Calculation methodology | `fixed` |
| `amount` | Number | No | Non-negative numeric | Fixed currency amount | `50` |
| `percent` | Number | No | Decimal fraction (`0.02 = 2%`) | Percentage of premium | `null` |
| `min_amount` | Number | No | Non-negative numeric | Minimum fee floor for percentage fees | `null` |
| `max_amount` | Number | No | Non-negative numeric | Maximum fee cap for percentage fees | `null` |
| `taxable` | Boolean | Yes | `true`, `false` | Whether fee is subject to VAT | `true` |
| `refundable` | Boolean | Yes | `true`, `false` | If true, pro-rata refunded on cancel | `false` |
| `transactions` | JSON | No | `["new_business", "renewal", ...]` | Applicable lifecycle transactions | `["new_business", "renewal"]` |
| `condition` | JSON | No | Valid rule condition or null | Selective eligibility condition | `null` |
| `sort` | Integer | No | Integer | Display sequence | `10` |
| `active` | Boolean | Yes | `true`, `false` | Enables fee calculation | `true` |

---

## 5. Charge Types & Calculation Methodology

### 1. Fixed Charges (`fixed`)
- Formula: `Charge = amount`
- Example: Policy issuance fee of AED 50 added to quote.

### 2. Percentage Charges (`percent`)
- Formula: `RawFee = percent * technicalPremium`
- Clamped Formula: `Charge = clamp(RawFee, min_amount, max_amount)`
- Example: 2% brokerage administration levy with minimum AED 100 and maximum AED 500:
  - Premium AED 2,000 -> 2% is AED 40 -> Clamped to Minimum **AED 100**.
  - Premium AED 15,000 -> 2% is AED 300 -> Result **AED 300**.
  - Premium AED 50,000 -> 2% is AED 1,000 -> Clamped to Maximum **AED 500**.

---

## 6. Step-by-Step: Adding an Inspection Fee
1. Navigate to **Admin** -> **Charges and fees** (`/admin/charges`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Code**: `RISK_SURVEY_FEE`.
   - **Name (English)**: `Engineering Risk Survey Fee`.
   - **Name (Arabic)**: `رسوم معاينة المخاطر الهندسية`.
   - **Product**: Select `ENG`.
   - **Country**: Enter `AE`.
   - **Type**: Select `fixed`.
   - **Amount (fixed)**: `500`.
   - **Taxable**: Checked (`true`).
   - **Refundable on cancellation**: Unchecked (`false`).
   - **Transactions**: `["new_business"]`.
   - **Order**: `20`.
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Charge Form showing RISK_SURVEY_FEE]*
5. Click **Save** (`admin.save`).
6. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it is immediately active.

---

## 7. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to alter amounts, percentages, taxability, or transaction scope.
- **Deactivate**: Uncheck **Active** to stop levying the fee on new quotations.
- **Delete**: Click **Delete** and confirm prompt.

---

## 8. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, mutations route to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before the fee is applied to new quotes.

---

## 9. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Product in `products` (if scoping to a product).
- **Downstream Consumers (What uses this AFTER)**:
  - Price breakdown engine adds charges after discounts/loadings and technical premium.
  - Tax calculation engine checks `taxable = true` when calculating VAT on fees.
  - Tax Invoice prints itemized charge lines.
  - Policy cancellation engine checks `refundable = true` when calculating pro-rata return premiums.

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Fee not applying to quote | Product or country filter did not match the quotation risk. | Check `product_code` and `country_code`; leave blank to apply globally. |
| VAT not calculated on fee | Either fee has `taxable = false` or the tax record has `applies_to_fees = false`. | Verify that `taxable` is checked on the charge AND `applies_to_fees` is checked in `/admin/taxes`. |
| Fee refunded incorrectly on cancel | `refundable` is set to `true`. | Edit the charge and uncheck `refundable on cancellation`. |

---

## 11. Sample Configuration: Standard Policy Issuance Fee
- **Code**: `POLICY_FEE`
- **Name (English)**: `Policy Issuance Fee`
- **Name (Arabic)**: `رسوم إصدار الوثيقة`
- **Type**: `fixed`
- **Amount**: `50`
- **Taxable**: `true`
- **Refundable**: `false`
- **Transactions**: `["new_business", "renewal"]`
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="charges"`.
- **API Endpoints**:
  - `GET /api/platform/entities/charges?filter={product_code}`
  - `POST /api/platform/entities/charges`
  - `PUT /api/platform/entities/charges/:id`
  - `DELETE /api/platform/entities/charges/:id`
- **Database Table**: `charges`
- **Order Index**: `['product_code', 'sort']`
