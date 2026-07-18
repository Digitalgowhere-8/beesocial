# Ascentium Intelligence Dashboard

A full-stack web application that aggregates **Singapore corporate-services intelligence** across four streams — News, Government Updates, Competitor Activity, and Evergreen Guidance — automatically, every day at 07:00 IST.

Built specifically around Ascentium's **9 service pillars** and **38 sub-categories** (verified from the official Ascentium navigation).

---

## What it does

- **Scrapes** four kinds of sources every morning:
  - News: The Business Times, Channel News Asia, The Straits Times, ASEAN Briefing
  - Government: ACRA, IRAS, MOM, EDB, MAS
  - Competitors: Vistra, TMF Group, Tricor, Acclime, KPMG, PwC, BoardRoom, Hawksford
  - Evergreen guides: Incorporation, Tax/CPF, Employment Pass, VCC, ESG, GST, Transfer Pricing, Trust Formation
- **Categorises** each article into one of Ascentium's 9 service pillars (rule-based + optional OpenAI fallback).
- **Deduplicates** automatically via a SHA-256 URL hash — same article will never be stored twice.
- **Workflow**: Super-admin reviews → publishes → members see it on their dashboard.
- **Filters** by type, category, sub-category, source, date range, and free-text search.
- **Audit log** of every fetch (cron or manual), per-source success/failure stats.

---

## Tech stack

| Layer       | Tech                                                          |
|-------------|---------------------------------------------------------------|
| Frontend    | React 18 + Vite + Tailwind CSS + React Router 6               |
| Backend     | Node.js (≥18) + Express + Mongoose                            |
| Database    | MongoDB (local or Atlas)                                      |
| Auth        | JWT + bcrypt                                                  |
| Scraping    | axios + cheerio                                               |
| Scheduling  | node-cron (default: 07:00 Asia/Kolkata, configurable)         |
| AI (optional)| OpenAI (gpt-4o-mini) — summary + smart category classification |
| Search (optional) | Tavily — relevance ranking + evergreen content        |

---

## Project structure

```
ascentium-dashboard/
├── backend/                  # Express API
│   ├── src/
│   │   ├── config/           # DB, categories taxonomy, sources
│   │   ├── models/           # User, Article, FetchLog
│   │   ├── routes/           # auth, articles, admin
│   │   ├── middleware/       # JWT + role checks
│   │   ├── scrapers/         # news, govt, competitor, evergreen
│   │   ├── services/         # tavily, openai, orchestrator
│   │   ├── jobs/             # cron
│   │   ├── utils/            # url hash, concurrency, seed admin
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── api/              # axios client
│   │   ├── context/          # AuthContext
│   │   ├── components/       # Navbar, Filters, ArticleCard, …
│   │   ├── pages/            # Login, Register, Dashboard, Admin, Profile
│   │   └── App.jsx
│   ├── .env.example
│   └── package.json
├── README.md
└── SETUP_GUIDE.md            # 👈 STEP-BY-STEP install
```

---

## Quick start (TL;DR)

> See **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** for full step-by-step instructions including MongoDB installation.

```bash
# 1. Install Mongo locally (or use Atlas), then:

# Backend
cd backend
cp .env.example .env       # then edit MONGO_URI + JWT_SECRET
npm install
npm run seed               # creates the first super admin
npm run dev                # http://localhost:5000

# Frontend (in another terminal)
cd frontend
cp .env.example .env       # default works for local dev
npm install
npm run dev                # http://localhost:5173
```

Open <http://localhost:5173>, log in with the email/password you set in `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, go to **Admin → Fetch → Fetch all** to pull the first batch of articles.

---

## OpenAI usage (optional)

OpenAI is **completely optional**. Default behaviour: rule-based keyword matching, free.

To enable AI summaries and smart category classification:

1. Get an API key from <https://platform.openai.com>.
2. In `backend/.env`:
   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_USE_FOR_SUMMARY=true
   OPENAI_USE_FOR_CATEGORY=true
   ```
3. Restart the backend.

Per-feature toggles let you control cost — for example, you can enable summaries (cheaper) without category classification, or vice-versa. **gpt-4o-mini** is used by default for cost efficiency.

---

## Verified Ascentium services taxonomy

Filters are built directly from the official Ascentium nav (https://www.ascentium.com).

| # | Pillar | Sub-categories |
|---|--------|----------------|
| 1 | Corporate | Incorporation & Business Formation · Company Secretarial & Compliance · Trademark/Licenses/Copyright · Share Registry · Entity Management |
| 2 | Accounting and Tax | Accounting & Finance · Tax Filing & Compliance · Tax Advisory · Indirect Tax · Transfer Pricing · Government Incentive Plans |
| 3 | Risk Assurance & Audit | Operation Risk Management · Internal Audit Assurance · Compliance & Governance Solutions |
| 4 | Cross Border & FDI | Cross-Border Compliance · China ODI & Circular 37 · UAE Free Zone and Mainland |
| 5 | Fiduciary | Corporate Services · Trust Services · Economic Substance · Compliance Solutions |
| 6 | Funds | Fund Administration · Fund Governance · Fund Compliance · Fund Corporate Services |
| 7 | HR & Payroll | PEO & EOR · Global Immigration · Outplacement · Statement of Work · Recruitment · Payroll Outsourcing · Multi-Country Payroll · Links One |
| 8 | Private Client | Private Client Services · Trust Services · Economic Substance · Corporate Services |
| 9 | Advisory | ESG & Compliance · Business Consultancy · Financial Advisory · M&A Advisory · Insolvency/Liquidation · Business Intelligence Playbook |

→ **9 pillars · 43 sub-categories**

---

## License

Proprietary — internal Ascentium use.
