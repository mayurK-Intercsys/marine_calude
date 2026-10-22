# 50. Lines of Business

---

## 1. Overview
The **Lines of Business** module (`/admin/lobs`) defines the statutory insurance classes governing the platform's product taxonomy. Lines of Business (such as Fire, Marine, Liability/Workmen's Compensation, Engineering, and Motor) serve as the legal and organizational parents for individual products, determining statutory reporting groupings and license module entitlements.

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Form
Rendered via the `EntityManager` component:
- **Header**: "Lines of business" with **Add** button (`admin.add`).
- **Search Bar**: Substring search across code, English name, and Arabic name.
- **Table Columns**:
  1. `Code`: Unique alphanumeric code (e.g. `fire`, `marine`, `wc`, `engineering`).
  2. `Name (English)`: Official English title.
  3. `Order`: Integer sort index (`sort`).
  4. `Active`: Status checkmark (`✓` or `✗`).
  5. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Code**: String input (mandatory, immutable after creation; e.g. `motor`).
- **Name (English)**: Required English name.
- **Name (Arabic)**: Required Arabic name.
- **Description**: Textarea describing the statutory class of business.
- **Order**: Sort index for front-end navigation menus.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `code` | String (PK) | Yes | Unique alphanumeric; `createOnly` | Primary line of business identifier | `motor` |
| `name_en` | String | Yes | 2–160 characters | English statutory line name | `Motor Insurance` |
| `name_ar` | String | Yes | 2–160 characters | Arabic statutory line name | `تأمين المركبات` |
| `description` | Text | No | Plain text | Summary of underwriting domain | `Private and commercial motor vehicle risks` |
| `sort` | Integer | No | Numeric integer | Display order sequence | `5` |
| `active` | Boolean | Yes | `true`, `false` | Whether line of business is active | `true` |

---

## 5. Step-by-Step: How to Add a Line of Business
1. Navigate to **Admin** -> **Lines of business** (`/admin/lobs`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Code**: `motor`
   - **Name (English)**: `Motor Insurance`
   - **Name (Arabic)**: `تأمين المركبات`
   - **Description**: `Comprehensive and third-party liability coverage for private and commercial vehicles.`
   - **Order**: `5`
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Line of Business Form for Motor]*
5. Click **Save** (`admin.save`).
6. If `products.requireApproval` is enabled, the change is submitted to **Pending changes**; otherwise it is committed immediately.

---

## 6. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify names, description, or sort order.
- **Deactivate**: Uncheck **Active** to hide the LOB from portal home screen product cards.
- **Delete**: Click **Delete**. If active products exist under this line, the deletion is prevented by database foreign key constraints. Delete or reassign child products first.

---

## 7. Approval Flow
- **Approval Flag**: `approval: true`.
- If `products.requireApproval = true` in `/admin/parameters`, creating, editing, or deleting an LOB stages a record in `config_changes` with status `pending`.
- A second user with `engines.approve` must approve the change in `/admin/changes`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Appropriate tenant platform licence module (e.g. `MOTOR`).
- **Downstream Consumers (What uses this AFTER)**:
  - Products (`/admin/products`) references `lobs.code` in its mandatory `line` foreign key.
  - Number formats uses the line code for `{LINE}` token replacement.

---

## 9. Business Rules & Validations
1. **Immutable Code**: The `code` field cannot be modified once saved (`createOnly: true`).
2. **Bilingual Requirement**: Both English and Arabic names are mandatory (`FIELD_REQUIRED`).

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `FIELD_REQUIRED` | Missing code or localized names. | Ensure Code, Name (English), and Name (Arabic) are provided. |
| Foreign Key Violation on Delete | Products still belong to this line. | Reassign or retire all products linked to this LOB before deleting. |

---

## 11. Sample Configuration: Motor LOB
- **Code**: `motor`
- **Name (English)**: `Motor Vehicle Insurance`
- **Name (Arabic)**: `تأمين المركبات والسيارات`
- **Sort**: `5`
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="lobs"`.
- **API Endpoints**:
  - `GET /api/platform/entities/lobs`
  - `POST /api/platform/entities/lobs`
  - `PUT /api/platform/entities/lobs/:code`
  - `DELETE /api/platform/entities/lobs/:code`
- **Database Table**: `lobs`
