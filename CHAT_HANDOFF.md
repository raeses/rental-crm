# Rental CRM — Project Handoff Context (for continuing in another chat)

## 1) What this project is
Internal web CRM for a film equipment rental team (**APITCHENKOV**), not SaaS/public product.
Main current focus: **Estimate workflow** (projects → estimates → rows → totals → PDF).

---

## 2) Current repository structure
- Frontend (SPA):
  - `index.html`
  - `styles.css`
  - `app.js`
  - `analytics.js`
  - `estimates.js`
- Backend (Node/Express):
  - `server/` with controllers/routes/services/db/pdf/sql

---

## 3) Frontend status (already implemented)
### Navigation/pages
- Existing sections: dashboard, items, projects, clients, transactions, subrentals, analytics.
- Added section: **`Сметы` / Estimate Builder** page.

### Estimate Builder (`estimates.js`)
Implemented:
- project + estimate selectors
- estimate meta fields (number/title/date range)
- estimate table with columns:
  - Наименование
  - Кол-во
  - Тарифная оплата/ед.
  - Итого по комплекту
  - Кол-во смен
  - Итого, руб.
- row grouping by category
- add row / add from catalog / duplicate / delete / reorder up/down
- live recalculation in UI:
  - kit_total = quantity * price_per_unit
  - line_total = kit_total * days
  - subtotal, discount, tax, grand total
- save estimate to backend
- archive estimate
- preview/generate PDF (opens `/api/estimates/:id/pdf`)

### Existing legacy modal estimate logic
`app.js` still has prior project/estimate modal logic. It is functional but partially overlaps with the new `estimates.js` builder approach.

---

## 4) Backend status (already implemented)
### Stack
- Node.js + Express
- mysql2
- pdfkit

### API
Projects:
- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`

Estimates:
- `POST /api/estimates`
- `GET /api/estimates/:id`
- `PUT /api/estimates/:id`
- `POST /api/estimates/:id/archive`
- `GET /api/projects/:projectId/estimates`

Estimate items:
- `POST /api/estimates/:estimateId/items`
- `PUT /api/estimate-items/:id`
- `DELETE /api/estimate-items/:id`
- `POST /api/estimates/:id/reorder-items`

PDF:
- `GET /api/estimates/:id/pdf`

### Calculations (backend source of truth)
- item:
  - `kit_total = quantity * price_per_unit`
  - `line_total = kit_total * days`
- estimate:
  - `subtotal = SUM(line_total)`
  - `discount_amount = subtotal * discount_percent / 100`
  - `total_after_discount = subtotal - discount_amount`
  - if tax enabled:
    - `tax_amount = total_after_discount * tax_percent / 100`
    - `grand_total = total_after_discount + tax_amount`
  - else:
    - `tax_amount = 0`
    - `grand_total = total_after_discount`

### Validation
Implemented on backend:
- `item_name` required
- `category` required
- `quantity > 0`
- `price_per_unit >= 0`
- `days > 0`
- `discount_percent >= 0`
- `tax_percent >= 0`

---

## 5) Database status
Implemented SQL in `server/sql/schema.sql`:
- `projects`
- `estimates`
- `estimate_items`
- foreign keys + indexes

Seed data: `server/sql/seed.sql`

---

## 6) How to run
From repo root:
```bash
cd server
npm install
cp .env.example .env
# edit .env for real DB credentials
mysql -u root -p rental_crm < sql/schema.sql
mysql -u root -p rental_crm < sql/seed.sql
npm start
```

Health check:
```bash
curl http://127.0.0.1:4000/health
```

---

## 7) Deployment note (important)
Frontend calls API via relative path **`/api`**.
So production server (nginx/caddy) must proxy:
- `/api/*` -> Node backend (`127.0.0.1:4000` by default)
- `/` -> static frontend files

If proxy is missing, frontend opens but API fails.

---

## 8) Known gaps / technical debt
1. There are two estimate-related UX paths right now:
   - new dedicated builder (`estimates.js`)
   - older modal path in `app.js`
   Recommendation: consolidate into one main flow.
2. PDF style currently clean/minimal but still baseline; can be improved to stricter brand layout.
3. No automated tests yet (API + calc + PDF snapshots would be useful).
4. Add `.gitignore` policy for server runtime artifacts on deployment hosts.

---

## 9) Suggested next tasks (priority)
1. **Unify estimate flow** (single source of UI truth).
2. Add backend integration tests for estimate calculations and reorder behavior.
3. Improve PDF typography/layout and add optional notes/footer formatting.
4. Add migration/versioning approach for SQL updates.
5. Add process manager config (pm2/systemd) + deployment checklist.

---

## 10) Product rules to keep
- Treat equipment kits as **single final rental items** in estimates.
- Focus on estimate module quality first (not full ERP/kit decomposition).
- Keep internal tool UX pragmatic and fast for ops team.
