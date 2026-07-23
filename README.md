# Project Grat — Intranet gratitude cards

Phase 0 scaffold: **dev login** (Azure AD lookalike), Postgres, catalog shell, mock directory, admin audit.

Providers are swap-ready:

| Mode env | Now | Later |
|----------|-----|--------|
| `AUTH_MODE` | `dev` | `azure` |
| `DIRECTORY_MODE` | `mock` | `graph` |
| `MAIL_MODE` | `mock` | `graph` |

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
3. Open **Admin** (if you checked admin) — stats + login audit.

## Next phases

1. ~~Template CRUD (private/shared) + image upload~~ **done (Phase 1)**  
2. ~~Freeform designer + compile-to-email image~~ **done (Phase 2)**  
3. Compose → recipients → mock drafts (then Graph Outlook drafts)  
4. Richer admin previews  

## Repo layout

```
api/   Fastify + Prisma + providers
web/   React + Vite
```
