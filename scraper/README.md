# Singapore Intelligence Scraper

This folder contains the production-ready Singapore intelligence scraper and its small Python API used by the main frontend Super Admin scraper page.

## What It Does

- Reads Singapore sources grouped by topic: `govt`, `news`, `competitor`
- Tries sitemap URLs first
- Discovers internal links from each start URL
- Fetches a limited number of pages per source
- Extracts backend-ready intelligence records only
- Applies basic date and business relevance filters
- Writes inspection files:
  - `outputs/scraped_output.json`
  - `outputs/scraped_output.csv`
  - `outputs/scrape_report.json`

## Install

```bash
cd scraper
pip install -r requirements.txt
```

## Configure MongoDB

Copy `.env.example` to `.env` inside this `scraper` folder and put your separate Mongo Atlas URI there.

```bash
copy .env.example .env
```

The scraper uses only `scraper/.env`; it does not read the React/backend env files.

## Run

```bash
python scraper_runner.py
```

## Scraper API

```bash
python scraper_api.py
```

Then open the main frontend and go to:

```text
Super Admin > Scraper
```

The frontend scraper page lets you:

- View scraped records from `outputs/scraped_output.json`
- Search and filter by source or topic
- Choose last N days or a specific date range before running the scraper
- Inspect full record JSON and source URLs
- View source-wise scrape reports, skips, and failures
- Run the scraper manually through this API
- Delete a scraped record from output files and MongoDB when `MONGO_URI` is configured

Quick start on Windows:

```powershell
cd G:\ascentium-dashboard\scraper
.\start_scraper_api.ps1
```

Important: the Super Admin scraper page needs the Python scraper API. If article data does not load, make sure this is running in another terminal:

```powershell
cd G:\ascentium-dashboard\scraper
python scraper_api.py
```

## Change Date Range

Set this in `scraper/.env`:

```env
FROM_DATE=2025-01-01
TO_DATE=2026-07-20
```

If the same URL/content already exists in MongoDB, the scraper skips it. It does not overwrite existing documents.

## Duplicate Behavior

For every useful page:

1. The scraper creates `urlHash` from canonical URL.
2. It creates `contentHash` from cleaned page text.
3. MongoDB is checked for either hash.
4. If the same URL has changed content/date/title, the existing document is updated.
5. If the same URL/content has not changed, the page is counted as `duplicatePages`.
6. If not found, it is inserted as a new document.

Existing documents are overwritten only when the scraper detects a real change.

## Mongo Document Shape

Each inserted document keeps only the fields needed by the scraper dashboard and downstream intelligence views:

```json
{
  "schemaVersion": 1,
  "recordType": "intelligence_content",
  "isActive": true,

  "type": "govt",
  "intelligenceBucket": "government_updates",
  "country": "Singapore",
  "language": "en",

  "source": "ACRA",
  "sourceId": "acra",
  "sourceDomain": "acra.gov.sg",

  "url": "...",
  "canonicalUrl": "...",
  "urlHash": "...",
  "contentHash": "...",

  "title": "...",
  "summary": "...",

  "publishedAt": "...",
  "dateFallbackUsed": false,
  "fetchedAt": "...",
  "lastScrapedAt": "...",

  "announcementType": "Announcement",
  "audience": ["Businesses"],
  "newsTopic": ["Regulatory updates"],
  "categoryHints": ["Businesses", "Regulatory updates", "Announcement"],
  "tags": ["businesses", "regulatory-updates", "announcement"],

  "crawlStatus": "success",
  "createdAt": "...",
  "updatedAt": "...",
  "ingestStatus": "inserted"
}
```

## What Is Not Stored

- Home pages
- Listing pages
- About/contact/service pages
- Search pages
- Generic location pages
- Images, PDFs, documents, and media URLs
- Full raw article text
- Duplicate summary/snippet copies
- Placeholder relevance scores and source queries

Only these buckets should be inserted:

- `news`
- `government_updates`
- `evergreen`
- `competitor`

## What To Check

- `outputs/scrape_report.json`: source-wise success/failure/skip summary
- MongoDB collection: inserted pages only; duplicates are skipped
- `outputs/scraped_output.csv`: quick table view of titles, dates, text length, source, topic
- `outputs/scraped_output.json`: full cleaned text and metadata

This scraper is separate from the main app and should stay deployable on its own.
