# Setup Guide — BeeSocial

This guide walks through installing and running BeeSocial from a clean machine. Follow each step in order.

**Total time:** ~15 minutes (excluding MongoDB install).

---

## Step 0 · Prerequisites

You need:

- **Node.js ≥ 18** (LTS recommended)
  - Check: `node -v`
  - Install: <https://nodejs.org/en/download>
- **npm** (comes bundled with Node)
- **Git** (optional, only if cloning)
- **MongoDB ≥ 6.0** — see Step 1 below

---

## Step 1 · Install MongoDB

You have **two options**: install locally, or use a free MongoDB Atlas cloud cluster.

### Option A · Local install (recommended for development)

#### 🟢 macOS

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

Verify:
```bash
mongosh --eval "db.runCommand({ping:1})"
# Should print { ok: 1 }
```

#### 🟢 Windows

1. Download the installer from <https://www.mongodb.com/try/download/community>.
2. Run the `.msi` — choose **Complete** install.
3. Tick "Install MongoDB as a Service" → click Install.
4. MongoDB starts automatically and listens on `localhost:27017`.
5. Optionally install **MongoDB Compass** (GUI) when prompted.

Verify:
```powershell
"C:\Program Files\MongoDB\Server\7.0\bin\mongosh.exe" --eval "db.runCommand({ping:1})"
```

#### 🟢 Linux (Ubuntu / Debian)

```bash
# Import the MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add the official repo (Ubuntu 22.04 jammy example - adjust if needed)
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
```

Verify: `mongosh --eval "db.runCommand({ping:1})"`

Your MongoDB URI for the `.env` is then:
```
MONGO_URI=mongodb://127.0.0.1:27017/beesocial
```

The database **does not need to be created in advance** — Mongoose will create it on first write.

### Option B · MongoDB Atlas (free cloud cluster)

1. Sign up at <https://cloud.mongodb.com/> (free M0 tier is enough).
2. Create a free cluster — pick the region closest to you.
3. Under **Database Access**, create a user with a strong password.
4. Under **Network Access**, allow your IP (or `0.0.0.0/0` for dev).
5. Click **Connect → Drivers → Node.js**. Copy the connection string. It looks like:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Append the database name `/beesocial` before the `?`:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/beesocial?retryWrites=true&w=majority
   ```
7. This goes into `backend/.env` as `MONGO_URI`.

---

## Step 2 · Backend setup

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` in your editor and **set at minimum**:

```env
MONGO_URI=mongodb://127.0.0.1:27017/beesocial     # or your Atlas URI
JWT_SECRET=<a long random string — run the command below>
SEED_ADMIN_EMAIL=admin@digitalgowhere.com
SEED_ADMIN_PASSWORD=AStrongPassword!123
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Install dependencies:
```bash
npm install
```

**Seed the first super admin** (one-time):
```bash
npm run seed
# [seed] Created super_admin -> admin@digitalgowhere.com
```

Start the server:
```bash
npm run dev
```

You should see:
```
╔══════════════════════════════════════════════╗
║  BeeSocial API                                ║
║  Listening on http://localhost:5000           ║
╚══════════════════════════════════════════════╝
[cron] scheduled "0 7 * * *" (Asia/Kolkata)
```

Test it:
```bash
curl http://localhost:5000/api/health
# {"ok":true,"env":"development","time":"..."}
```

---

## Step 3 · Frontend setup

In a **new terminal**:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in 320 ms
  ➜  Local:   http://localhost:5173/
```

Open <http://localhost:5173> in your browser. You'll land on the **Login** page.

---

## Step 4 · First login + first fetch

1. Log in with the email/password you set in `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
2. You land on the **Dashboard** — empty for now (4 empty columns).
3. Click **Admin** in the top nav → **Fetch tab** → **Fetch all** button.
4. The scrape runs in the background (90–120 seconds typical). You can refresh the page; the **Last run** card on the right will update.
5. Once finished, go to the **Articles** tab. You'll see ~50–200 scraped articles in *Draft* state.
6. Select the ones to make visible to your members → click **Publish** (single) or use the bulk-publish toolbar.
7. Members logging in will only see **Published** articles — they cannot see drafts.

---

## Step 5 · Inviting members

Two ways:

### Self-registration
Share `http://localhost:5173/register` (or your deployed URL). Users create their own account; new accounts are **role = `user`** by default.

### Manual creation (Admin Panel)
*(Not yet implemented — for now, ask the user to self-register, then change their role from the Users tab if you want to promote them to admin.)*

---

## Step 6 · Cron / scheduled fetch

Default schedule is **07:00 Asia/Kolkata** (= 07:00 IST = 04:30 SGT / 09:30 SGT depending on DST? actually SGT is UTC+8, so 7 AM IST = 9:30 AM SGT).

To change it, edit `backend/.env`:

```env
# Cron format: "minute hour day-of-month month day-of-week"
# Examples:
#   "0 7 * * *"     = every day at 07:00
#   "0 7,18 * * *"  = 07:00 and 18:00 daily
#   "0 7 * * 1-5"   = 07:00 Monday–Friday only
CRON_SCHEDULE=0 7 * * *
CRON_TIMEZONE=Asia/Kolkata

# Disable cron entirely (useful in dev):
ENABLE_CRON=false
```

You can verify the cron is loaded by checking the boot logs.

You can also run a one-shot fetch from the CLI:
```bash
cd backend
npm run fetch:once
```

---

## Step 7 · (Optional) Enable OpenAI

For richer AI summaries and smarter category classification when the rule-based matcher can't decide:

1. Get an API key from <https://platform.openai.com>.
2. In `backend/.env`:
   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_USE_FOR_SUMMARY=true
   OPENAI_USE_FOR_CATEGORY=true
   ```
3. Restart the backend.

**Cost:** with `gpt-4o-mini`, a typical 200-article fetch costs ~ $0.01–0.05. Set either toggle to `false` to control spend.

---

## Step 8 · (Optional) Enable Tavily

For higher-quality evergreen content (semantic search instead of plain HTML scraping):

1. Get a free key from <https://tavily.com>.
2. In `backend/.env`:
   ```env
   TAVILY_API_KEY=tvly-...
   ```
3. Restart the backend. The evergreen scraper automatically uses Tavily when the key is present, and falls back to DuckDuckGo HTML when it's missing.

---

## Production deployment notes

### Backend
- Use a process manager like **PM2**:
  ```bash
  npm install -g pm2
  cd backend
  pm2 start src/server.js --name beesocial-api
  pm2 save
  pm2 startup
  ```
- Put it behind **nginx** with TLS (Let's Encrypt).
- Set `NODE_ENV=production` in `.env`.

### Frontend
- Build the static bundle:
  ```bash
  cd frontend
  npm run build
  # outputs to ./dist
  ```
- Serve `frontend/dist` with nginx, Vercel, Netlify, or any static host.
- Set `VITE_API_BASE_URL=https://api.yourdomain.com/api` in `frontend/.env` before building.

### MongoDB
- For production, **strongly prefer MongoDB Atlas** over self-hosting. Configure backups and IP allowlists.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `MONGO_URI is not set` on boot | You forgot to copy `.env.example` to `.env` or didn't fill in the URI. |
| `Cannot connect to MongoDB`     | Is `mongod` running? Run `mongosh` to test. On Mac: `brew services restart mongodb-community@7.0`. |
| Frontend shows network error / CORS error | Make sure `CORS_ORIGINS` in `backend/.env` includes your frontend URL (default `http://localhost:5173` is whitelisted). |
| Login works but the dashboard is empty | You haven't run a fetch yet. Go to **Admin → Fetch → Fetch all**. |
| Fetch returns 0 items everywhere | Some news sites block User-Agents. Try changing `SCRAPE_USER_AGENT` in `.env`. Also check `backend` logs for per-source errors. |
| `npm install` fails on `bcrypt` | We use `bcryptjs` (pure JS), so this should not occur. If you swapped in `bcrypt`, you need build tools. |
| Cron doesn't fire | Make sure `ENABLE_CRON` is not `false`. The cron uses the host server clock translated to `CRON_TIMEZONE`. |
| OpenAI errors in logs | Either the key is wrong, or you've hit the rate limit. The system will simply skip AI enrichment for those items — no crashes. |

---

## Next steps after install

1. **Review categories** — `backend/src/config/categories.js` is the single source of truth. Add or tune keywords there if your service mix changes.
2. **Add sources** — `backend/src/config/sources.js` controls every scraped site. Add new sources without touching anything else.
3. **Branding** — `frontend/tailwind.config.js` defines the brand palette. Replace `navy.900` / `brass.400` / `canvas` values if you want a different look.
4. **Schedule** — adjust `CRON_SCHEDULE` for your reporting cadence.

---

If something breaks, check `backend/` console output first — it logs every scraper run and every error with the source ID, so you'll find the issue quickly.
