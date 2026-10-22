# 54. Discounts and Loadings

---

## 1. Overview
The **Discounts and Loadings** module (`/admin/premiumAdjustments`) manages post-rating commercial premium adjustments. It enables automatic percentage discounts (e.g. online self-service incentive, no-claims bonus) and actuarial risk loadings (e.g. high-risk shipping routes, hazardous workforces) based on risk facts, sales channels (`b2c` vs `b2b`), priority execution ordering, and date windows.

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Discounts and loadings" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: product_code` (e.g. `FIRE`, `MARINE`, `WC`).
- **Search Bar**: Substring search across code, English name, and Arabic name.
- **Table Columns**:
  1. `Product`: Target product (or `—` for global tenant adjustments).
  2. `Code`: Unique adjustment code (e.g. `ONLINE`, `NO_CLAIMS`).
  3. `Kind`: Type badge (`discount` in green, `loading` in orange).
  4. `Percent`: Percentage value (`0.05 = 5%`).
  5. `Priority`: Numeric execution sequence (`priority`).
  6. `Combines`: Stackable flag (`stackable`).
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Product** (`product_code`): Select dropdown (blank = applies across all products).
- **Code**: Identifier string.
- **Name (English)**: Commercial title in English.
- **Name (Arabic)**: Commercial title in Arabic.
- **Kind**: Select dropdown (`discount` or `loading`).
- **Percent**: Required decimal fraction (`0.05` for 5%).
- **Applies when** (`condition`): JSON rule condition. Hint: `{"fact":"claims3y","op":"eq","value":0} · {"all":[…]} · {"any":[…]}; blank = always`.
- **Channels**: JSON array specifying channel scoping (e.g. `["b2c"]`, `["b2b"]`, or blank for all).
- **Order of application** (`priority`): Integer priority (lower executes first).
- **Combines with others** (`stackable`): Checkbox toggle.
- **From / To**: Effective date window (`effective_from`, `effective_to`).
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record ID | `4` |
| `product_code` | Select (FK) | No | Valid product or blank | Scopes adjustment to one product | `FIRE` |
| `code` | String | Yes | Alphanumeric / uppercase | System adjustment key | `ONLINE` |
| `name_en` | String | Yes | 2–160 characters | Commercial name in English | `Online Direct Purchase Discount` |
| `name_ar` | String | Yes | 2–160 characters | Commercial name in Arabic | `خصم الشراء المباشر عبر الإنترنت` |
| `kind` | Select | Yes | `discount`, `loading` | Whether it decreases or increases premium | `discount` |
| `percent` | Number | Yes | `0 < percent <= 1.0` | Percentage fraction (`0.10 = 10%`) | `0.05` |
| `condition` | JSON | No | Valid rule condition object | Eligibility logic checked against facts | `{"fact":"claims3y","op":"eq","value":0}` |
| `channels` | JSON | No | `["b2c"]`, `["b2b"]`, or blank | Distribution channel scope | `["b2c"]` |
| `priority` | Integer | No | Integer | Execution sequence (lower evaluates first) | `10` |
| `stackable` | Boolean | Yes | `true`, `false` | If false, prevents further adjustments | `true` |
| `effective_from`| Date | No | YYYY-MM-DD | Campaign launch date | `2026-01-01` |
| `effective_to` | Date | No | YYYY-MM-DD | Campaign expiry date | `2026-12-31` |
| `active` | Boolean | Yes | `true`, `false` | Active status toggle | `true` |

---

## 5. Condition Syntax & Evaluation Logic

The `condition` field accepts structured rule objects evaluated against quotation risk facts:

| Condition Pattern | JSON Structure | Evaluation Meaning |
|---|---|---|
| Single Fact Equality | `{"fact": "claims3y", "op": "eq", "value": 0}` | Matches if 3-year claims equals 0 |
| Numeric Comparison | `{"fact": "employees", "op": "gte", "value": 100}` | Matches if workforce has 100+ employees |
| Boolean Flag | `{"fact": "highRiskRoute", "op": "eq", "value": true}` | Matches if voyage route is high-risk |
| Conjunction (ALL) | `{"all": [{"fact": "claims3y", "op": "eq", "value": 0}, {"fact": "alarm", "op": "eq", "value": true}]}` | Matches if all sub-conditions are true |
| Disjunction (ANY) | `{"any": [{"fact": "sprinklers", "op": "eq", "value": true}, {"fact": "civilDefence", "op": "eq", "value": true}]}` | Matches if any sub-condition is true |
| Always Applies | `null` or `{}` | Applies unconditionally to all matching quotes |

---

## 6. Execution Sequence & Business Rules
1. **Application Timing**: Adjustments apply automatically immediately after rating calculation and before charges and taxes.
2. **Priority Ordering**: Adjustments are sorted by `priority ASC`.
3. **Compounding vs Stacking**: If `stackable = false`, the adjustment applies and halts any subsequent discounts or loadings from executing on that quote.
4. **Minimum Premium Floor**: In accordance with underwriting safeguards, automatic discounts never reduce the final payable premium below the product's configured `minPremium` (e.g. AED 500).

---

## 7. Step-by-Step: Creating a 10% No-Claims Discount
1. Navigate to **Admin** -> **Discounts and loadings** (`/admin/premiumAdjustments`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Product**: Select `FIRE`.
   - **Code**: `FIRE_NCD_3Y`.
   - **Name (English)**: `3-Year No Claims Discount`.
   - **Name (Arabic)**: `خصم عدم وجود مطالبات لـ 3 سنوات`.
   - **Kind**: Select `discount`.
   - **Percent**: `0.10` (10%).
   - **Applies when**: `{"fact": "claims3y", "op": "eq", "value": 0}`.
   - **Channels**: `["b2c", "b2b"]`.
   - **Order of application**: `20`.
   - **Combines with others**: Checked (`true`).
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Premium Adjustment Form for FIRE_NCD_3Y]*
5. Click **Save** (`admin.save`).
6. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it takes effect immediately for qualifying risks.

---

## 8. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify percentages, conditions, or priority.
- **Deactivate**: Uncheck **Active** to suspend a promotional discount campaign without deleting its record.
- **Delete**: Click **Delete** and confirm.

---

## 9. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, mutations route to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before the discount applies live.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `PERCENT_OUT_OF_RANGE` | Percent value is `<= 0` or `> 1.0`. | Enter a valid decimal fraction between `0.01` (1%) and `1.0` (100%). |
| `CONDITION_INVALID` | Invalid JSON or unknown operator in `condition`. | Verify JSON syntax and ensure operators are valid (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`). |
| Discount not applying to quote | Condition did not match risk facts or channel was restricted. | Check quotation facts payload and confirm that risk attributes satisfy the condition. |

---

## 11. Sample Configuration: Marine High-Risk Route Loading
- **Product**: `MARINE`
- **Code**: `HIGH_RISK_ROUTE`
- **Kind**: `loading`
- **Percent**: `0.25` (+25%)
- **Condition**: `{"fact": "highRiskRoute", "op": "eq", "value": true}`
- **Priority**: `10`
- **Stackable**: `true`
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="premiumAdjustments"`.
- **API Endpoints**:
  - `GET /api/platform/entities/premiumAdjustments?filter={product_code}`
  - `POST /api/platform/entities/premiumAdjustments`
  - `PUT /api/platform/entities/premiumAdjustments/:id`
  - `DELETE /api/platform/entities/premiumAdjustments/:id`
- **Database Table**: `premium_adjustments`
- **Order Index**: `['product_code', 'priority']`
