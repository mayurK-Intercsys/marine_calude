# 20. Users

---

## 1. Overview
The **Users** module (`/admin/users`) manages the lifecycle of insurer staff and broker agency accounts. Administrators use this screen to provision staff, assign functional roles, link broker users to their licensed broker firms, monitor tenant seat quotas against the platform licence, deactivate departing staff, and issue temporary passwords with mandatory first-login password changes.

---

## 2. Who Can Access
- **Required Permission**: `admin.users`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
- *Note*: Customers register themselves self-service using mobile or email one-time codes (OTP) and cannot be manually created via this screen.

---

## 3. Screen Walkthrough

### Header & Seat Usage Monitor
- **Header**: "Users" (`admin.users`).
- **Seats Badge**: Displays active staff usage vs maximum licensed seats: `Seats used: {used} / {max}` (e.g. `Seats used: 8 / 25`).
- **Temporary Password Banner**: When a user is created or has their password reset, a highlighted warning banner displays:
  `Temporary password (share securely; it must be changed at first sign-in): Tmp-xxxxxxxxxx!9`

### New User Form (`admin.newUser`)
A dedicated card providing input fields for provisioning staff or brokers:
- **Email** (`admin.email`): Corporate email address.
- **Name** (`admin.name`): Full legal name.
- **Role** (`admin.role`): Drop-down selection of active staff roles (excludes `customer`).
- **Broker** (`admin.broker`): Conditionally rendered when the selected role is a broker role (`broker_admin` or `broker_user`). Drop-down of registered broker firms.
- **Add Button**: Submits creation, generates temporary credentials, and displays the password banner.

### User Filter & List Controls
- **Type Filter**: Drop-down to switch between `Staff and brokers` (`staff`) and `Customers` (`customer`).
- **Search Bar**: Substrings matched against email, full name, or mobile number.

### Users Data Table
- Columns:
  1. **Name**: Full name, with secondary hint indicating last sign-in timestamp (`lastLoginAt`).
  2. **Email / Mobile**: Contact identifier.
  3. **Role**:
     - For Staff: An interactive inline `<select>` drop-down allowing immediate role reassignment.
     - For Customers: Static role badge (`Customer`).
  4. **Broker**: Name of linked broker firm (e.g. `Gulf Shield Insurance Brokers`) or `—` for insurer staff.
  5. **Status Toggle Button**: Direct inline button displaying `Deactivate` (for active users) or `Activate` (for deactivated users).
  6. **Password Reset Button**: For staff accounts, a `Reset password` action that generates a new temporary password.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique user identifier | `5` |
| `email` | String | Yes | Valid email format | User login email (case-insensitive unique) | `sara@gulfshield.test` |
| `name` (`full_name`)| String | Yes | 2–160 characters | User's full legal name | `Sara Al Nuaimi` |
| `roleId` | Integer (FK) | Yes | Valid ID in `roles` (active=true) | Assigned functional role | `5` (Broker user) |
| `brokerId` | Integer (FK) | Conditional | Valid ID in `brokers` | Required if role is `broker_admin` or `broker_user` | `1` (Gulf Shield) |
| `active` | Boolean | Yes | `true`, `false` | Account active status (counts against licence) | `true` |
| `lastLoginAt` | Timestamp | No | ISO Timestamp | Last successful authentication | `2026-10-22 09:12:00` |
| `mustChangePassword`| Boolean | Auto | `true`, `false` | Forces password change at next login | `true` |

---

## 5. Step-by-Step: How to Provision a New User

### Step 1: Provisioning a Broker or Staff Account
1. Navigate to **Admin** -> **Users** (`/admin/users`).
2. Verify that the **Seats used** badge has available capacity (e.g. `8 / 25`).
3. Under **New user**, enter:
   - **Email**: `ahmed.khalil@emiratespremier.test`
   - **Name**: `Ahmed Khalil`
   - **Role**: Select `Broker user`
4. The **Broker** drop-down appears. Select `Emirates Premier Insurance Brokers`.
5. *[Screenshot Placeholder: New User Form filled with Ahmed Khalil as Broker user]*
6. Click **Add** (`admin.add`).
7. Copy the generated temporary password from the yellow notice banner (e.g. `Tmp-a7e8b91c02!9`) and deliver it securely to the user.

---

## 6. How to Edit / Deactivate / Delete

### Editing Role or Broker Link
- Staff roles can be modified directly in the table using the inline **Role** select box. Selecting a new role applies the update immediately via `PUT /api/platform/users/:id`.

### Deactivating Accounts
- Click the inline **Deactivate** button.
- Deactivating an account immediately blocks sign-in, frees up a licence seat, and flips the action button to **Activate**.
- **Self-Deactivation Protection**: An administrator cannot deactivate their own active account (`CANNOT_DEACTIVATE_SELF`).

### Deleting Accounts
- Hard deletion of user accounts is disabled to preserve audit integrity, claim records, and policy issuance history. Accounts must be deactivated instead.

### Resetting Passwords
- Click **Reset password** on any staff row. The system updates the password hash, sets `must_change_password = true`, and displays the new temporary password banner.

---

## 7. Approval Flow
- User management actions apply immediately and do **not** enter the `Pending changes` approval queue.
- Every user creation, role update, deactivation, and password reset is logged to `audit_log`.

---

## 8. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - An active platform licence with available seats (`maxUsers > seatsUsed`).
  - Active roles in `/admin/roles`.
  - Registered broker entities in `brokers` (for broker users).
- **Downstream Consumers (What uses this AFTER)**:
  - Authentication engine (`/api/auth/login`).
  - Referral queue (allocates tasks to underwriters).
  - Commission ledger (tracks quotes and policies bound by broker users).

---

## 9. Business Rules & Validations
1. **Seat Limit Enforcement**: Creating an active staff user or activating a deactivated staff user calls `licence.assertSeatAvailable()`. If `seatsUsed >= maxUsers`, the API rejects with HTTP 409 `SEATS_EXCEEDED`.
2. **Customer Registration Barrier**: Creating a customer via the admin console is blocked (`CUSTOMERS_SELF_REGISTER`). Customers must register themselves using mobile/email OTP.
3. **Role Type Integrity**: A customer account cannot be converted into a staff account, or vice versa (`ROLE_TYPE_CHANGE`).
4. **Broker Mandatory Flag**: If a role has `base_role` equal to `broker_admin` or `broker_user`, `brokerId` is strictly required (`BROKER_REQUIRED`).

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `SEATS_EXCEEDED` | All licensed staff seats are in use. | Deactivate inactive staff accounts or install an upgraded licence key with higher `maxUsers` in `/admin/licence`. |
| `EMAIL_IN_USE` | The specified email address already exists. | Use a unique email or find the existing user using the search box. |
| `BROKER_REQUIRED` | A broker role was selected without choosing a broker agency. | Select the appropriate broker firm in the **Broker** drop-down. |
| `CANNOT_DEACTIVATE_SELF` | Administrator clicked deactivate on their own profile. | Another administrator must perform this action if deactivation is required. |

---

## 11. Sample Configuration
**Scenario**: Adding a new Underwriter Manager for the Marine department.
- **Email**: `sarah.underwriting@insurer.example`
- **Name**: `Sarah Jenkins`
- **Role**: `Underwriting manager`
- **Broker**: `—` (Not applicable)
- **Resulting Account**:
  - `role`: `uw_manager`
  - `active`: `true`
  - `must_change_password`: `true`
  - `seatsUsed`: Increments by 1

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/users/page.js`
- **API Endpoints**:
  - `GET /api/platform/users?type={staff|customer}&q={query}`
  - `POST /api/platform/users`
  - `PUT /api/platform/users/:id`
  - `POST /api/platform/users/:id/reset-password`
- **Database Tables**: `users`, `roles`, `brokers`, `licences`.
- **Security Logic**: `bcrypt` (10 rounds) for password hashing; `crypto.randomBytes(5)` for temporary password generation.
