# 71. Platform Licence

---

## 1. Overview
The **Platform Licence** module (`/admin/licence`) manages the tenant's commercial software license. It monitors authorized product line modules (`FIRE`, `MARINE`, `WC`, `ENGINEERING`, `B2C`, `B2B`, `REPORTS`, `API`), enforces concurrent active staff user seat limits (`maxUsers`), tracks term validity and statutory grace periods, and provides an administrative interface for installing cryptographically signed license keys without service downtime.

---

## 2. Who Can Access
- **View Licence Status**: Any authenticated user with `admin.access` can view the current license details.
- **Install Licence Key**: Restricted to users with the `admin.licence` privilege.
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Current Licence Summary Card
- **Header**: Licensee entity name (e.g. `Emirates Insurance Corporation`) with a status badge:
  - `OK` (Green): Active with remaining validity (e.g. `245 days left`).
  - `WARN` (Yellow): Nearing expiry (within `licence.warnDays`, default 30 days).
  - `In grace period` (`admin.grace`): Term has expired, but operating within the 15-day statutory grace period.
  - `Not active` (`admin.inactive`): License expired and grace period ended.
- **Details Table**:
  1. `ID`: Unique license identifier (e.g. `LIC-2026-PROD-001`).
  2. `Valid until`: Start and end dates with grace period allowance (e.g. `01/01/2026 – 31/12/2026 (+15)`).
  3. `Seats`: Active staff users vs maximum licensed seats (`seatsUsed / maxUsers`, e.g. `8 / 25`).
  4. `Modules`: Pill badges displaying all authorized tenant capabilities (`FIRE`, `MARINE`, `WC`, `ENGINEERING`, `B2C`, `B2B`, `REPORTS`, `API`).

### Install Licence Key Card (`admin.installKey`)
Rendered when the signed-in user holds the `admin.licence` privilege:
- **Textarea**: Monospace input to paste a new cryptographically signed license key string.
- **Install Button** (`admin.install`): Validates cryptographic signature, installs the license, and refreshes status. Disabled if key input is fewer than 20 characters.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `licence_id` | String | Yes | Alphanumeric license key ID | Commercial license contract reference | `LIC-2026-PROD-001` |
| `licensee` | String | Yes | Plain text | Legal entity name of the tenant | `Gulf Commercial Insurance LLC` |
| `modules` | JSON Array | Yes | Subset of platform modules | List of authorized product & channel modules | `["FIRE","MARINE","WC","ENGINEERING","B2C","B2B"]` |
| `max_users` | Integer | Yes | Positive integer | Maximum concurrent active staff accounts | `25` |
| `valid_from` | Date | Yes | ISO Date / Timestamp | Commercial term start date | `2026-01-01` |
| `valid_to` | Date | Yes | ISO Date / Timestamp | Commercial term expiry date | `2026-12-31` |
| `grace_days` | Integer | Yes | Non-negative integer (default: 15) | Post-expiry operational grace period | `15` |
| `current` | Boolean | Yes | `true`, `false` | Indicates active installed key | `true` |
| `installed_by`| Integer (FK) | Yes | Valid ID in `users` | Administrator who installed the key | `3` (config1) |
| `installed_at`| Timestamp | Auto | ISO Timestamp | Timestamp key was activated | `2026-10-22 10:00:00` |

---

## 5. Platform Modules & Enforcement Rules

| Module Code | Functional Scope Enabled | Impact if Module Missing / Expired |
|---|---|---|
| `FIRE` | Property – Fire & Allied Perils quotes and binding | New Fire quotes and binding blocked |
| `MARINE` | Marine Cargo (single transit, open covers, certs) | New Marine quotes and binding blocked |
| `WC` | Workmen’s Compensation & Employer’s Liability | New WC quotes and binding blocked |
| `ENGINEERING` | Contractors' All Risks, Plant, Machinery, EEI | New Engineering quotes and binding blocked |
| `B2C` | Direct consumer online purchase journeys | Public quotes disabled; broker access only |
| `B2B` | Broker portal, broker binding, commissions | Broker portal binding disabled |
| `REPORTS` | Management information and compliance reports | `/reports` analytics endpoints blocked |
| `API` | Machine-to-machine partner and ERP certificate APIs | External REST API keys rejected |

### Operational Continuity Safeguard
If a license expires or an individual module is omitted:
- **New Business Stops**: New quotations and policy binding are immediately blocked.
- **Servicing & Claims Continue**: Existing policyholders and brokers can **always** log in, view documents, pay renewal invoices, declare monthly shipments/wages, and register loss claims.

---

## 6. Step-by-Step: Installing a Licence Key
1. Obtain an authorized signed license key from your platform vendor (or generate in development using `node scripts/issue-licence.js`).
2. Sign in as a Configuration Administrator (`config1@portal.test`).
3. Navigate to **Admin** -> **Licence** (`/admin/licence`).
4. *[Screenshot Placeholder: Licence Screen showing Current Status and Install Key Box]*
5. Scroll down to **Install a licence key**.
6. Paste the signed license key string into the textarea.
7. Click **Install** (`admin.install`).
8. The backend verifies the cryptographic signature against `LICENCE_SECRET`. If valid:
   - The key is installed and marked `current = true`.
   - In-memory cache is invalidated (`licence.invalidate()`).
   - The status banner refreshes to green (`245 days left`).
   - The action is recorded in `audit_log`.

---

## 7. How to Issue Development Licence Keys
Developers and DevOps engineers can issue signed test keys using the repository script:
```bash
# In the api/ directory:
node scripts/issue-licence.js
```
The script reads `LICENCE_SECRET` from `.env`, creates a payload with all modules and 25 seats valid for 365 days, signs it, and prints the raw key string ready for pasting into `/admin/licence`.

---

## 8. Approval Flow
- License installation applies immediately upon clicking **Install**. It does **not** route through the `Pending changes` queue.
- Every license installation is audited under `action: 'licence.install'` with licensee, module list, max users, and expiry date.

---

## 9. Dependencies
- **Downstream Consumers**:
  - `licence.assertSeatAvailable()` blocks adding active staff users in `/admin/users` when `seatsUsed >= maxUsers`.
  - `licenceState.canQuote(product)` is evaluated on every quote creation and policy binding request.

---

## 10. Common Errors & Troubleshooting

| Error Code | Cause | Resolution |
|---|---|---|
| `LICENCE_INVALID (bad_signature)` | Key string was corrupted or signed with a different secret. | Ensure the full key string is pasted without extra whitespace and matches the server's `LICENCE_SECRET`. |
| `LICENCE_INVALID (expired)` | The key's `validTo` date has already passed. | Request or issue an updated key with future validity dates. |
| Warning banner: "Licence expires in N days" | Remaining validity is less than `licence.warnDays`. | Contact your vendor to obtain an updated renewal license key. |

---

## 11. Sample Licence Payload
```json
{
  "licenceId": "LIC-2026-PRODUCTION",
  "licensee": "Emirates National Insurance PSC",
  "modules": ["FIRE", "MARINE", "WC", "ENGINEERING", "B2C", "B2B", "REPORTS", "API"],
  "maxUsers": 50,
  "validFrom": "2026-01-01",
  "validTo": "2027-01-01",
  "graceDays": 15
}
```

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/licence/page.js`
- **API Endpoints**:
  - `GET /api/platform/licence`
  - `POST /api/platform/licence` (requires `admin.licence`)
- **Database Table**: `licences`
- **Verification Engine**: `api/src/lib/licence.js` (`verify`), `api/src/lib/licenceState.js` (`current`, `assertSeatAvailable`, `canQuote`).
