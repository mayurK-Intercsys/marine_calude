# 57. Document Requirements

---

## 1. Overview
The **Document Requirements** module (`/admin/documentRequirements`) manages the operational evidence checklists required from policyholders and brokers during quote referrals, policy issuance, claim registrations, and engineering risk surveys. It establishes which document types are needed per product and event, whether each upload is mandatory or optional, conditional trigger rules (e.g. Police Report required only when claim cause is `theft`), and localized upload guidelines.

---

## 2. Who Can Access
- **Required Permission**: `admin.products`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)
- *Document Review Authority*: Users with `documents.review` (underwriters, operations, claims staff, risk engineers) review, verify, or reject documents uploaded against these requirements.

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Document requirements" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: event` (`claim`, `referral`, `policy`, `survey`).
- **Search Bar**: Substring search across product code, document type, and notes.
- **Table Columns**:
  1. `When` (`event`): Event classification (`claim`, `referral`, `policy`, `survey`).
  2. `Document type`: Type code from master document types (e.g. `civil_defence`, `police_report`, `medical_report`).
  3. `Product`: Associated product code (blank = global).
  4. `Note (English)`: Guidance note rendered in the uploader's checklist.
  5. `Mandatory`: Mandatory flag checkmark (`mandatory`).
  6. `Order`: Display sort index (`sort`).
  7. `Active`: Status checkmark (`✓` or `✗`).
  8. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Product** (`product_code`): Select dropdown from `products` (blank = all products).
- **When** (`event`): Select dropdown (`claim`, `referral`, `policy`, `survey`).
- **Document type** (`doc_type`): Select dropdown dynamically populated from `GLOBAL.documentTypes`.
- **Note (English)**: Text input explaining acceptable document formats.
- **Note (Arabic)**: Text input explaining acceptable formats in Arabic.
- **Only when** (`condition`): JSON rule condition or expression for selective requirement. Hint: `{"fact":"cause","op":"in","value":["theft"]} or an expression`.
- **Mandatory**: Checkbox toggle.
- **Order**: Integer sort index.
- **Active**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique requirement record ID | `6` |
| `product_code` | Select (FK) | No | Valid product or blank | Scopes requirement to one product | `FIRE` |
| `event` | Select | Yes | `claim`, `referral`, `policy`, `survey` | Lifecycle event triggering checklist | `claim` |
| `doc_type` | Select (FK) | Yes | Valid code in `GLOBAL.documentTypes` | Master document category | `photo` |
| `note_en` | String | No | Text | Customer instructions in English | `Photos of the damage before any clean-up` |
| `note_ar` | String | No | Text | Customer instructions in Arabic | `صور الأضرار قبل أي تنظيف` |
| `condition` | JSON | No | Valid rule condition or expression | Evaluated to show requirement dynamically | `{"fact":"cause","op":"in","value":["theft"]}` |
| `mandatory` | Boolean | Yes | `true`, `false` | If true, blocks submission until uploaded | `true` |
| `sort` | Integer | No | Integer | Display sequence in checklist | `1` |
| `active` | Boolean | Yes | `true`, `false` | Enables requirement | `true` |

---

## 5. Standard Document Checklists by Event

### A. Underwriting Referral Checklists (`event = 'referral'`)
- `FIRE`: Civil Defence Certificate (`civil_defence`) — conditioned on `noCivilDefence == true`.
- `ENG`: Building or installation permit (`permit`) — conditioned on `permitUnverified == true`.
- Global: Trade Licence copy (`trade_licence`) — optional supporting document.

### B. Loss Claim Checklists (`event = 'claim'`)
- `FIRE`:
  - Damage photos (`photo`) — mandatory.
  - Invoices or valuations (`invoice`) — mandatory.
  - Civil Defence or Police report (`other`) — conditional on `cause in ['fire', 'theft', 'malicious']`.
- `MARINE`:
  - Bill of Lading or Air Waybill (`bill_of_lading`) — mandatory.
  - Commercial Invoice and Packing List (`invoice`) — mandatory.
  - Damage photos (`photo`) — mandatory.
  - Independent Survey report (`survey_report`) — optional.
- `WC`:
  - Treating hospital medical report (`medical_report`) — mandatory.
  - Employee's Emirates ID copy (`emirates_id`) — mandatory.
  - Ministry (MoHRE) work-injury report (`other`) — mandatory.
- `ENG`:
  - Damage photos before repair (`photo`) — mandatory.
  - Site incident report (`other`) — mandatory.

---

## 6. Step-by-Step: Adding a Conditional Claim Document Requirement
1. Navigate to **Admin** -> **Document requirements** (`/admin/documentRequirements`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Product**: Select `MOTOR`.
   - **When**: Select `claim`.
   - **Document type**: Select `police_report`.
   - **Note (English)**: `Official Police Accident Report with vehicle inspection sketch`.
   - **Note (Arabic)**: `تقرير الشرطة الرسمي للحادث مع مخطط فحص المركبة`.
   - **Only when**: `{"fact": "cause", "op": "in", "value": ["collision", "hit_and_run", "theft"]}`.
   - **Mandatory**: Checked (`true`).
   - **Order**: `1`.
   - **Active**: Checked.
4. *[Screenshot Placeholder: Add Document Requirement Modal for Motor Police Report]*
5. Click **Save** (`admin.save`).
6. If `products.requireApproval` is enabled, the change routes to **Pending changes**; otherwise it is immediately active on customer claim forms.

---

## 7. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify notes, mandatory status, or condition logic.
- **Deactivate**: Uncheck **Active** to suspend the requirement from future checklists.
- **Delete**: Click **Delete** and confirm prompt.

---

## 8. Approval Flow
- **Approval Flag**: `approval: true`.
- When `products.requireApproval` is enabled, mutations route to `config_changes` with status `pending`.
- A checker with `engines.approve` must approve in `/admin/changes` before checklists update.

---

## 9. Dependencies
- **Prerequisites (What must exist BEFORE)**:
  - Document types registered in `/admin/lookupValues` under `list_code = 'GLOBAL.documentTypes'`.
  - Product in `products`.
- **Downstream Consumers (What uses this AFTER)**:
  - Document upload component renders dynamic checklist on referral review, policy dashboard, and claim filing screens.
  - Review drawer allows staff with `documents.review` to inspect, verify, or reject each upload.

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Document type missing in dropdown | Type code not added to `GLOBAL.documentTypes`. | Open `/admin/lookupValues`, filter by `GLOBAL.documentTypes`, and add the new document code. |
| Requirement shows when it should be hidden | Condition JSON syntax incorrect or evaluates true. | Verify condition logic (e.g. `{"fact":"cause","op":"eq","value":"theft"}`). |
| Customer cannot submit claim | Mandatory document checklist incomplete. | Ensure required documents are uploaded or mark `mandatory = false` for non-critical proofs. |

---

## 11. Sample Configuration: Survey Soil Report
- **Product**: `ENG`
- **When**: `survey`
- **Document Type**: `survey_report`
- **Note (English)**: `Geotechnical soil investigation report for deep excavation works`
- **Note (Arabic)**: `تقرير فحص التربة الجيوتقني لأعمال الحفر العميق`
- **Condition**: `{"fact": "excavationDepth", "op": "gt", "value": 5}`
- **Mandatory**: `true`
- **Active**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="documentRequirements"`.
- **API Endpoints**:
  - `GET /api/platform/entities/documentRequirements?filter={event}`
  - `POST /api/platform/entities/documentRequirements`
  - `PUT /api/platform/entities/documentRequirements/:id`
  - `DELETE /api/platform/entities/documentRequirements/:id`
  - Journey Checklist Endpoint: `GET /api/documents/checklist?product={code}&event={event}`
- **Database Table**: `document_requirements`
- **Order Index**: `['event', 'sort']`
