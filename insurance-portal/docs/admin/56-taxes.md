# 56. Taxes

---

## 1. Overview
The **Taxes** module (`/admin/taxes`) manages statutory tax rules, Value Added Tax (VAT), and insurance premium taxes (IPT) applied to insurance quotes and invoices. It governs territorial rates (e.g. 5% UAE VAT), product-specific tax overrides, conditional tax exemptions (such as zero-rated international marine cargo exports), taxability of administrative fees, and resolution priorities.

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Taxes" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: country_code` (e.g. `AE`).
- **Search Bar**: Substring search across code, English name, and Arabic name.
- **Table Columns**:
  1. `Code`: Statutory tax code (e.g. `VAT`, `VAT_EXPORT_ZERO`).
  2. `Name (English)`: English tax title.
  3. `Country`: 2-character ISO country code (e.g. `AE`).
  4. `Product`: Specific product code or `—` for national tax rate.
  5. `Rate`: Tax rate fraction (`0.05 = 5%`).
  6. `Also on fees`: Checkmark indicating if fees are taxed (`applies_to_fees`).
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Code**: Identifier string (e.g. `VAT`).
- **Name (English)**: Required English title.
- **Name (Arabic)**: Required Arabic title.
- **Country** (`country_code`): Required 2-character country code (e.g. `AE`).
- **Product** (`product_code`): Select dropdown from `products` (blank = all products in country).
- **Rate**: Required decimal fraction (`0.05` for 5%).
- **Also on fees** (`applies_to_fees`): Checkbox toggle. If true, VAT applies to taxable policy fees as well as premium.
- **Applies when** (`condition`): JSON rule condition for selective tax exemptions or overrides. Hint: `{"fact":"direction","op":"eq","value":"export"}`.
- **Priority (lower first)**: Integer priority sequence.
- **From / To**: Effective date window.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record ID | `1` |
| `code` | String | Yes | Alphanumeric / uppercase | Statutory tax code | `VAT` |
| `name_en` | String | Yes | 2–160 characters | English statutory tax name | `Value Added Tax (5%)` |
| `name_ar` | String | Yes | 2–160 characters | Arabic statutory tax name | `ضريبة القيمة المضافة (5%)` |
| `country_code` | String | Yes | 2-character ISO country code | Jurisdictional country scope | `AE` |
| `product_code` | Select (FK) | No | Valid product or blank | Product-specific tax override | `MARINE` |
| `rate` | Number | Yes | `0 <= rate <= 0.5` | Tax rate fraction (`0.05 = 5%`) | `0.05` |
| `applies_to_fees`| Boolean | Yes | `true`, `false` | If true, taxes taxable policy fees | `true` |
| `condition` | JSON | No | Valid rule condition or null | Conditional exemption or rule | `{"fact":"direction","op":"eq","value":"export"}` |
| `priority` | Integer | No | Integer (lower first) | Resolution precedence | `10` |
| `effective_from`| Date | No | YYYY-MM-DD | Statutory enactment date | `2018-01-01` |
| `effective_to` | Date | No | YYYY-MM-DD | Expiration date | `null` |
| `active` | Boolean | Yes | `true`, `false` | Enables tax evaluation | `true` |

---

## 5. Tax Calculation Methodology & Precedence

### Calculation Formula
```
TaxableAmount = NetPremium + (applies_to_fees ? SumOfTaxableFees : 0)
TaxPayable = TaxableAmount * rate
```

### Precedence Resolution Hierarchy
When calculating tax for a policy:
1. **Product-Specific Rule with Matching Condition**: (e.g. `country_code = 'AE'` + `product_code = 'MARINE'` + `direction = 'export'`) -> Rates at 0%.
2. **Product-Specific General Rule**: (e.g. `country_code = 'AE'` + `product_code = 'MARINE'`).
3. **National General Rule by Priority**: (e.g. `country_code = 'AE'` + `product_code = null` with `priority = 100`) -> Standard 5% VAT.

---

## 6. Step-by-Step: Configuring a Zero-Rated Export Tax Rule
1. Navigate to **Admin** -> **Taxes** (`/admin/taxes`).
2. Type `AE` into the **Filter** box.
3. Click **Add** (`admin.add`).
4. In the modal:
   - **Code**: `VAT_EXPORT_ZERO`.
   - **Name (English)**: `Zero-Rated Export VAT (0%)`.
   - **Name (Arabic)**: `ضريبة الصادرات بنسبة الصفر (0%)`.
   - **Country**: `AE`.
   - **Product**: Select `MARINE`.
   - **Rate**: `0.00` (0%).
   - **Also on fees**: Checked.
   - **Applies when**: `{"fact": "direction", "op": "eq", "value": "export"}`.
   - **Priority**: `10` (Evaluated before general 5% VAT).
   - **Active**: Checked.
5. *[Screenshot Placeholder: Add Tax Modal showing 0% Export VAT for Marine]*
6. Click **Save** (`admin.save`).
7. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it is immediately active.

---

## 7. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify tax rates, fee taxability, or conditions.
- **Deactivate**: Uncheck **Active** to suspend a tax code.
- **Delete**: Click **Delete** and confirm prompt.

---

## 8. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, saving updates routes to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before the tax rate applies live.

---

## 9. Business Rules & Validations
1. **Tax Rate Range**: Rates must be between `0.0` (zero-rated or exempt) and `0.5` (maximum 50%). Submitting a rate above 0.5 or below 0 throws HTTP 400 `RATE_OUT_OF_RANGE`:
   *"Tax rate must be between 0 and 0.5"*.
2. **Tax Invoice Compliance**: The generated Tax Invoice displays the statutory tax code, rate percentage, net taxable amount, and tax payable breakdown in English and Arabic.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `RATE_OUT_OF_RANGE` | Tax rate entered as percentage whole number (e.g. `5` instead of `0.05`). | Enter rate as a decimal fraction (e.g. `0.05` for 5%, `0.15` for 15%). |
| Policy fees not taxed | `applies_to_fees` is unchecked on the tax record. | Edit the tax definition and ensure `Also on fees` is checked. |
| Zero rating not applying | Condition syntax does not match quotation facts. | Verify condition JSON (e.g. `{"fact":"direction","op":"eq","value":"export"}`). |

---

## 11. Sample Configuration: Standard UAE VAT
- **Code**: `VAT`
- **Name (English)**: `Value Added Tax`
- **Name (Arabic)**: `ضريبة القيمة المضافة`
- **Country**: `AE`
- **Product**: `—` (Global tenant default)
- **Rate**: `0.05` (5%)
- **Also on fees**: `true`
- **Priority**: `100`
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="taxes"`.
- **API Endpoints**:
  - `GET /api/platform/entities/taxes?filter={country_code}`
  - `POST /api/platform/entities/taxes`
  - `PUT /api/platform/entities/taxes/:id`
  - `DELETE /api/platform/entities/taxes/:id`
- **Database Table**: `taxes`
- **Order Index**: `['country_code', 'priority']`
