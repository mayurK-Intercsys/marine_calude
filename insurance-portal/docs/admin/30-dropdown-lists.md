# 30. Drop-down Lists

---

## 1. Overview
The **Drop-down Lists** module (`/admin/lookupLists`) defines the master category containers for all dynamic option menus used throughout the platform. It establishes the catalog of selectable list types—such as building construction classes, shipping packaging types, job hazard categories, and project classifications—which are subsequently populated with localized option items in Drop-down Values.

---

## 2. Who Can Access
- **Required Permission**: `admin.lookups`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Form
Rendered via the `EntityManager` component:
- **Header**: "Drop-down lists" with **Add** button (`admin.add`).
- **Search Bar**: Filters list code, name, and description.
- **Table Columns**:
  1. `Code`: Unique dot-notated or uppercase key (e.g. `FIRE.construction`, `GLOBAL.documentTypes`).
  2. `Name`: Descriptive English title of the list.
  3. `Product`: Associated product code (e.g. `FIRE`, `MARINE`, `WC`, `ENG`) or `—` for global lists.
  4. `Description`: Summary of where and how the list is consumed.
  5. `Actions`:
     - **Edit**: Modify title, product assignment, or description.
     - **Delete**: Remove unreferenced list container.

### Creation / Edit Modal
- **Code**: Text input (mandatory, immutable after creation).
- **Name**: Text input (mandatory).
- **Product**: Text input (optional product code).
- **Description**: Multi-line textarea.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `code` | String (PK) | Yes | Unique string (2–60 chars); `createOnly` | Unique category code | `MOTOR.bodyTypes` |
| `name` | String | Yes | 2–160 characters | Administrative name of the list | `Motor Vehicle Body Types` |
| `product_code` | String | No | Valid product code or null | Scopes list to a specific insurance product | `MOTOR` |
| `description` | Text | No | Plain text | Usage notes and journey location | `Used on vehicle details step for rating and inspection` |

---

## 5. Step-by-Step: How to Create a New Drop-down List
1. Navigate to **Admin** -> **Drop-down lists** (`/admin/lookupLists`).
2. Click **Add** (`admin.add`).
3. Enter:
   - **Code**: `MOTOR.vehicleUsage`
   - **Name**: `Motor Vehicle Usage Types`
   - **Product**: `MOTOR`
   - **Description**: `Classification for private, commercial, taxi, or rental vehicle usage`
4. *[Screenshot Placeholder: Drop-down Lists Add Modal with MOTOR.vehicleUsage]*
5. Click **Save** (`admin.save`).
6. Navigate immediately to **Drop-down values** (`/admin/lookupValues`) to populate the individual options.

---

## 6. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify `Name`, `Product`, or `Description`. The `Code` cannot be changed after creation.
- **Delete**: Click **Delete**. If child records exist in `lookup_values`, the foreign key constraint will prevent deletion. Delete or reassign child values first.

---

## 7. Approval Flow
- Drop-down list modifications apply immediately and do **not** enter the `Pending changes` queue.
- Actions are audited under `config.lookupLists.create`, `config.lookupLists.update`, and `config.lookupLists.delete`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Product in `products` (if linking to a specific product).
- **Downstream Consumers (What uses this AFTER)**:
  - Drop-down Values (`/admin/lookupValues`) filters and binds options to this `list_code`.
  - Field Properties (`/admin/fieldDefinitions`) selects this list in the `lookup_list` attribute to render HTML `<select>` controls.

---

## 9. Business Rules & Validations
1. **Unique Code**: The `code` field is the primary key and must be globally unique.
2. **Immutable Key**: Once created, `code` cannot be updated (`createOnly = true`).

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `FIELD_REQUIRED` | Submitted without a code or name. | Enter both Code and Name before saving. |
| Duplicate Entry | Code already exists in database. | Choose a unique category identifier, adhering to the naming convention `{PRODUCT}.{category}`. |

---

## 11. Sample Configuration: Motor Vehicle Body Types
- **Code**: `MOTOR.bodyTypes`
- **Name**: `Vehicle Body Types`
- **Product**: `MOTOR`
- **Description**: `Sedan, SUV, Coupe, Hatchback, Pickup`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="lookupLists"`.
- **API Endpoints**:
  - `GET /api/platform/entities/lookupLists`
  - `POST /api/platform/entities/lookupLists`
  - `PUT /api/platform/entities/lookupLists/:code`
  - `DELETE /api/platform/entities/lookupLists/:code`
- **Database Table**: `lookup_lists`
