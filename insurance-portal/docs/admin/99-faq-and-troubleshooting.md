# 99. FAQ & Troubleshooting Guide

---

## 1. Frequently Asked Questions (FAQ)

### General & Access Control
#### Q: Why can't I see the "Admin" menu in the header?
**A**: Your account lacks the `admin.access` permission. Contact a configuration administrator to assign an administrative or underwriting manager role in `/admin/users` or grant `admin.access` to your custom role in `/admin/roles`.

#### Q: How do customer users sign in compared to staff/broker users?
**A**:
- **Customers**: Sign in using the **Customer** tab on `/auth/login` via a 6-digit one-time code (OTP) delivered by SMS or email. In development/staging, the valid OTP code is rendered directly on the screen.
- **Brokers and Insurer Staff**: Sign in using the **Broker or insurer staff** tab with their email and password. Initial accounts created by administrators use a temporary password (e.g. `Tmp-xxxx!9`) and are forced to change their password at first sign-in.

#### Q: Why can't an administrator create customer accounts in `/admin/users`?
**A**: Customers must self-register by providing their own phone or email. This guarantees that direct policyholders consent to identity verification, terms, and privacy declarations.

---

### Maker-Checker & Approvals
#### Q: Why did my configuration change go to "Pending changes" instead of taking effect immediately?
**A**: The tenant system parameter `products.requireApproval` is set to `true`. This enforces four-eyes governance across all product configuration entities (`lobs`, `products`, `productCovers`, `productDeductibles`, `premiumAdjustments`, `charges`, `taxes`, `documentRequirements`). The change will not take effect until a second user with `engines.approve` approves it in `/admin/changes`.

#### Q: Why do I receive `MAKER_CANNOT_APPROVE` when I try to approve a change?
**A**: Segregation of Duties (SOD) is enforced at the API layer. The administrator who created or submitted a change, rule set, or rating model is prohibited from approving it. A different user holding the `engines.approve` privilege must log in to review and approve.

#### Q: How do I bypass the approval queue in a local or sandbox environment?
**A**: Set system parameter `products.requireApproval` to `false` in `/admin/parameters`. Subsequent product configuration edits will apply immediately.

---

### Dynamic Engines (Rules & Rating)
#### Q: Why does submitting my Rule Set fail with error `TESTS_FAILING`?
**A**: A rule set draft cannot be submitted for checker approval if any automated test case fails. Run the tests on the workbench, inspect the `got ≠ expected` diff, and update either your rule logic or your test case expectations until 100% pass.

#### Q: What happens to existing quotes and active policies when a new Rating Model version is published?
**A**:
- **New Quotes**: Immediately priced on the newly published rating model version.
- **Saved Quotes**: Locked to the rating model version that originally calculated them. If a customer returns to pay an expired quote, the system re-rates on the current live model.
- **Active Policies**: Maintain their historical rating model version in the database for actuarial audit trails.

#### Q: Can I run both the legacy coded rater and the dynamic rating model at the same time?
**A**: Yes, in the **Test bench** (`/admin/rating`), you can price sample risks side by side on both the candidate draft and the live model. However, for live policy binding, once a dynamic model is approved and published, `products.rater` is set to `dynamic`, routing all quotation traffic through the dynamic engine.

---

### Communication & Messaging
#### Q: Why are my emails not being delivered to customers even though the portal says "Sent"?
**A**: Check the **Sent messages** outbox (`/admin/outbox`):
- If status is `logged`: The platform parameter `email.smtp.enabled` is currently `false`. Emails are saved to the database outbox for review but not transmitted to a mail server. Enable SMTP in `/admin/parameters`.
- If status is `failed`: Inspect the `Error` column in the outbox (e.g. `Invalid credentials`, `Connection refused`, or `Mailbox unavailable`).

#### Q: How do I send a test email without creating a live quote?
**A**: Navigate to **Email and SMS templates** (`/admin/templates`). In the top **Send a test email** card, enter an email address and click **Send**.

---

### Licensing & Quotas
#### Q: What happens if our platform licence expires?
**A**:
1. **Grace Period (15 Days)**: The portal remains active; a yellow warning banner informs administrators that the tenant is in the grace period.
2. **Expired**: When the grace period ends:
   - **New Business Stops**: New quotations and binding are blocked with error `LICENCE_EXPIRED`.
   - **Servicing & Claims Continue**: Customers and brokers can still log in, view policies, pay pending invoices, file endorsements, and register loss claims.
3. Install an updated signed license key in `/admin/licence` to restore full quoting operations immediately.

#### Q: Why did adding a staff user fail with `SEATS_EXCEEDED`?
**A**: The number of active non-customer accounts has reached `maxUsers` in your platform license. Deactivate unused accounts in `/admin/users` or install an upgraded license key in `/admin/licence`.

---

## 2. Error Code Resolution Dictionary

| API Error Code | HTTP Status | Root Cause | Exact Resolution |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or expired JWT cookie. | Sign in again through `/auth/login`. |
| `FORBIDDEN` | 403 | User lacks `admin.access` or specific required permission. | Check user role in `/admin/users` and assign required permissions in `/admin/roles`. |
| `MAKER_CANNOT_APPROVE` | 403 | Operating user created/submitted the item. | Have a different administrator with `engines.approve` perform approval. |
| `LOCKOUT` | 409 | Attempted to revoke `admin.roles` from `config_admin`. | Ensure `admin.roles` remains checked for the Configuration Administrator role. |
| `SYSTEM_ROLE` | 409 | Attempted to delete a built-in system role. | System roles cannot be deleted. Deactivate custom roles instead. |
| `SEATS_EXCEEDED` | 409 | Active staff accounts reached licence seat ceiling. | Deactivate inactive staff in `/admin/users` or install larger licence. |
| `FIELD_LOCKED` | 400 | Attempted to hide or make optional a core legal identity field. | Keep core fields (`companyName`, `tradeLicence`, `email`, `mobile`, `inceptionDate`) visible and mandatory. |
| `PATTERN_INVALID` | 400 | Invalid regex syntax in field definition pattern. | Verify regex syntax (e.g. `^\d{7}$`) before saving in `/admin/fieldDefinitions`. |
| `PATTERN_NEEDS_SEQ` | 400 | Number format pattern lacks `{SEQ:n}` token. | Add a sequence token (e.g. `{SEQ:6}`) to the pattern in `/admin/numberFormats`. |
| `RATE_OUT_OF_RANGE` | 400 | Tax or commission rate is negative or exceeds 0.5. | Enter rate as decimal fraction between `0.0` and `0.5` (e.g. `0.05` for 5%). |
| `PERCENT_OUT_OF_RANGE`| 400 | Premium adjustment percentage is `<= 0` or `> 1.0`. | Enter percentage as decimal fraction between `0.01` and `1.0`. |
| `FACTOR_OUT_OF_RANGE` | 400 | Deductible premium factor is `<= 0` or `> 2.0`. | Enter rating factor multiplier between `0.01` and `2.0` (e.g. `0.92`). |
| `TESTS_FAILING` | 409 | Rule set submitted with failing test cases. | Debug rules on test bench; ensure all tests show green checkmarks (`✓`). |
| `MODEL_INVALID` | 400 | Rating model JSON contains unparseable expressions. | Check step list; fix expression syntax in reported step. |
| `DRAFT_EXISTS` | 409 | Attempted to create draft when an open draft already exists. | Finish, approve, or reject the existing open draft version first. |
| `LICENCE_INVALID` | 400 | Key corrupted, signature invalid, or dates expired. | Re-generate or request valid signed key matching `LICENCE_SECRET`. |

---

## 3. Maintenance & Operational Commands

### Running Daily Background Jobs Manually
Renewal quotes (45 days before expiry), reminder notices, automatic card charges (7 days before expiry), and policy expirations run on an automated nightly cron schedule. To trigger them on-demand:
- **From UI**: Sign in as `ops@portal.test` -> navigate to **Bank transfers** -> **Daily jobs** -> click **Run now**.
- **From CLI**:
  ```bash
  cd api
  npm run jobs:daily
  ```

### Re-seeding Initial Administration Master Data
If testing in a sandbox environment and needing to reset all roles, drop-downs, templates, and number formats:
```bash
cd api
# Re-run migrations and base seeds
npm run migrate
npm run seed
```

### Inspecting Raw Server Logs
If an endpoint returns an unexpected error:
- API Express logs: Check terminal running `npm run dev` in `api/` (logs requests with morgan).
- Web App Next.js logs: Check terminal running `npm run dev` in `web/`.
