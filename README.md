# Project Grat — Intranet gratitude cards

Phase 0 scaffold + Phases 1–3: templates, Canva HTML import, **compose → mock/SMTP drafts**.

Providers are swap-ready:

| Mode env | Now | Later |
|----------|-----|--------|
| `AUTH_MODE` | `dev` | `azure` |
| `DIRECTORY_MODE` | `mock` | `graph` |
| `MAIL_MODE` | `mock` | `smtp` (Gmail), `graph` (Outlook drafts) |

### Gmail SMTP (`MAIL_MODE=smtp`)

Send real HTML email from Compose (good for testing Canva cards without Outlook paste):

1. In Google Account → Security → enable 2-Step Verification.
2. Create an **App Password**: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. In `api/.env`:

```env
MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=you@gmail.com
SMTP_FROM_NAME=Gratitude cards
PUBLIC_API_URL=https://your-public-api-host
```

4. Restart the API, open a card → **Compose** → pick recipients → **Send**.

Recipients get the full HTML MIME (usually closer to Canva than paste-into-compose). Embedded images must load from `PUBLIC_API_URL` (use ngrok locally if needed).

### Graph Outlook drafts (`MAIL_MODE=graph`)

Works with current **dev login** using an Azure AD **app registration** (client credentials):

1. Register an app in Entra ID → add **Application** permission `Mail.ReadWrite` → grant admin consent.
2. Create a client secret.
3. In `api/.env`:

```env
MAIL_MODE=graph
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
# Optional: put every draft in one shared mailbox
# GRAPH_MAILBOX_UPN=gratitude@yourtenant.com
```

4. Sign in with an email that exists as a mailbox in that tenant (or set `GRAPH_MAILBOX_UPN`).
5. Compose → drafts appear in that mailbox’s **Drafts** folder.

Delegated `/me` (user’s own Drafts without app mailbox rights) needs `AUTH_MODE=azure` + a user Graph token later; the mail provider already accepts an optional `accessToken` for that path.

## Prerequisites

- Node.js 20+
- PostgreSQL (you have pgAdmin 4)
- Create an empty database named `project_grat` in pgAdmin

## Setup

1. In pgAdmin: create database `project_grat`.

2. Edit `api/.env` — set your Postgres password:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/project_grat?schema=public"
```

3. Install & migrate:

```bash
npm install
cd api
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
cd ../web
npm install
cd ..
```

4. Run both apps:

```bash
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001/health  

## CI (GitHub Actions)

On every pull request and push to `main` or `staging`, GitHub runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- API: `prisma generate`, `prisma migrate deploy` (Postgres service), TypeScript check
- Web: oxlint, TypeScript check, production build

After pushing this repo to GitHub, enable **branch protection** on `main` / `staging` and require the **CI** check to pass before merge.

## What to try

1. Open the site → **Enter intranet** (dev login).
2. Open **Cards** → **New template** and pick a starter:
   - **Import from Canva** — Canva Email → Share → Download → **HTML and images** (ZIP). Selectable text in Outlook.
   - **Upload image** — PNG/JPEG/PDF fallback (looks correct; text not selectable).
3. On the card page, preview and **Copy for Outlook**.
4. Compose / Drafts are available when mail placement is enabled (see Graph / SMTP sections above).

## Canva HTML import

For selectable Outlook text when designing in Canva:

1. Create an **Email** design in Canva (prefer text boxes, not one flattened image).
2. **Share → Download → HTML and images** (ZIP).
3. In Grat: **New template → Import from Canva** and upload the ZIP.
4. Grat builds a **PNG snapshot** for **Copy for Outlook** (pixel-perfect paste).
5. Use **Compose** (enabled in dev) to send the real HTML via mock/SMTP/Graph.

**Copy picture for Outlook** = matches Canva. **Copy HTML** = selectable text but Outlook may shift layout. **Compose** = server sends HTML (best for real delivery).

### Merge fields (owner-defined placeholders)

1. In Canva, type any tokens as normal text: `{{heroName}}`, `{{eventTitle}}`, `{{shipDate}}`, …
2. Import the HTML ZIP into Grat.
3. On the card, open **Placeholders** and set a **meaning** + **filled how** for each detected token:
   - Recipient name / email — auto from selected people  
   - Sender name / email — from Compose sender fields  
   - Shared — one value for everyone  
   - Per person — different value per recipient  
4. On **Compose**, fill shared / per-person values; preview updates live. The saved template HTML is not overwritten.

Do not expect PNG/PDF uploads to become editable selectable HTML — that path is image-in-table only.

In `web/`, run `npm install` (includes `html-to-image` for sharper Canva snapshots).

## Next phases

1. ~~Template CRUD (private/shared) + image upload~~ **done (Phase 1)**  
2. ~~Canva HTML ZIP import + Outlook copy~~ **done** (freeform designer removed)  
3. ~~Compose → recipients → mock drafts~~ **done (Phase 3)**  
   - Graph Outlook drafts: set `MAIL_MODE=graph` + Azure app creds (see above)  
   - Gmail SMTP: set `MAIL_MODE=smtp` (see above)  
4. Richer admin previews + Azure AD user login (`AUTH_MODE=azure`)  

## Repo layout

```
api/   Fastify + Prisma + providers
web/   React + Vite
```
