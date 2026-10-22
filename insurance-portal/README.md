# Multi-line Insurance Portal — all four product lines (Fire, Marine, Workmen's Compensation, Engineering)

Release 4.5 completes the platform upgrade with document upload and dashboards. Release 4.4 priced all four products on the dynamic rating engine, adds Marine and Engineering deductibles to product configuration, and adds approval for product configuration changes. Release 4.3 added the rule engine and the dynamic rating engine. Release 4.2 (stage 3) added end-to-end product configuration (lines of business, products, covers, deductibles, discounts and loadings, charges, taxes) that pricing reads live. Release 4.1 (stage 2) applied Admin field properties and tooltips to every screen. Release 4.0 (stage 1) added the Admin module: roles and privileges, drop-down values, system parameters, number formats, email/SMS templates with SMTP and an outbox, configurable notifications, commission schemes and payouts, platform licence, field properties and the online help manual (see "Admin module"). Release 3.1 completed the open features across products (see "Release 3.1" below). Phase 3 added **Workmen's Compensation & Employer's Liability** and **Engineering** (CPM, CAR, EAR, Machinery Breakdown, Electronic Equipment) per their BRDs. Phase 2 added **Marine Cargo** (single transit, inland transit and annual open cover with online certificates) per the Marine BRD. Release 1.1 added: policy changes that go to an underwriter, an operations screen for bank transfers, renewals (quotes, reminders, automatic renewal, expiry), the accumulation check (UW-11) and MIS reports.

One portal for B2C customers, brokers/agents and insurer back office, built to the Fire, Marine, WC and Engineering BRDs. Phase 1 delivers the shared core and the Fire & Allied Perils product end to end, in English and Arabic.

| Layer | Stack |
| --- | --- |
| Front end | Next.js 15 (App Router), React 19, plain CSS, English + Arabic (RTL) |
| API | Node.js 22, Express 4, Zod validation, JWT session cookie |
| Database | MySQL 8, Knex migrations and seeds |

## Run it

### With Docker (quickest)

```bash
docker compose up --build
docker compose exec api npm run seed     # once: demo users, Fire product, UAE rates
```

Open http://localhost:3000.

### Without Docker

Needs Node 20+ and MySQL 8 with a database `insurance_portal` (utf8mb4) and a user that can use it.

```bash
cd api
cp .env.example .env          # set DB_* and JWT_SECRET
npm install
npm run migrate && npm run seed
npm run dev                   # API on http://localhost:4000

cd ../web
cp .env.example .env.local    # API_URL=http://localhost:4000
npm install
npm run dev                   # site on http://localhost:3000
```

The web app proxies `/api/*` to the API, so the session cookie stays first-party.

### Tests

```bash
cd api
# needs an empty database insurance_portal_test (or set DB_NAME_TEST)
npm test
```

101 end-to-end tests run against real MySQL:

- `fire.e2e.test.js` (17): B2C quote to policy, underwriter referral and approval, broker bind on credit with commission, declined and above-limit risks, failed payment, cover start in the past, sum-insured change paid before it applies, claim notification, cancellation, bilingual documents and QR verification, rate-table maker-checker.
- `parity.fire.test.js` (2): 600 random Fire risks price identically on the coded rater and the Fire rating model (breakdowns, per-location factors, facts, validation errors, not-quotable reasons, missing factors).
- `documents.e2e.test.js` (5): claim checklist with a conditional item; PDF and PNG uploads; a renamed executable, the EICAR test file and an oversized file refused; byte-identical download; another customer refused; staff verify / reject; reviewed documents locked; referral checklist shared by customer and underwriter; customer and broker dashboard figures, each limited to their own business.
- `parity.marine.test.js` (4): 1,000 random shipments, 400 open covers and 800 certificates under them, and the vessel lookup, identical on the coded rater and the Marine model.
- `parity.wc-eng.test.js` (4): 800 random WC workforces (named and unnamed) and 600 Engineering risks (equipment, CAR / EAR projects, annual CAR, plus every project re-priced through the annual-declaration entry) and the flood-zone / permit lookups, identical on coded raters and models.
- `engines.e2e.test.js` (6): all referral rules migrated into published rule sets; a new version with an expression decline rule, test cases, the bench and maker-checker; a decision table blocked while a test fails, then live; a rating-model draft validated, compared with the live model and published.
- `products.e2e.test.js` (7): product overview and privilege; cover pricing, deactivation and renaming (screens, quotes, documents); deductible premium factor; automatic discounts by channel and condition in priority order; a non-taxable percentage fee with a minimum; a product-specific levy and zero-rated Marine exports; lines of business and product edits.
- `admin.e2e.test.js` (12): admin access by privilege, custom roles and temporary passwords, drop-down values reaching product screens, parameters (OTP validity, masked secrets), product-specific number formats, SMTP test email and rendered emails in the outbox, rules switched off, edited templates, in-app notifications for underwriters, most-specific commission scheme and payouts, licence modules / grace / expiry / seats, field properties and help.
- `completion.e2e.test.js` (11): WC quarterly invoice raised and paid, sick-leave wages at full then half pay, overdue declaration blocking new cover; Marine ports, sub-user limits and premium hiding, API key issue/scope/revoke, open-cover renewal from usage; Fire renewal approved on last year's terms; Engineering permit referral and risk survey, EAR testing referral and partial handover, annual CAR (broker-only, binding, project declared within terms, outside terms referred).
- `wc.e2e.test.js` (9): Essential and Complete plans priced to hand calculations, short periods, plan comparison without saving, referral rules (hazardous trade, fatal or repeated claims, occupational disease, implausible wages, headcount), declined trade and online limit; named policy with masked employee annex and statutory certificate; joiner priced pro rata and paid; back-dated joiner referred, approved and accepted; injury claims checked against the employee list; wage declaration with additional premium and the 75% minimum-retained floor; broker bind on credit.
- `engineering.e2e.test.js` (6): CAR priced to the BRD prototype (AED 15,928), instant-issue criteria and referrals (ground works, complexity, value, period, nat-cat, EAR hot testing and second-hand), online limit; CAR lifecycle (3-month extension at AED 2,400, over-25% extension refused, contract value change, completion with the 80% minimum retained, maintenance phase); CPM fleet per item with age and floater (about AED 44,669), old and large items, MB transformer and EEI imaging referrals, EEI add-ons; equipment added mid-term and paid; claims.
- `marine.e2e.test.js` (12): single-transit pricing checked against hand calculations (FOB freight, 10% uplift, USD to AED, war and strikes, VAT by direction), referral rules (used machinery, war-listed route, old vessel, departure within 24 hours), declined country and prohibited goods, wrong clause and inland war rejected, purchase with LC wording on the certificate, customers blocked from open covers; broker open cover referred, approved and bound on credit; certificate at the agreed rate; outside-terms and per-sending referrals with underwriter approval; bulk upload with per-row results; certificate authority and cancellation; monthly declaration, deposit adjustment and a claim against a certificate.
- `gaps.e2e.test.js` (6): policy change referred, information requested, approved with loading, then accepted and paid; decrease refunded; bank transfer confirmed or rejected by operations; renewal quotes, reminders sent once, automatic renewal with the saved card, lapsed policies expired, manual renewal; accumulation at one building; every report in JSON and CSV, hidden from brokers.

## Demo accounts

| Who | Sign in | Lands on |
| --- | --- | --- |
| Customer | Mobile `+971500000001` (or any new mobile/email); the one-time code is shown on screen in development | My policies |
| Broker user (standard) | `sara@gulfshield.test` | Broker dashboard |
| Broker admin | `admin@gulfshield.test` | Broker dashboard |
| Broker user (preferred) | `agent@emiratespremier.test` | Broker dashboard |
| Underwriter | `uw@portal.test` | Referral queue |
| UW manager | `uwm@portal.test` | Referral queue, rates |
| Config admin (maker) | `config1@portal.test` | Rate tables |
| Config admin (checker) | `config2@portal.test` | Rate tables |
| Operations | `ops@portal.test` | Bank transfers, daily jobs, reports |
| Risk engineer | `engineer@portal.test` | Survey workbench |

`config1@portal.test` has every Admin privilege; `ops@portal.test` sees sent messages and commission payouts.

Staff and broker password: `Passw0rd!` (development only).

Test payments: any card number succeeds; a number ending `0002` is declined. Any business name containing "sanction" triggers the sanctions referral.

## Try these journeys

1. **Instant cover:** Home → Fire → Shop / Grocery → address → enter fit-out, equipment, furniture, stock → extensions → sign in with code → details → pay. Open the schedule, certificate and tax invoice in English and Arabic.
2. **Referral:** same, but answer "No" to Civil Defence certificate. The quote shows why it needs review; send it. Sign in as `uw@portal.test`, approve with a 0.10 loading and a warranty. Back as the customer, the quote shows "Approved" with the new price; pay.
3. **Broker:** sign in as `sara@gulfshield.test`, start a quote, set a 15% discount (refers: above the 10% band) then 5% (instant), bind on broker credit, check the commission statement.
4. **Rate change:** `config1@portal.test` → Rates → `charges` → Create draft → change `minPremium` → Test against a sample quote → Submit. `config1` cannot approve; `config2@portal.test` can. New quotes use the new value immediately.

5. **Policy change with referral:** as a customer with a policy, open it → Change sums insured → raise stock so one location passes AED 5 million → Check the price → Send for review. As `uw@portal.test`, open the item marked "Change sums insured" in the queue and approve with a loading. Back as the customer, Accept and pay; the policy shows the new sum insured and the endorsement.
6. **Bank transfer:** buy with "Bank transfer". Sign in as `ops@portal.test` → Bank transfers → enter a bank reference → Confirm and issue.
7. **Renewal:** renewal quotes appear 45 days before expiry. To try it now, move a test policy's dates (`UPDATE policies SET inception_date = CURDATE() - INTERVAL 358 DAY, expiry_date = CURDATE() + INTERVAL 7 DAY WHERE id = …`), then as `ops@portal.test` → Bank transfers → Daily jobs → Run now. The customer's policy page shows "Review and renew"; policies bought with "Renew automatically" renew on their own.
8. **Reports:** as `uwm@portal.test` or `ops@portal.test` → Reports; choose a report and period; Download CSV.

## Release 1.1 features

| Feature | How it works | Where |
| --- | --- | --- |
| Policy changes | Sum-insured changes are priced pro rata for the days left. Increases are paid before they apply (card, saved card, or broker credit); decreases are refunded. Changes that break a referral rule go to the underwriter queue; once approved, the customer or broker accepts and pays. Contact changes apply at once. | Policy page; `POST /api/policies/:id/endorsements`, `/endorsements/preview`, `/endorsement-requests/:id/accept` |
| One underwriting queue | New business, renewals and policy changes share the queue, ordered by reply due time, with the same decision form and authority limits. | Underwriting |
| Bank transfers | Transfers wait as pending payments. Operations confirm with the bank reference (policy issued) or reject with a reason. | Bank transfers; `GET /api/admin/payments`, `POST …/confirm`, `POST …/reject` |
| Renewals | Daily: renewal quote 45 days before expiry, re-rated on current rates with this year's claims added; referral if a rule fires; reminders at 45, 30, 15, 7 and 1 days by email, SMS and to the broker, each sent once; automatic renewal 7 days before expiry with the saved card token; lapsed policies expire. A renewal paid after expiry (within 30 days' grace) starts on the day it is paid. All timings are in `product_countries.settings.renewal`. | `npm run jobs:daily`, `RUN_SCHEDULER=true`, or Daily jobs → Run now |
| Saved cards | "Renew automatically" stores a gateway token, never the card number; used for renewals and for paying policy changes. | `policies.payment_token` |
| Accumulation (UW-11) | Total insured at one building across active policies is checked against `accumulationLimitPerSite` (AED 100 million placeholder). Phase 1 matches sites by normalised building/area/city; replace with geocoded site IDs. | Referral rules, Accumulation report |
| Reports | Quote funnel, premium written, referral ageing, broker hit ratio, commission by broker, accumulation by site, renewal retention, claims by cause; JSON or CSV. | Reports; `GET /api/reports/:name?from&to&format=csv` |

### Scheduling the daily jobs

Run once a day from one place only:

- **Cron (recommended with several API instances):** `0 2 * * * cd /app && npm run jobs:daily`
- **Single instance:** set `RUN_SCHEDULER=true` on the API.
- **On demand:** operations → Daily jobs → Run now.

Each step is idempotent, so a second run on the same day changes nothing.

## Admin module (Release 4.0)

Open **Admin** in the header (privilege `admin.access`). Sections appear according to the user's privileges.

| Section | What it controls |
| --- | --- |
| Users | Staff and broker accounts, role, broker firm, activate / deactivate, reset password (temporary password, changed at first sign-in). New active staff count against licence seats. Customers register themselves. |
| Roles and privileges | Built-in roles plus custom roles based on one of them; tick the privileges each role has (24 privileges across admin, quotes, underwriting, rating, finance, reports, engineering, B2B, claims). |
| Drop-down values | Every option list in every product (31 lists, e.g. construction classes, packing, trades, project types) plus global lists such as document types; labels in English and Arabic, order, active, parent for cascading lists. Product screens read these immediately. |
| System parameters | Insurer name, support contacts, sign-in session, one-time-code validity and limits, SMTP, SMS, document upload limits, licence warning. Secrets are masked. |
| Number formats | Patterns for quotes, renewal quotes, policies, claims, endorsements, invoices and certificates, by product, country and channel. Tokens `{COUNTRY} {LINE} {CHANNEL} {PRODUCT} {YYYY} {YY} {MM} {POLICY} {SEQ:n}`; each prefix has its own gap-free counter. |
| Email and SMS templates | 48 templates (English and Arabic) with `{{placeholders}}`; emails are wrapped in the insurer layout; send a test email. |
| Notification rules | For each event (quote saved, referral created / decided, policy issued, claim registered, renewal ready / reminder, auto-renewal failed, invoice due, declaration due, payment failed, survey completed, open-cover turnover): channel, recipient (customer, broker, underwriters, operations, custom addresses), template, on/off. In-app notifications appear under the bell. |
| Sent messages | Outbox of every email, SMS and in-app message with status (sent, logged, failed). |
| Commission schemes / payouts | Rates by broker or tier, product, country, transaction type and dates; the most specific scheme applies at issue. Finance marks commission paid with a payout reference. |
| Licence | Platform licence for the insurer tenant: licensed modules (FIRE, MARINE, WC, ENGINEERING, B2C, B2B, REPORTS, API), user seats, validity and grace. Install a new signed key here; issue keys with `node scripts/issue-licence.js` (same `LICENCE_SECRET`). Without an active licence or module, new quotes and binding stop; servicing and claims continue. |
| Field properties | Label, tooltip, placeholder, type, drop-down list, visible, mandatory, read-only, limits, pattern, default and help link per screen and field. 103 fields on 15 screens are defined (67 with English/Arabic tooltips). Leave a label empty to keep the built-in translated label. Core fields (customer name, licence, signatory, email, mobile, start date, sign-in) cannot be hidden or made optional. Mandatory and pattern rules on the customer-details screen are also enforced by the API. |
| Help manual | Articles in English and Arabic by audience; the **Help** link in the header opens the manual. |
| Audit log | Every configuration change, sign-in and transaction. |

**Email:** set `email.smtp.enabled`, host, port, user and password in System parameters (host `json` tests without a server). Until SMTP is enabled, messages are recorded in the outbox only.

### Rule engine and rating engine (Release 4.3)

**Expression language** (used by both engines; `api/src/lib/expr.js`): numbers, text, lists, objects; null-safe access (`risk.locations[0].sumsInsured.STK`); `+ - * / %`, `== != < <= > >= in`, `&& || ?? !`, `cond ? a : b`; functions `min max round floor ceil abs num pos str len includes has keys values coalesce lookup band sumValues siteKey today addDays addMonths annualExpiry daysBetween monthsBetween year merge` and per-item collection functions `sum count any all map filter find max_of min_of product` (with `item` and `index`). It is interpreted, not executed: no access to code, globals or prototypes, and bounded in effort.

**Rule engine** (Admin → Rule sets): per product and purpose (underwriting, eligibility, validation, pricing), versioned. A set holds
- rules: condition (expression like `maxLocationSI > 2000000 && hazard == 'high'`, or the earlier JSON form) → action `refer`, `decline` (not quotable online), `message` or `set` (a value later rules can use); priority and stop;
- decision tables: input expressions and rows of cells (`-` any, `> 5000000`, `in ['a','b']`, `'light'`), hit policy first or collect;
- test cases: facts and expected referrals / declines / values.

Drafts are edited and tried on the test bench; submission requires every test case to pass; a different person approves, which publishes the version and supersedes the previous one. All products' referral rules were migrated into published sets (version 1). Quotes, open-cover certificates and annual CAR projects are evaluated by the engine.

**Rating engine** (Admin → Rating models): a rating model is data — ordered steps (`set` a variable, `each` over a collection with nested steps and `collect`, `error` for validation, `checkpoint`, `return` to finish early, `fail`) and output fields. Drafts are validated (every expression must parse), priced side by side with the live model on the test bench, submitted and approved by a different person. Publishing a model switches its product to the dynamic engine.

**All four products are priced by published models** (`api/src/products/models/fire.js`, `marine.js`, `wc.js`, `engineering.js`). Parity tests over thousands of random risks prove each model matches the coded rater exactly, including validation errors and not-quotable reasons. The coded raters remain in the repository only as the reference for these tests.

Models can have several **entries** (Marine: `rate`, `shipment`, `openCover`, `certificate`; Engineering: `rate`, `equipment`, `project` — also used for projects declared under an annual CAR policy — and `annual`), joined with `{ "call": "entry", "when": "..." }` steps, and can ask for **lookups before rating** (`prepare`: `vessel`, `natcatZone`, `permitVerified`). Each quote records the model version that priced it (visible to staff).

**Approval of product configuration:** set the system parameter `products.requireApproval` to true and every change to lines of business, products, covers, deductibles, discounts / loadings, charges and taxes waits in Admin → Pending changes (before / after shown) until a different person with `engines.approve` approves it; rejected changes are never applied.

**Deductibles:** Marine deductibles (per commodity group: percent of sum insured with a minimum) and Engineering project deductibles (`CAR.natcat`, `EAR.testing`, …) are now in Admin → Deductibles and override the rate tables, alongside Fire's deductible options.

### Product configuration (Release 4.2)
Admin → **Products** shows each product's line of business, countries and channels, covers, deductibles, discounts / loadings, charges, taxes, rate tables and referral rules, with links to edit each.

| Section | What it holds | How pricing uses it |
| --- | --- | --- |
| Lines of business | Code, names, order | Products belong to a line; new lines (e.g. Motor) get their own licence module code |
| Products | Names, descriptions, status, effective dates, line | Status and dates control availability |
| Covers | Basic perils, clauses and optional covers per product, with names, descriptions, pricing (`{"method":"loading","pct":0.1}`, `rate_on_total`, `per_head`, `fixed`, `referral_only`…), screen attributes and the referral flag | Pricing overrides the rate-table entry; inactive covers disappear from screens and cannot be quoted; names appear on screens and documents |
| Deductibles | Options with type (fixed, % of claim, % of sum insured, greater of, days), amounts, default and premium factor | The factor applies to the premium for that choice (Fire) |
| Discounts and loadings | Percent, condition on any risk field or rating fact (e.g. `{"fact":"claims3y","op":"eq","value":0}`), channels, priority, whether it combines, dates | Applied automatically after rating, in priority order; discounts never go below the minimum premium |
| Charges and fees | Fixed or % of premium with minimum / maximum, taxable, refundable, transactions, condition | Replace the rating fee; listed on the price and invoice |
| Taxes | Rate by country and product, on fees or not, condition, priority, dates | One rate per tax code: product-specific first, then priority; e.g. Marine exports zero-rated |

Every value was seeded from the existing configuration, and the 73 earlier tests still pass, which proves prices are unchanged. Open-cover certificates still use their agreed rates and VAT rule inside the Marine module; Marine and Engineering deductibles still live in their rate tables until stage 4.

### Field properties on screens (Release 4.1)
Every form field and option group reads its properties from Admin through its screen name and field id:

| Screen | Where |
| --- | --- |
| `fire.premise`, `fire.business`, `fire.cover`, `fire.quote` | Fire journey steps |
| `marine.type`, `marine.shipment`, `marine.value`, `marine.quote`, `marine.opencover`, `marine.certificate` | Marine journey, open-cover set-up and certificates |
| `wc.workforce`, `wc.plan` | Workmen's Compensation journey |
| `engineering.type`, `engineering.items`, `engineering.project`, `engineering.annual`, `engineering.cover` | Engineering journey |
| `common.details`, `common.payment` | Customer details and payment (all products) |
| `policy.servicing`, `auth.login` | Policy page (claims, contact changes, cancellation) and sign-in |

Repeated rows (locations, items) share one definition (`building0`, `building1` → `building`). Tooltips show on hover, keyboard focus or tap; a help link opens the manual article.

### Document upload (Release 4.5)
Documents attach to quotes (and their referrals), policies, claims and risk surveys. Each upload is checked for size (`documents.maxSizeMb`) and type (`documents.allowedTypes`); the real type is read from the file's content, not its name, and every file passes a virus-scan hook (mock: the standard EICAR test file is refused — replace with ClamAV or a cloud scanner). Files are stored under server-generated keys (`DOCUMENT_DIR`, local disk; implement `lib/storage.js` for S3-compatible storage) with a SHA-256 hash, and downloaded with `nosniff` and no caching.

**Required documents** (Admin → Document requirements) by product and event (claim, referral, policy, survey), mandatory or optional, with an optional condition (e.g. a police report only when the claim cause is theft). The checklist shows what is received and checked. Staff with `documents.review` verify or reject; the uploader can remove a document until it is reviewed. Operations get an in-app notification for each customer or broker upload (Notification rules → `document.uploaded`).

Where: the customer's referral box (all products), each claim on the policy page, the underwriter's referral page and each risk survey.

### Dashboards (Release 4.5)
- **Customer** (My policies): active policies, total sum insured, premium paid this year, open claims, renewals due in 60 days, quotes with an underwriter; premium by product, payments by month (12 months), upcoming renewals.
- **Broker** (broker home): premium written this year, policies, hit ratio (90 days), commission earned and paid, open referrals, renewals due; premium by month, product mix, quote-to-policy funnel, commission earned vs paid by month, referrals by status, top clients, renewals list.

Charts are plain SVG (no chart library), follow the light/dark theme, and include a screen-reader table. Figures are limited to the signed-in customer's or broker's own business.

### Dependencies
`nodemailer` is pinned at 10.0.16 (fixes a high-severity advisory in 6.x; chosen as the newest release at least two weeks old) and `multer` is 2.4.0; `npm audit --omit=dev` reports no vulnerabilities.

## Release 3.1 – features completed

| Product | Feature | Where |
| --- | --- | --- |
| All | Renewals keep last year's underwriter terms (loading, warranty) when the same referral rules fire and there were no claims; otherwise the renewal goes back to the underwriter with the history. | Daily jobs |
| All | Invoices for changes billed monthly or quarterly, paid online. | Policy page → Invoices; `POST /api/policies/:id/invoices/:id/pay` |
| WC | Joiner / leaver premium billed `per_change`, `monthly` or `quarterly` (`employeeBilling`, quarterly by default). | Settings, daily jobs |
| WC | Sick-leave tracker: periods per claim, wages payable under the statutory steps (full wage 6 months, then half). | Policy page → Claims; `POST /api/claims/:id/sick-leave` |
| WC | Declaration reminders after expiry; a declaration more than 60 days overdue blocks new WC cover until made. | Daily jobs, bind |
| Marine | Open-cover team: the holder adds staff with their own certificate limit (above it the certificate refers, UW-M14) and premium visibility. | Account → My team; `/api/customers/users` |
| Marine | API keys for ERPs / forwarders to issue certificates (`x-api-key`), limited to certificate endpoints of one cover, optional limit, revocable. | Open cover dashboard; `/api/open-covers/:id/api-keys` |
| Marine | UN/LOCODE port picker (subset; extend the `ports` table). | Shipment form |
| Marine | Open-cover renewal 60 days before expiry with next year's turnover annualised from actual certificates. | Daily jobs |
| Engineering | Large project changes (extension over 25% or after a claim, contract value above limit, hot testing beyond agreement) go to the underwriter; once approved (with loading) the customer accepts and pays. | Project panel, underwriting queue |
| Engineering | EAR testing-start declaration and partial handovers. | Project panel; `/api/engineering/:id/project/testing-start`, `/handover` |
| Engineering | Building-permit check (mock adapter; unverified permits refer, UW-E11). | Integrations |
| Engineering | Risk-engineer surveys: requested from a referral, scheduled, completed with grade, findings and recommendations shown to the underwriter. | Underwriting referral page; Surveys (risk engineer) |
| Engineering | Annual CAR for contractors: broker-only; preferred brokers bind within AED 10m per project; projects declared online at agreed rates, outside terms refer (UW-E13). | Engineering → All my building projects; policy page |

## Workmen's Compensation & Employer's Liability

| Area | How it works |
| --- | --- |
| Plans | Essential (Section A statutory), Standard (+ Employer's Liability, AED 1m default), Complete (+ liability AED 2m and treatment AED 50,000 per injured employee). The plan step prices all three side by side (`POST /api/quotes/:id/price`). |
| Workforce | Unnamed: headcount and average basic / total wage per job type. Named: employee list (CSV paste or upload; IDs masked on documents). |
| Pricing | Section A = annual wages × job-type rate × trade factor × claims factor; B = A × liability loading; C = headcount × medical charge; extensions; × short-period factor (1, 3, 6, 12 months). |
| Statutory | UAE schedule held as configuration (`statutory` rate table): 24 months' basic wage on death / permanent total disability within AED 18,000–200,000; full then half wage during treatment; MoHRE within 48 hours. Shown to the customer with an example from their own wages, and on the certificate. KSA is configured with Section A off (GOSI) and disabled. |
| Referrals | UW-W01 workforce above authority, W02 hazardous trade, W03 fatal or repeated claims, W04 occupational disease / contractors, W05 implausible wages, W06 liability limit above authority, W07 back-dated joiners, W08 discount, W09 sanctions. |
| Mid-term | Named: joiners and leavers; unnamed: headcount; priced pro rata, paid before they apply, referred when a rule fires (`type: workforce`). |
| Wage declaration | After expiry the employer or broker declares actual wages (`/api/wc/:id/declaration`); premium is recalculated; extra is paid, a return is refunded down to 75% of the deposit. |
| Documents | Schedule, certificate (with legal duties), employee annex (named), tax invoice. |

## Engineering

| Product | Risk | Pricing |
| --- | --- | --- |
| CPM | Item list (type, make, model, year, serial, ownership, value); one site, named sites or country floater | Value × type rate × age (over 10 years refers) × territory × claims |
| MB, EEI | Machinery or electronics list; EEI data restoration and extra cost of working | Value × type rate × age; medical imaging and transformers over 5 MW refer |
| CAR, EAR | Project type, parties, permit, contract value, dates, maintenance, construction method; EAR testing | (Contract value + owner materials) × annual rate × months ÷ 12 × complexity × nat-cat zone (+ EAR hot testing / second-hand loadings), plus third-party liability, maintenance and add-ons |

**Instant issue** within the BRD thresholds (contract value AED 10m CAR / 5m EAR, 24 months, complexity 1–2, at most one basement, 6 m excavation, no dewatering, blasting, piling near buildings or work over water, not a high flood zone; equipment AED 2m per item and 10m total); otherwise referral (UW-E01 to E10).

**Project lifecycle** (policy page and `/api/engineering/:id/project/...`): period extension at the original monthly rate within 25% of the period and with no claims; contract value changes pro rata for the time left; completion with final value (minimum retained 80%) starts the maintenance period. Projects are not auto-renewed.

**Try it:**
11. **WC:** Home → Workmen's Compensation → Furniture trading → by headcount → office 4 × 8,000, sales 6 × 6,000, drivers 5 × 3,500, helpers 15 × 2,000 → compare plans → buy. To test the declaration, set the policy's `expiry_date` to yesterday and open it.
12. **Engineering:** Home → Engineering → A building project → low-rise, AED 6.4m, 14 months, TPL AED 2m with surrounding property AED 1m and cross liability → AED 15,928 → buy → request a 3-month extension (AED 2,400). Or → My construction equipment → add items → floater.

## Marine Cargo

| Product | Who | How it works |
| --- | --- | --- |
| Single transit (import / export) | Customers and brokers | Goods, packing, mode, route, sailing date, Incoterm, vessel; invoice value in any listed currency; sum insured = (invoice + freight if FOB/FCA/EXW) × (1 + uplift) + duty, converted to AED; ICC A / B / C or ICC Air with War and Strikes; LC bank, number and wording printed on the certificate. Instant issue within limits; referral otherwise. Cover runs from the sailing date for 90 days (configurable). |
| Inland transit | Customers and brokers | Road or rail within the country, ITC A / B; no war cover. |
| Annual open cover | Set up by brokers; preferred brokers bind within AED 25 million turnover, others go to an underwriter (UW-M10). Customers are directed to a broker. | Commodity schedule with shares and clauses, regions, turnover estimate, limit per sending, war and strikes, premium per certificate or deposit with monthly declarations, who may issue certificates. Agreed rates are fixed at binding and used for every certificate. |

**Open cover dashboard** (`/en/open-covers/:id`): turnover used against the estimate (alerts at 80% and 100%), issue a certificate with a price check, bulk CSV upload (up to 500 rows: issued, referred or error per row, with a downloadable template), certificate documents, cancellation before sailing, claims against a certificate, monthly declarations (including shipments not issued in the portal), and the deposit adjustment from 30 days before expiry (additional premium, or a return down to 80% of the deposit).

**Marine referral rules:** UW-M01 above limit, M02 referral goods, M03 high-risk or war-listed route, M04 vessel over 25 years / unclassed / not found, M05 all-risks on bulk or unpacked goods, M06 sailing within 24 hours, M07 sanctions, M08 discount above band, M09 referral extension, M10 open cover approval, M11 outside cover terms, M12 above limit per sending, M13 turnover used up.

**Marine configuration** (`rate_tables` for MARINE / AE): `commodities` (rates per clause, group, referral, prohibited), `countries` (region, war-listed, declined), `factors` (mode, region, packing, container, vessel age, war, SRCC), `extensions`, `deductibles`, `fx`, `charges`. `product_countries.settings` holds limits, authority, numbering (MST / MIT / MOC), VAT by direction (exports zero-rated as a placeholder; Compliance to confirm) and deposit rules.

**Try it:**
9. **Single shipment:** Home → Marine Cargo → One shipment → electrical appliances, sea, Shanghai to Jebel Ali, FOB, vessel "MSC AURORA" → USD 85,000 plus USD 3,200 freight → ICC A with war and strikes → sign in → pay. Open the certificate (add `&copy=duplicate` for the LC duplicate). Try vessel "OLD STAR" or origin Sudan to see referrals.
10. **Open cover:** sign in as `agent@emiratespremier.test` (preferred) → Marine quote → All my shipments → build the schedule → bind. Open the cover from the broker dashboard, issue a certificate, then upload the CSV template with a few rows. As `sara@gulfshield.test` (standard) the same cover goes to the underwriter first.

Marine API: `POST /api/quotes` with `productCode: MARINE`; open covers under `/api/open-covers/:id` (`certificates`, `certificates/preview`, `certificates/bulk`, `certificates/:certId/cancel`, `certificates/:certId/document`, `declarations`, `adjustment`).

## How it is built

```
api/src
  config.js, app.js, server.js
  db/migrations       core schema shared by all product lines
  db/seeds            countries, Fire product config (EN/AR), UAE rate tables, referral rules, demo users
  lib/                money rounding, dates, rule engine, numbering, audit, catalog loader, access checks
  products/fire/      rater.js (Fire BRD section 8) and risk schema
  products/marine/    rater.js (shipments, open cover, certificates) and schemas
  products/wc/        rater.js (plans, sections, short periods) and schema
  products/engineering/ rater.js (equipment and projects) and schema
  products/index.js   rater registry (add marine, wc, engineering here)
  integrations/       payments, sanctions, notifications, geo, licence lookup (mock providers)
  modules/            auth, reference, quotes, policies, documents, claims, uw, broker, admin, reports, jobs, opencover, wc, engineering
api/scripts/daily-jobs.js   cron entry point for renewals and expiry
web
  app/[locale]/       every page under /en or /ar
  components/fire/    the 6-step Fire journey
  lib/i18n/           en.js and ar.js (keys must match)
```

### Configuration, not code

Product behaviour lives in the database, as the BRDs require:

| Table | Holds |
| --- | --- |
| `products.config` | Questions, asset groups, perils, exclusions, extensions, deductibles, claim causes, all in EN/AR |
| `product_countries.settings` | Tier limits, channel and broker authority, numbering, quote validity, short-period scale, SLA hours |
| `rate_tables` | Versioned rate data (occupancies, factors, extensions, charges) with draft → pending → approved by a second person |
| `referral_rules` | Referral conditions as JSON (`{ fact, op, value }`, `all`, `any`), with EN/AR reasons |
| `countries` | Currency and decimals, VAT, regulator, Takaful/conventional, free-look days |

Switching on Oman, for example, means approved OMR rate tables plus `enabled_b2c/enabled_b2b` on its `product_countries` row; prices round to 3 decimals automatically.

### Adding another product or country

1. Add a rater in `api/src/products/<line>/rater.js` returning `{ valid, quotable, sumInsured, tier, breakdown, facts }` like the Fire rater, plus a Zod risk schema; register both.
2. Seed the product (`products`, `product_countries`, `rate_tables`, `referral_rules`) with its EN/AR config.
3. Add the journey under `web/app/[locale]/<line>` and its steps under `web/components/<line>`. Shared pieces (sign-in, details, payment, referral thread, price panel, documents, claims, broker and underwriter screens) are reused.
4. Line-specific features from the BRDs: employee lists and wage declarations (WC), project lifecycle and equipment schedules (Engineering). Marine shows the pattern: a rater with a `prepare` hook for async lookups (vessel register), product-specific documents, and its own module for open covers.

## Replace before go-live

| Area | Phase 1 | Production |
| --- | --- | --- |
| Payments | Mock gateway | Card gateway with 3-D Secure; local schemes per country |
| Sanctions | Name match on "sanction" | Screening provider |
| SMS / email | Logged to console | SMS, email and WhatsApp provider |
| Nat-cat zone | Keyword guess from address | Map pin + hazard data |
| Vessel register | Mock: names with "OLD" are 1995-built, "UNCLASSED" not IACS, "UNKNOWN" not found | Vessel database by IMO number |
| FX rates (marine) | Static `fx` rate table | Daily FX feed writing the table |
| Claims agents / surveyors | Placeholder on certificates | Agent network by destination port |
| Trade licence | Format check | Government licence lookup where available |
| Documents | Bilingual print-ready HTML with QR | Add a PDF service (e.g. headless Chrome) to print the same templates |
| Staff sign-in | Email + password | Identity provider with MFA (BRD NFR) |
| Rates and limits | BRD placeholders | Values from underwriting and actuarial |
| Arabic copy | Draft | Review by a native-speaking insurance translator |

Also before any shared environment: set a long random `JWT_SECRET`, run with `NODE_ENV=production` behind HTTPS, add API rate limiting at the gateway, and keep personal data hosting in line with UAE PDPL.

## Known limits

- **Document storage** is local disk with a mock virus scanner; production needs an object store (S3-compatible), a real scanner and retention rules.
- **Dashboards** read live tables; at volume, point them at the reporting replica.
- **External services are mocks:** payments, sanctions, SMS/email/WhatsApp, geocoding, trade-licence, permit and vessel lookups, FX feed.
- **Documents** are bilingual print-ready HTML; add a PDF service to produce PDFs from the same templates.
- **Staff sign-in** uses email and password; connect an identity provider with MFA before go-live.
- **Accumulation** matches sites by address text; production needs geocoded site IDs.
- **Reports** read live tables; point them at a reporting replica at volume.
- **Not built:** CPM cross-border GCC floater, Marine sales-turnover and stock-throughput policies (out of BRD scope), KSA activation (configured, switched off).
- Arabic copy needs review by a native-speaking insurance translator; all rates, limits and statutory values are placeholders.
