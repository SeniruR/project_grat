# Project Grat — Intranet gratitude cards

Phase 0 scaffold + Phases 1–3: templates, Canva HTML import, **compose → mock/SMTP drafts**.

Providers:

| Mode env | Local default | Work account |
|----------|---------------|--------------|
| `AUTH_MODE` | `dev` | `azure` |
| `DIRECTORY_MODE` | `mock` | `graph` |
| `MAIL_MODE` | `mock` | `graph` (send as the signed-in user) or `smtp` |

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

### Azure AD work account (`AUTH_MODE=azure`)

Sign-in, the recipient list, and sending all use one Azure AD app registration. The Azure portal lists that registration under **Microsoft Entra ID**. Full host steps are in `documents/project-guidelines.pdf` (section “Azure AD sign-in, directory, and mail”).

Until the identity team sends the three IDs, leave `AUTH_MODE=dev`. When you have them, put this in `api/.env` and restart the API:

```env
AUTH_MODE=azure
DIRECTORY_MODE=graph
MAIL_MODE=graph
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_REDIRECT_URI=http://localhost:3001/auth/azure/callback
AZURE_WEB_ORIGIN=http://localhost:5173
AZURE_ADMIN_EMAILS=you@yourcompany.com
```

The redirect URI registered on the app must match `AZURE_REDIRECT_URI`. Delegated permissions, with admin consent: `User.Read`, `User.ReadBasic.All`, `Mail.Send`.

`AZURE_ADMIN_EMAILS` is who becomes an application admin the first time they sign in. Everyone else is a normal sender. A designer role is still assigned in the app after that.

Sign-in opens Microsoft, then returns to Gratitude. Recipient search reads the company directory. Send delivers from that person’s mailbox.

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

## CI / CD (GitHub Actions)

### Continuous integration

On every pull request and every push, [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs:

- API: `prisma generate`, `prisma migrate deploy` (Postgres service), TypeScript check
- Web: oxlint, TypeScript check, production build

Enable **branch protection** on `main` and require the **CI** check before merge.

### Continuous deployment (production)

After CI succeeds on a push to `main`, [`.github/workflows/cd-production.yml`](.github/workflows/cd-production.yml) SSHs to the RHEL host and runs [`scripts/deploy-rhel.sh`](scripts/deploy-rhel.sh) (pull, migrate, build web, restart API, reload nginx, health check).

**One-time GitHub setup** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user (`root` or `cloud-user`) |
| `DEPLOY_SSH_KEY` | Private key that can SSH to the host |
| `DEPLOY_PORT` | Optional; default `22` |
| `DEPLOY_APP_ROOT` | Optional; default `/var/www/project_grat` |

Create a GitHub **Environment** named `production` if you want a manual approval gate before deploy.

**One-time on the RHEL server** (after the app is cloned and systemd/nginx are set up — see `documents/project-guidelines.pdf`). Inbound access is SSH on port 22 and HTTPS on port 443. Port 80 stays closed; nginx listens on 443 with the organization TLS certificate.

```bash
sudo mkdir -p /etc/gratitude
sudo tee /etc/gratitude/deploy.env <<'EOF'
VITE_API_URL=https://thoughts.slt.com.lk/api
EOF
sudo chmod 640 /etc/gratitude/deploy.env
```

You can also run **CD Production → Run workflow** manually from the Actions tab (`workflow_dispatch`).

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
4. Azure AD user login, directory search, and send-as-user — **implemented**; turn on with the env block above  

## Repo layout

```
api/   Fastify + Prisma + providers
web/   React + Vite
```
