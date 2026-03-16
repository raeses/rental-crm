# Estimate Module Backend (APITCHENKOV)

## Run
```bash
cd server
npm install
cp .env.example .env
# create DB and run SQL scripts
mysql -u root -p rental_crm < sql/schema.sql
mysql -u root -p rental_crm < sql/seed.sql
npm start
```

## Multi-project portal auth
Implemented business portal with independent auth contexts:

- `/` - project selection portal
- `/cinetools/login/` -> `/cinetools/dashboard/`
- `/apitchenkov/login/` -> `/apitchenkov/dashboard/`
- `/admin/login/` -> `/admin/dashboard/`

Sessions are isolated per project (`authByProject` in one cookie):
- login to `apitchenkov` does not grant `cinetools` access
- login to `cinetools` does not grant `apitchenkov` access

Default seeded users (change immediately in production):
- `apitchenkov`: `admin / Apitchenkov!2026`
- `cinetools`: `admin / CineTools!2026`
- `admin`: `portal-admin / AdminPortal!2026`

To generate password hash:

```bash
npm run auth:hash -- "NewStrongPassword"
```

Then put hash into `.env`:

```env
APITCHENKOV_ADMIN_PASSWORD_HASH=scrypt$...
CINETOOLS_ADMIN_PASSWORD_HASH=scrypt$...
PORTAL_ADMIN_PASSWORD_HASH=scrypt$...
```

## Existing DB Migration
If the server already has an older `rental` database with a legacy `items` table, apply the items migration instead of rerunning the full schema:

```bash
mysql rental < sql/migrations/20260314_items_mvp.sql
```

Then restart the backend process.

## UTF-8 and Cyrillic for PDF
PDF generation uses embedded DejaVu Sans fonts with Cyrillic support.
By default it looks for system paths:
- `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
- `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`

You can override paths:

```bash
PDF_FONT_REGULAR=/path/to/DejaVuSans.ttf
PDF_FONT_BOLD=/path/to/DejaVuSans-Bold.ttf
```

For legacy DBs, run UTF-8 migration once:

```bash
mysql rental < sql/migrations/20260316_utf8mb4_for_pdf_text.sql
```

## API examples

### Portal auth endpoints
- `GET /api/auth/projects` - list projects for portal cards
- `POST /api/auth/:project/login`
- `GET /api/auth/:project/session`
- `POST /api/auth/:project/logout`

Protected API zones:
- `/api/projects`, `/api/items`, `/api/estimates*` require `apitchenkov` login
- `/api/cinetools/*` require `cinetools` login
- `/api/admin/*` require `admin` login

### Admin users API
- `GET /api/admin/users?project=apitchenkov|cinetools`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`

Database migration for managed users table:

```bash
mysql rental < sql/migrations/20260316_auth_users_portal.sql
```

### Create project
`POST /api/projects`
```json
{
  "internal_number": "014",
  "name": "Kuznetsov",
  "client": "Kuznetsov Prod",
  "operator": "Alex Petrov",
  "start_date": "2026-03-14",
  "end_date": "2026-03-16",
  "status": "confirmed"
}
```

### Create estimate
`POST /api/estimates`
```json
{
  "project_id": 1,
  "estimate_number": "014/1",
  "title": "Main Equipment",
  "start_date": "2026-03-14",
  "end_date": "2026-03-16",
  "discount_percent": 10,
  "tax_enabled": true,
  "tax_percent": 9
}
```

### Add estimate item
`POST /api/estimates/:estimateId/items`
```json
{
  "category": "Camera",
  "item_name": "Red Komodo 6K",
  "quantity": 1,
  "price_per_unit": 3000,
  "days": 3,
  "position_order": 1,
  "source_type": "catalog",
  "catalog_item_id": 12,
  "notes": null
}
```

### Reorder rows
`POST /api/estimates/:id/reorder-items`
```json
{
  "ordered_ids": [11, 12, 15, 13]
}
```

### Get estimate response (example)
`GET /api/estimates/1`
```json
{
  "id": 1,
  "project_id": 1,
  "estimate_number": "014/1",
  "discount_percent": 10,
  "tax_enabled": 1,
  "tax_percent": 9,
  "subtotal": 35350,
  "discount_amount": 3535,
  "total_after_discount": 31815,
  "tax_amount": 2863.35,
  "grand_total": 34678.35,
  "items": [
    {
      "id": 1,
      "estimate_id": 1,
      "category": "Camera",
      "item_name": "Red Komodo 6K",
      "quantity": 1,
      "price_per_unit": 3000,
      "kit_total": 3000,
      "days": 3,
      "line_total": 9000,
      "position_order": 1
    }
  ]
}
```

### PDF
`GET /api/estimates/:id/pdf`

Returns client-facing PDF stream.

Use `GET /api/estimates/:id/pdf?download=1` to force file download
(`Content-Disposition: attachment`).

Smoke check with Russian test data:

```bash
npm run pdf:smoke:ru
```
