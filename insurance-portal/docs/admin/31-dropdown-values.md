# 31. Drop-down Values

---

## 1. Overview
The **Drop-down Values** module (`/admin/lookupValues`) manages the individual localized choices for all dynamic selection menus across customer, broker, and back-office screens. It maintains bilingual English and Arabic labels, display ordering, active/inactive states, cascading parent-child dependencies (e.g. Emirate -> City), and optional JSON attributes consumed by the rating engine.

---

## 2. Who Can Access
- **Required Permission**: `admin.lookups`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Form
Rendered via the `EntityManager` component:
- **Header**: "Drop-down values" with **Add** button (`admin.add`).
- **Filter Bar**: Pre-configured with a list filter: `Filter: list_code` (e.g. filtering by `FIRE.construction` or `GLOBAL.documentTypes`).
- **Search Bar**: Substring search across `code`, `label_en`, `label_ar`.
- **Table Columns**:
  1. `List`: Parent drop-down list code (e.g. `FIRE.construction`).
  2. `Code`: Option value stored in database records (e.g. `concrete`).
  3. `Label (English)`: English label rendered on screens.
  4. `Parent (cascading)`: Code of parent item for dependent drop-downs.
  5. `Order`: Numeric sort sequence (`sort`).
  6. `Active`: Status checkmark (`✓` or `✗`).
  7. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **List** (`list_code`): Select dropdown pulling options dynamically from `lookup_lists`.
- **Code**: Identifier string passed in quote/policy payloads.
- **Label (English)**: Required English label.
- **Label (Arabic)**: Required Arabic label (rendered automatically in RTL mode).
- **Parent (cascading)**: Optional parent value code for cascading menus.
- **Order**: Integer sort index (lower values appear first in the UI).
- **Active**: Checkbox toggle.
- **Extra attributes**: JSON textarea for domain-specific parameters (e.g. `{"hazard": "low", "baseRate": 0.001}`).

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique record identifier | `101` |
| `list_code` | Select (FK) | Yes | Valid code in `lookup_lists` | Parent list container | `MOTOR.bodyTypes` |
| `code` | String | Yes | Alphanumeric / snake_case | Value stored in quotation risks | `sedan` |
| `label_en` | String | Yes | 1–255 characters | Display text in English | `Saloon / Sedan` |
| `label_ar` | String | Yes | 1–255 characters | Display text in Arabic | `صالون / سيدان` |
| `parent_code` | String | No | Valid value code in parent list | Cascading dependency link | `TOYOTA` |
| `sort` | Integer | No | Numeric integer | Sort order sequence in menu | `10` |
| `active` | Boolean | Yes | `true`, `false` | Whether option is active on screens | `true` |
| `attributes` | JSON | No | Valid JSON object or null | Additional metadata for rating/rules | `{"riskFactor": 1.0, "doors": 4}` |

---

## 5. Step-by-Step: How to Add a Drop-down Option
1. Navigate to **Admin** -> **Drop-down values** (`/admin/lookupValues`).
2. Type the target list code into the **Filter** box (e.g. `FIRE.construction`) to view existing options.
3. Click **Add** (`admin.add`).
4. In the modal:
   - **List**: Select `FIRE.construction`.
   - **Code**: `steel_frame`.
   - **Label (English)**: `Structural Steel Frame`.
   - **Label (Arabic)**: `هيكل فولاذي إنشائي`.
   - **Order**: `30`.
   - **Active**: Checked.
   - **Extra attributes**: `{"hazard": "medium", "fireResistant": true}`.
5. *[Screenshot Placeholder: Drop-down Values Add Form with localized labels and JSON attributes]*
6. Click **Save** (`admin.save`).
7. The option is immediately available on customer and broker journey steps without restarting the application.

---

## 6. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify labels, sort order, cascading parents, or JSON attributes.
- **Deactivate**: To retire an option without breaking historical policies that reference its code, open **Edit**, uncheck **Active**, and click **Save**. Inactive items disappear from new quote menus immediately.
- **Delete**: Click **Delete** and confirm prompt. Only delete if no existing policies or quotes store this value code.

---

## 7. Approval Flow
- Drop-down value changes apply immediately and do **not** enter the `Pending changes` approval queue.
- Updates are audited under `config.lookupValues.create`, `config.lookupValues.update`, and `config.lookupValues.delete`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Parent list record in `lookup_lists`.
- **Downstream Consumers (What uses this AFTER)**:
  - Journey screens (`fire.premise`, `marine.shipment`, `wc.workforce`, `engineering.items`).
  - Document Requirements (`GLOBAL.documentTypes` values define selectable checklist types).
  - Field Properties (`lookup_list` configuration).

---

## 9. Business Rules & Validations
1. **Mandatory Bilingualism**: Both `label_en` and `label_ar` are strictly required (`FIELD_REQUIRED`).
2. **Dynamic UI Rendering**: Front-end forms retrieve options via `/api/ref/lookups/:list` and cache them for session efficiency. Updating a value is immediately served on subsequent requests.
3. **Cascading Menus**: When a child drop-down has a `parent_code` specified, the front-end filters the option list to items whose `parent_code` matches the current selection in the parent control.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `FIELD_REQUIRED` | Missing list selection, code, or localized label. | Ensure List, Code, Label (English), and Label (Arabic) are filled. |
| Malformed JSON in Attributes | Syntax error in Extra attributes field. | Ensure attributes field is valid JSON (e.g. `{"key": "value"}`) or leave blank. |
| Option not appearing on screen | Option is marked inactive or belongs to a different list. | Check that `active` is checked and verify `list_code`. |

---

## 11. Sample Configuration: Vehicle Usage Options
- **List**: `MOTOR.vehicleUsage`
  1. `private`: `Private / Personal` (`شخصي / خاص`), Order `10`, Active `true`.
  2. `commercial`: `Commercial Cargo` (`تجاري نقل بضائع`), Order `20`, Active `true`.
  3. `taxi`: `Taxi / Public Transport` (`أجرة / نقل عام`), Order `30`, Active `true`, Attributes: `{"surcharge": 0.25}`.

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="lookupValues"`.
- **API Endpoints**:
  - `GET /api/platform/entities/lookupValues?filter={list_code}`
  - `POST /api/platform/entities/lookupValues`
  - `PUT /api/platform/entities/lookupValues/:id`
  - `DELETE /api/platform/entities/lookupValues/:id`
  - Client Journey Endpoint: `GET /api/ref/lookups/:list`
- **Database Table**: `lookup_values`
- **Index**: `['list_code', 'sort']`
