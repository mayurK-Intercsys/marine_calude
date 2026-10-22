# 70. Help Manual

---

## 1. Overview
The **Help Manual** module (`/admin/helpArticles`) manages the platform's knowledge base and customer guidance articles. Administrators author bilingual English and Arabic markdown guides organized by category and audience (`customer`, `broker`, `staff`). These articles appear in the public help center (`/help`) and are hyperlinked directly from UI journey form fields via their `help_slug` attribute.

---

## 2. Who Can Access
- **Required Permission**: `admin.help`
- **Default Assigned Roles**:
  - `config_admin` (Configuration Administrator)

---

## 3. Screen Walkthrough

### Master Table & Management Controls
Rendered via the `EntityManager` component:
- **Header**: "Help manual" with **Add** button (`admin.add`).
- **Filter Bar**: `Filter: category` (e.g. `buying`, `claims`, `portal`, `admin`).
- **Search Bar**: Substring search across slug, category, English title, and Arabic title.
- **Table Columns**:
  1. `Slug`: Unique URL path slug (e.g. `trade-licence-guide`, `marine-open-covers`).
  2. `Category`: Organizational category group.
  3. `Title (English)`: English article title.
  4. `Audience`: Target personas (`["customer","broker"]`).
  5. `Order`: Integer sort index (`sort`).
  6. `Published`: Publication flag (`✓` or `✗`).
  7. `Actions`: **Edit** and **Delete**.

### Creation / Edit Modal
- **Slug**: URL identifier string (e.g. `fire-protection-guide`).
- **Category**: Section grouping (e.g. `property`).
- **Title (English)**: Required article headline.
- **Title (Arabic)**: Required Arabic article headline.
- **Body (English, Markdown)**: Rich markdown textarea with headers, lists, and tables.
- **Body (Arabic, Markdown)**: Rich Arabic markdown textarea.
- **Audience**: JSON array of target personas (e.g. `["customer", "broker", "staff"]`).
- **Order**: Integer sort index.
- **Published**: Checkbox toggle.

---

## 4. Field Reference Table

| Field | Type | Required | Allowed Values / Validation | Description | Example |
|---|---|---|---|---|---|
| `id` | Integer (PK) | Auto | Positive integer | Unique article record ID | `7` |
| `slug` | String | Yes | Unique kebab-case string | URL identifier (`/help/:slug`) | `trade-licence-guide` |
| `category` | String | Yes | Lowercase string | Help center grouping | `buying` |
| `title_en` | String | Yes | 2–200 characters | English article title | `Guide to Trade Licences` |
| `title_ar` | String | Yes | 2–200 characters | Arabic article title | `دليل الرخص التجارية` |
| `body_en` | Textarea | Yes | Markdown formatted text | Full English article body | `### Trade Licence Requirements...` |
| `body_ar` | Textarea | Yes | Markdown formatted text | Full Arabic article body | `### متطلبات الرخصة التجارية...` |
| `audience` | JSON | No | `["customer", "broker", "staff"]` | Target user personas | `["customer", "broker"]` |
| `sort` | Integer | No | Integer | Display sequence | `10` |
| `published` | Boolean | Yes | `true`, `false` | Whether article is visible in help center | `true` |

---

## 5. Step-by-Step: Authoring a New Help Article
1. Navigate to **Admin** -> **Help manual** (`/admin/helpArticles`).
2. Click **Add** (`admin.add`).
3. In the modal:
   - **Slug**: `workmens-compensation-guide`
   - **Category**: `liability`
   - **Title (English)**: `Understanding Workmen’s Compensation & Employer’s Liability`
   - **Title (Arabic)**: `فهم تأمين تعويض العمال ومسؤولية أصحاب العمل`
   - **Body (English, Markdown)**:
     ```markdown
     # Workmen’s Compensation Guide
     Under UAE Federal Decree-Law No. 33 of 2021, employers are liable for work-related injuries and occupational diseases.
     
     ### What is Covered:
     - Statutory death and permanent disability benefits
     - Medical treatment expenses up to AED 100,000
     - Temporary disability wages (6 months full wage, 6 months half wage)
     ```
   - **Body (Arabic, Markdown)**:
     ```markdown
     # دليل تعويض العمال
     بموجب المرسوم بقانون اتحادي رقم 33 لسنة 2021، يتحمل أصحاب العمل مسؤولية إصابات العمل والأمراض المهنية.
     ```
   - **Audience**: `["customer", "broker"]`
   - **Order**: `5`
   - **Published**: Checked (`true`).
4. *[Screenshot Placeholder: Add Help Article Modal with bilingual Markdown]*
5. Click **Save** (`admin.save`).
6. The article is instantly live at `/en/help/workmens-compensation-guide` and `/ar/help/workmens-compensation-guide`.

---

## 6. How to Edit / Deactivate / Delete
- **Edit**: Click **Edit** to modify markdown text or titles.
- **Unpublish**: Uncheck **Published** to hide the article from the public help centre without losing its markdown contents.
- **Delete**: Click **Delete** and confirm prompt.

---

## 7. Approval Flow
- Help articles apply immediately and do **not** enter the `Pending changes` approval queue.
- Updates are audited under `config.helpArticles.create`, `config.helpArticles.update`, and `config.helpArticles.delete`.

---

## 8. Dependencies
- **Downstream Consumers**:
  - The header **Help** link opens the user-facing knowledge base (`/help`).
  - Field Properties (`/admin/fieldDefinitions`) references `slug` in `help_slug` to open contextual help drawers directly from quote forms.

---

## 9. Business Rules & Validations
1. **Mandatory Bilingual Content**: English and Arabic titles and bodies are strictly required (`FIELD_REQUIRED`).
2. **Audience Filtering**: When a signed-in broker browses `/help`, articles tagged for `staff` only are excluded.

---

## 10. Common Errors & Troubleshooting

| Error Code / Symptom | Cause | Resolution |
|---|---|---|
| Article returns 404 in help center | `published` is set to `false`. | Open `/admin/helpArticles`, locate the article, check `Published`, and save. |
| Markdown formatting breaks | Unclosed code fences or malformed markdown tables. | Review markdown syntax in the body textarea. |

---

## 11. Sample Record
- **Slug**: `marine-claims-guide`
- **Category**: `claims`
- **Title (English)**: `How to File a Marine Cargo Claim`
- **Title (Arabic)**: `كيفية تقديم مطالبة تأمين البضائع البحرية`
- **Audience**: `["customer", "broker"]`
- **Published**: `true`

---

## 12. Technical Notes
- **Web Route**: `web/app/[locale]/admin/[entity]/page.js` with `name="helpArticles"`.
- **API Endpoints**:
  - `GET /api/platform/entities/helpArticles?filter={category}`
  - `POST /api/platform/entities/helpArticles`
  - `PUT /api/platform/entities/helpArticles/:id`
  - `DELETE /api/platform/entities/helpArticles/:id`
  - Client Public API: `GET /api/ref/help` and `GET /api/ref/help/:slug`
- **Database Table**: `help_articles`
- **Order Index**: `['sort']`
