# 21. Roles and Privileges

---

## 1. Overview
The **Roles and Privileges** module (`/admin/roles`) defines the platform's access control policies. It governs which administrative, underwriting, operational, and customer-facing capabilities are granted to user personas. System administrators can inspect built-in system roles, create custom hybrid roles based on standard base archetypes, and configure granular functional privileges using a module-based privilege matrix.

---

## 2. Who Can Access
- **Required Permission**: `admin.roles`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
- **Lockout Safeguard**: The system strictly forbids revoking `admin.roles` from the `config_admin` role (`LOCKOUT` conflict error).

---

## 3. Screen Walkthrough

### Roles Master Table
Rendered via the generic `EntityManager` component:
- **Header**: "Roles" with **Add** button (`admin.add`).
- **Search & Filter Controls**: Search across role code and localized titles.
- **Table Columns**:
  1. `Code`: Unique alphanumeric code (e.g. `config_admin`, `senior_uw`).
  2. `Name (English)`: Official English title.
  3. `Based on`: Base archetype (`customer`, `underwriter`, `broker_user`, etc.).
  4. `Description`: Summary of role responsibilities.
  5. `Active`: Status checkmark (`✓` or `✗`).
  6. `Built-in`: System flag indicating whether the role is immutable core infrastructure.
  7. `Actions`:
     - **Edit**: Opens the modal to modify names, description, or active status.
     - **Privileges** (`admin.editPrivileges`): Opens the granular privilege assignment drawer.
     - **Delete**: Available only for non-system roles (`system = false`).

### Privileges Assignment Drawer (`Privileges`)
When clicking **Privileges** on any role:
- Displays header: `Privileges: {role.name_en}`.
- Groups all 27 platform permissions into collapsible fieldsets by functional module:
  - `admin`, `quotes`, `underwriting`, `rating`, `finance`, `reports`, `engineering`, `b2b`, `claims`.
- Each permission renders with a checkbox, title, and descriptive tooltip showing its internal permission code.
- Bottom actions: **Save** (`admin.save`) and **Cancel** (`admin.cancel`).

---

## 4. Field Reference Table

### Role Entity (`roles`)
| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `code` | String | Yes | Unique alphanumeric; `createOnly` | Unique role identifier | `senior_underwriter` |
| `name_en` | String | Yes | 2–160 characters | Display name in English | `Senior Commercial Underwriter` |
| `name_ar` | String | Yes | 2–160 characters | Display name in Arabic | `مكتتب تجاري أول` |
| `base_role` | Enum | Yes | `customer`, `broker_admin`, `broker_user`, `underwriter`, `uw_manager`, `config_admin`, `ops`, `risk_engineer`; `createOnly` | Core behavioral archetype | `underwriter` |
| `description`| Text | No | Plain text | Functional scope and intent | `Senior underwriting authority for high-hazard property` |
| `active` | Boolean | Yes | `true`, `false` | Enables role assignment | `true` |
| `system` | Boolean | Auto | `true`, `false`; `readonly` | Built-in system flag (protected from deletion) | `false` |

---

## 5. Complete Platform Privileges Matrix

| Module | Permission Code | Description & Authority |
|---|---|---|
| **admin** | `admin.access` | Required to open the Admin console (`/admin/*`) |
| | `admin.users` | Provision users, reset passwords, activate/deactivate |
| | `admin.roles` | Create custom roles and configure privilege assignments |
| | `admin.products` | Access product catalogue, configure LOBs, products, covers, deductibles, charges, taxes |
| | `admin.rules` | Create, edit, and test dynamic rule sets and decision tables |
| | `admin.rating` | Author and edit dynamic rating calculation models |
| | `admin.lookups` | Manage master drop-down lists and values |
| | `admin.parameters`| Edit system parameters (security, OTP, SMTP, approval flags) |
| | `admin.numbering` | Configure document numbering templates |
| | `admin.templates` | Manage bilingual email and SMS templates; send test emails |
| | `admin.notifications`| Map system events to communication channels and templates |
| | `admin.outbox` | View outbox logs and delivery statuses |
| | `admin.commission`| Manage broker commission schemes and approve payout settlements |
| | `admin.licence` | Install platform licence keys and inspect tenant limits |
| | `admin.fields` | Manage field properties, labels, tooltips, and validation regex |
| | `admin.help` | Author online help manual articles |
| | `admin.audit` | View immutable audit trail of platform events |
| **quotes** | `quotes.create` | Create and price insurance quotations online |
| | `quotes.bind` | Bind quotes into active issued policies |
| **underwriting**| `referrals.decide`| Review, load, discount, impose warranties, and decide referrals |
| **rating** | `rates.edit` | Create and edit rate table drafts (maker) |
| | `rates.approve` | Approve rate table drafts (checker) |
| | `engines.approve`| Approve rule sets, rating models, and pending config changes (checker) |
| **finance** | `payments.confirm`| Confirm manual bank transfers and issue pending policies |
| **reports** | `reports.view` | View and export MIS performance and compliance reports |
| **engineering**| `surveys.complete`| Perform and submit engineering risk surveys |
| **b2b** | `commission.view`| View broker commission statements and balances |
| **claims** | `claims.notify` | Register initial loss claims |
| | `documents.review`| Review, verify, or reject uploaded verification documents |

---

## 6. Step-by-Step: How to Create a Custom Role & Assign Privileges

### Step 1: Create the Custom Role
1. Navigate to **Admin** -> **Roles and privileges** (`/admin/roles`).
2. Click **Add** (`admin.add`).
3. Enter:
   - **Code**: `marine_underwriter`
   - **Name (English)**: `Marine Cargo Underwriter`
   - **Name (Arabic)**: `مكتتب تأمين بحري`
   - **Based on**: Select `underwriter`
   - **Description**: `Underwriting specialist dedicated to marine single transit and open covers`
   - **Active**: Check box.
4. Click **Save**.

### Step 2: Configure Functional Privileges
1. In the roles table, locate `marine_underwriter`.
2. Click **Privileges** (`admin.editPrivileges`).
3. In the privilege drawer, check the required capabilities:
   - Under `admin`: check `admin.access`, `admin.products`, `admin.rules`.
   - Under `underwriting`: check `referrals.decide`.
   - Under `reports`: check `reports.view`.
   - Under `claims`: check `documents.review`.
4. *[Screenshot Placeholder: Privileges Assignment Drawer with checkboxes for marine_underwriter]*
5. Click **Save** (`admin.save`).
6. The role is now immediately available in `/admin/users` for staff assignment.

---

## 7. How to Edit / Deactivate / Delete
- **Editing Metadata**: Click **Edit** on any role row to update localized names, description, or toggle `active`.
- **Modifying Privileges**: Click **Privileges** to check or uncheck capabilities at any time. Changes take effect on the user's next API request (session refresh).
- **Deleting Roles**:
  - Click **Delete** on a custom role row.
  - **System Protection**: Built-in system roles have `system = true` and cannot be deleted (`SYSTEM_ROLE` error).
  - A role cannot be deleted if active users are currently assigned to it.

---

## 8. Approval Flow
- Role configuration and privilege assignments apply immediately and do **not** enter the `Pending changes` queue.
- Every privilege assignment mutation is audited with the list of granted permission codes (`audit action: 'role.permissions'`).

---

## 9. Business Rules & Validations
1. **Immutable System Roles**: The core roles (`config_admin`, `uw_manager`, `underwriter`, `ops`, `broker_admin`, `broker_user`, `customer`, `risk_engineer`) cannot have their primary key, code, base role, or system flag altered.
2. **Lockout Protection**: If an administrator attempts to save privileges for `config_admin` without including `admin.roles`, the API rejects with HTTP 409 `LOCKOUT`:
   *"The configuration administrator must keep role management"*.
3. **Privilege Whitelist**: All submitted permission codes are checked against the `permissions` table. Submitting an unseeded or arbitrary permission code throws HTTP 400 `PERMISSION_UNKNOWN`.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `SYSTEM_ROLE` | Attempted to delete a built-in role. | Built-in system roles cannot be deleted. Deactivate them instead by unchecking `active`. |
| `LOCKOUT` | Attempted to remove `admin.roles` from `config_admin`. | Ensure `admin.roles` remains checked for the configuration administrator role. |
| `PERMISSION_UNKNOWN` | Submitted permission string does not exist in master registry. | Select permissions only from the provided checkbox interface. |

---

## 11. Sample Configuration: Claims Specialist Role
- **Code**: `claims_officer`
- **Name (English)**: `Claims Settlement Officer`
- **Name (Arabic)**: `مسؤول تسوية المطالبات`
- **Base Role**: `ops`
- **Assigned Privileges**:
  - `admin.access`
  - `claims.notify`
  - `documents.review`
  - `reports.view`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/roles/page.js`
- **API Endpoints**:
  - `GET /api/platform/entities/roles`: Lists roles.
  - `POST /api/platform/entities/roles`: Creates role.
  - `PUT /api/platform/entities/roles/:id`: Updates role.
  - `DELETE /api/platform/entities/roles/:id`: Deletes custom role.
  - `GET /api/platform/permissions`: Returns all master privileges grouped by module.
  - `GET /api/platform/roles/:id/permissions`: Returns assigned permission codes.
  - `PUT /api/platform/roles/:id/permissions`: Replaces assigned permissions atomically within a database transaction.
- **Database Tables**: `roles`, `permissions`, `role_permissions`.
