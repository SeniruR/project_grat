# Project Grat — Intranet gratitude cards

Phase 0 scaffold + Phases 1–3: templates, designer/compile, **compose → mock drafts**.

Providers are swap-ready:

| Mode env | Now | Later |
|----------|-----|--------|
| `AUTH_MODE` | `dev` | `azure` |
| `DIRECTORY_MODE` | `mock` | `graph` |
| `MAIL_MODE` | `mock` | `graph` (Outlook drafts via Graph) |

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

## What to try

1. Open the site → **Enter intranet** (dev login).
2. Open **Cards** — empty templates + seeded directory names.
3. Design / compile a card, then **Compose** → pick recipients → mock drafts.
4. Open **Drafts** (or Admin) — job list + audit.

## Next phases

1. ~~Template CRUD (private/shared) + image upload~~ **done (Phase 1)**  
2. ~~Freeform designer + compile-to-email HTML~~ **done (Phase 2)**  
3. ~~Compose → recipients → mock drafts~~ **done (Phase 3)**  
   - Graph Outlook drafts: set `MAIL_MODE=graph` + Azure app creds (see above)  
4. Richer admin previews + Azure AD user login (`AUTH_MODE=azure`)  

## Repo layout

```
api/   Fastify + Prisma + providers
web/   React + Vite
```
