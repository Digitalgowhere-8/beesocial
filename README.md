# BeeSocial

BeeSocial is a multi-tenant business intelligence platform for country-specific monitoring across `news`, `government`, `competitor`, and `evergreen` topics.

It is designed for production use with:
- role-based access for `super_admin`, `admin`, and `user`
- country-aware source controls
- category-based filtering and storage rules
- AI-assisted relevance, classification, blog drafting, and social content generation
- scheduled and manual profile-search workflows

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, Mongoose
- Database: MongoDB
- Search: scraper master database
- AI: OpenAI

## Structure

```text
project-root/
|-- backend/
|-- frontend/
|-- README.md
`-- SETUP_GUIDE.md
```

## Local setup

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Backend default URL:

```text
http://localhost:5000
```

Frontend default URL:

```text
http://localhost:5173
```

## Environment

Minimum backend variables:

```env
MONGO_URI=mongodb://127.0.0.1:27017/beesocial
JWT_SECRET=replace_with_a_long_random_secret
SEED_ADMIN_EMAIL=admin@digitalgowhere.com
SEED_ADMIN_PASSWORD=replace_with_a_strong_password
```

Optional integrations:

```env
OPENAI_API_KEY=
MASTER_ARTICLES_MONGO_URI=
MASTER_ARTICLES_DB=master
MASTER_ARTICLES_COLLECTION=master_articles
```

## Production notes

- Use environment variables for all secrets and credentials.
- Do not keep client-specific names, emails, or domains hardcoded in source files.
- Review source-domain settings before production deployment.
- Rotate seed credentials after first login.
- Prefer one primary `super_admin` and use `admin` accounts for daily operations.

## Documentation

- Setup: [SETUP_GUIDE.md](/G:/ascentium-dashboard/SETUP_GUIDE.md:1)
- Architecture: [docs/ARCHITECTURE.md](/G:/ascentium-dashboard/docs/ARCHITECTURE.md:1)
- API overview: [docs/API_OVERVIEW.md](/G:/ascentium-dashboard/docs/API_OVERVIEW.md:1)
- Deployment: [docs/DEPLOYMENT.md](/G:/ascentium-dashboard/docs/DEPLOYMENT.md:1)

## License

Proprietary.
