# 10. Products (Catalogue)

---

## 1. Overview
The **Products Catalogue** (`/admin/catalogue`) provides a centralized, read-only operational dashboard summarizing every insurance product's entire configuration ecosystem. It aggregates active lines of business, territorial and distribution channel availability, child entity counts (covers, deductibles, discounts, charges, taxes), rate tables, and active referral rules into a single pane of glass with direct deep-links to child management screens.

---

## 2. Who Can Access
Access to this screen is restricted to users with the following privilege:
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
  - Any custom role granted the `admin.products` privilege.
- *Note*: Users without `admin.access` are blocked at the shell level.

---

## 3. Screen Walkthrough

### Header & Controls
- **Header**: Displays "Products" (`catalogue.title`) with subtitle "Lines of business, products and their configuration." (`catalogue.lead`).
- **Product Cards**: Each product in the system is rendered as a standalone card section containing three distinct tiers of data:
  1. **Top Row**: Product Name (localized in user's active locale), Product Code badge (e.g., `FIRE`), Line of Business code and localized description, and a `StatusBadge` (`active`, `draft`, or `retired`).
  2. **Territory & Channels**: Pill badges indicating enabled countries and channels (e.g., `AE B2C B2B`).
  3. **3-Column Child Metrics Grid**:
     - **Column 1 (Covers)**: Hyperlink to Covers (`/admin/productCovers?filter={code}`) with total count, followed by a breakdown of active vs total counts for `basic`, `clause`, and `optional` covers.
     - **Column 2 (Deductibles & Adjustments)**: Hyperlink to Deductibles (`/admin/productDeductibles?filter={code}`) with count, hyperlink to Discounts and loadings (`/admin/premiumAdjustments?filter={code}`) with count, and a comma-separated list of active adjustment codes.
     - **Column 3 (Charges & Taxes)**: Hyperlink to Charges and fees (`/admin/charges?filter={code}`) with count, list of active charge names with fixed amounts or percentages, and a hyperlink to Taxes (`/admin/taxes`) with country count.
  4. **Bottom Bar**: Deep-links to Rate tables (`/backoffice/rates`), total count of active referral rules (`catalogue.rules: N`), and a "Manage" link to the Products master screen (`/admin/products`).

---

## 4. Field Reference Table
*Note: The Catalogue screen is an aggregation view. The fields displayed across product cards reflect the underlying product and child entity records.*

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `product.name` | Localized Text | Yes | Bilingual string (`en`, `ar`) | Commercial name of the insurance product | `Property – Fire & Allied Perils` |
| `product.code` | String (Identifier) | Yes | Uppercase alphanumeric (2–10 chars) | Unique product code | `FIRE` |
| `product.status` | Enum / Badge | Yes | `draft`, `active`, `retired` | Commercial availability of the product | `active` |
| `product.lob` | Localized Text | Yes | Valid Line of Business | Parent Line of Business name and code | `Property – Fire & Allied Perils (fire)` |
| `countries` | Array | Yes | Country code + B2C/B2B flags | Enabled jurisdictions and distribution channels | `AE B2C B2B` |
| `covers` | Aggregate | Yes | Count of basic, clause, optional | Breakdown of total and active coverage options | `Covers (14) · basic: 10/10 · optional: 4/4` |
| `deductibles` | Aggregate | Yes | Non-negative integer | Total configured deductible options | `Deductibles (2)` |
| `adjustments` | Aggregate | Yes | List of codes | Active post-rating discounts and loadings | `ONLINE, NO_CLAIMS` |
| `charges` | Aggregate | Yes | List of amounts/rates | Active policy issuance fees and percentage fees | `POLICY_FEE: AED 50` |
| `taxes` | Aggregate | Yes | Non-negative integer | Applicable tax and VAT definitions | `Taxes (1)` |
| `rateTables` | Aggregate | Yes | Non-negative integer | Rate tables linked to the product | `Rate tables (4)` |
| `referralRules`| Aggregate | Yes | Non-negative integer | Active underwriting referral rules | `Referral rules: 8` |

---

## 5. Step-by-Step: How to View & Navigate
1. Sign in to the portal as a user with `admin.products` (e.g., `config1@portal.test`).
2. Click **Admin** in the global navigation bar, then select **Products** (`/admin/catalogue`) from the left-hand navigation.
3. *[Screenshot Placeholder: Product Catalogue Overview with FIRE, MARINE, WC, and ENG cards]*
4. Inspect the target product card to verify that all required child components are configured:
   - Click **Covers (N)** to filter and edit coverage definitions.
   - Click **Deductibles (N)** to manage deductible thresholds.
   - Click **Discounts and loadings (N)** to review promotional discounts.
   - Click **Charges and fees (N)** to adjust issuance levies.
   - Click **Manage** to edit the parent product dates, descriptions, or status.

---

## 6. How to Edit / Deactivate / Delete
- The Catalogue overview screen is **read-only**. It does not possess direct inline edit or delete actions.
- To modify an underlying product, click the **Manage** link at the bottom of the card to navigate to `/admin/products`.
- To modify child entities, click the corresponding link in the 3-column grid (which automatically applies a query parameter filter such as `?filter=FIRE`).

---

## 7. Approval Flow
- The Catalogue overview is a diagnostic dashboard and does not submit changes to the approval queue.
- However, if `products.requireApproval` is enabled in System Parameters, following any link from this screen to modify child entities (Covers, Deductibles, Charges, etc.) will subject those edits to the **Pending Changes** maker-checker approval queue.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - At least one Line of Business in `lobs`.
  - At least one Product in `products`.
  - Linked records in `product_countries`, `product_covers`, `product_deductibles`, `charges`, and `taxes`.
- **Downstream Consumers (What uses this AFTER)**:
  - Administrators and business users use this screen to verify product completeness before setting product status to `active` for customer quotation.

---

## 9. Business Rules & Validations
- A product card only renders if the product exists in the `products` table and the authenticated user has `admin.products`.
- Active covers count displays as `{active}/{total}`. If any essential basic peril is inactive, the product cannot produce complete policy quotes.
- The countries badge only displays `ok` (highlighted) if either `enabled_b2c` or `enabled_b2b` is true.

---

## 10. Common Errors & Troubleshooting
| Issue / Symptom | Root Cause | Resolution |
|---|---|---|
| Screen displays blank or error notice | User lacks `admin.products` or backend API error | Verify that the user role has `admin.products` in `/admin/roles`. Check backend logs for `/api/platform/products/:code/overview`. |
| Child count displays 0 unexpectedly | Child entities were created under an incorrect product code | Open the specific child screen (e.g. `/admin/productCovers`) and ensure `product_code` matches exactly (case-sensitive). |
| Manage link returns 404 | Product record missing primary key | Ensure product exists in `products` table. |

---

## 11. Sample Configuration (e.g., Motor Comprehensive)
In a Motor Insurance deployment, the Catalogue card for `MOTOR_COMP` would display:
- **Title**: Motor Comprehensive (`MOTOR_COMP`) · `Motor (motor)`
- **Status**: `active`
- **Countries**: `AE B2C B2B`
- **Covers (8)**: `basic: 1/1 · optional: 7/7` (Agency repair, Windscreen cover, GCC extension, Car hire)
- **Deductibles (3)**: Fixed AED 350, AED 500, AED 1,000
- **Discounts (2)**: `NO_CLAIMS_1Y`, `ONLINE_DIRECT`
- **Charges (1)**: `EV_INSPECTION_FEE: AED 150`
- **Taxes (1)**: `VAT_AE (5%)`
- **Rules**: `Referral rules: 5` (Sports car, young driver, high value)

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/catalogue/page.js`
- **API Endpoints**:
  - `GET /api/platform/entities/products`: Fetches all product codes.
  - `GET /api/platform/products/:code/overview`: Retrieves the aggregated overview payload including LOB, countries, covers, deductibles, adjustments, charges, taxes, rate tables, and referral rules count.
- **Underlying Database Tables**: `products`, `lobs`, `product_countries`, `product_covers`, `product_deductibles`, `premium_adjustments`, `charges`, `taxes`, `rate_tables`, `referral_rules`.
- **Permission Check**: `router.get('/products/:code/overview', requirePermission('admin.products'), ...)`
