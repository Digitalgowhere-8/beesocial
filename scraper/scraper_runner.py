import csv
import json
import os
import re
import subprocess
import sys
import time
import hashlib
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag, unquote, urlunparse

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser
from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


load_dotenv(encoding="utf-8-sig")


def env_value(name, default=""):
    import os
    value = os.getenv(name)
    return default if value is None or value == "" else value


def env_int(name, default):
    try:
        return int(env_value(name, str(default)))
    except ValueError:
        return default


def env_float(name, default):
    try:
        return float(env_value(name, str(default)))
    except ValueError:
        return default


def env_bool(name, default=False):
    return str(env_value(name, str(default))).strip().lower() in {"1", "true", "yes", "on"}


def format_duration(seconds):
    seconds = int(round(seconds or 0))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes}m {sec}s"
    if minutes:
        return f"{minutes}m {sec}s"
    return f"{sec}s"


FROM_DATE = env_value("FROM_DATE", "2025-01-01")
TO_DATE = env_value("TO_DATE", "2026-07-20")

MAX_SITEMAP_URLS_PER_SOURCE = env_int("MAX_SITEMAP_URLS_PER_SOURCE", 40)
MAX_DISCOVERED_LINKS_PER_SOURCE = env_int("MAX_DISCOVERED_LINKS_PER_SOURCE", 40)
MAX_PAGES_PER_SOURCE = env_int("MAX_PAGES_PER_SOURCE", 35)
REQUEST_DELAY_SECONDS = env_float("REQUEST_DELAY_SECONDS", 1.5)
STOP_AFTER_OLD_PAGES_PER_SOURCE = env_int("STOP_AFTER_OLD_PAGES_PER_SOURCE", 5)
SAVE_RAW_HTML = env_bool("SAVE_RAW_HTML", False)
MAX_STORED_CONTENT_CHARS = env_int("MAX_STORED_CONTENT_CHARS", 30000)
USE_PLAYWRIGHT_EDB = env_bool("USE_PLAYWRIGHT_EDB", True)
INCREMENTAL_MODE = env_bool("INCREMENTAL_MODE", True)
FORCE_RESCAN = env_bool("FORCE_RESCAN", False)
PLAYWRIGHT_EDB_MODE = env_value("PLAYWRIGHT_EDB_MODE", "cdp").strip().lower()
PLAYWRIGHT_CDP_URL = env_value("PLAYWRIGHT_CDP_URL", "http://127.0.0.1:9223")
PLAYWRIGHT_EDB_PROFILE_DIR = env_value("PLAYWRIGHT_EDB_PROFILE_DIR", str(Path.cwd() / ".edge-edb-debug"))
PLAYWRIGHT_EDB_WAIT_MS = env_int("PLAYWRIGHT_EDB_WAIT_MS", 8000)
PLAYWRIGHT_HEADLESS_WAIT_MS = env_int("PLAYWRIGHT_HEADLESS_WAIT_MS", 8000)
BUSINESS_TIMES_SEARCH_TIMEOUT_SECONDS = env_float("BUSINESS_TIMES_SEARCH_TIMEOUT_SECONDS", 8)
BUSINESS_TIMES_SEARCH_QUERIES = [
    item.strip()
    for item in env_value(
        "BUSINESS_TIMES_SEARCH_QUERIES",
        "singapore,market,stocks,ai,oil,gold,china,malaysia,hong kong,wall street,tesla,ipo"
    ).split(",")
    if item.strip()
]

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
MASTER_OUTPUT_JSON = OUTPUT_DIR / "all_scraped_articles.json"
RUN_CHECKPOINT_JSON = OUTPUT_DIR / "scraper_run_checkpoint.json"
MONGO_URI = env_value("MONGO_URI", "")
MONGO_DB = env_value("MONGO_DB", "master")
MONGO_COLLECTION = env_value("MONGO_COLLECTION", "master_articles")
ONLY_TOPICS = {item.strip().lower() for item in env_value("ONLY_TOPICS", "").split(",") if item.strip()}
ONLY_SOURCES = {item.strip().lower() for item in env_value("ONLY_SOURCES", "").split(",") if item.strip()}
ONLY_COUNTRIES = {item.strip().lower() for item in env_value("ONLY_COUNTRIES", "").split(",") if item.strip()}
try:
    COUNTRY_TOPICS = {
        str(country).strip().lower(): {str(topic).strip().lower() for topic in topics if str(topic).strip()}
        for country, topics in json.loads(env_value("COUNTRY_TOPICS", "{}")).items()
        if isinstance(topics, list)
    }
except Exception:
    COUNTRY_TOPICS = {}
try:
    SOURCE_DOMAINS_BY_COUNTRY = json.loads(env_value("SOURCE_DOMAINS_BY_COUNTRY", "{}"))
    if not isinstance(SOURCE_DOMAINS_BY_COUNTRY, dict):
        SOURCE_DOMAINS_BY_COUNTRY = {}
except Exception:
    SOURCE_DOMAINS_BY_COUNTRY = {}
IRAS_LATEST_UPDATE_DATES = {}
MOM_NEWSROOM_DATES = {}
MFA_NEWSROOM_DATES = {}
MFA_SINGAPORE_URLS = set()
INFO_GOV_PRESS_DATES = {}
IMMD_PRESS_RELEASE_DATES = {}
BUSINESS_TIMES_SEARCH_DATES = {}
LOCAL_EXISTING_URL_HASHES = set()

TRANSIENT_ARTICLE_FIELDS = {
    "_contentText",
}

DEPRECATED_STORAGE_FIELDS = {
    "rawContent",
    "searchText",
    "relevanceScore",
    "baseScore",
    "sourceQuery",
    "opportunityType",
    "region",
    "snippet",
    "contentFingerprint",
    "sourceName",
    "sourceType",
}


def json_signature(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)


def source_checkpoint_key(country, topic, source):
    normalized = normalize_source_config(source)
    return "|".join([
        str(country or "").strip().lower(),
        str(topic or "").strip().lower(),
        str(normalized.get("domain") or "").strip().lower(),
        str(normalized.get("name") or "").strip().lower(),
    ])


def current_run_signature():
    return json_signature({
        "fromDate": FROM_DATE,
        "toDate": TO_DATE,
        "onlyTopics": sorted(ONLY_TOPICS),
        "onlySources": sorted(ONLY_SOURCES),
        "onlyCountries": sorted(ONLY_COUNTRIES),
        "countryTopics": {country: sorted(topics) for country, topics in sorted(COUNTRY_TOPICS.items())},
        "sourceDomainsByCountry": SOURCE_DOMAINS_BY_COUNTRY,
        "incremental": INCREMENTAL_MODE,
    })


def load_run_checkpoint(signature):
    if FORCE_RESCAN or not RUN_CHECKPOINT_JSON.exists():
        return {"signature": signature, "completedSources": []}
    try:
        checkpoint = json.loads(RUN_CHECKPOINT_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {"signature": signature, "completedSources": []}
    if checkpoint.get("signature") != signature:
        return {"signature": signature, "completedSources": []}
    completed = checkpoint.get("completedSources")
    return {
        "signature": signature,
        "completedSources": completed if isinstance(completed, list) else [],
    }


def save_run_checkpoint(signature, completed_sources):
    OUTPUT_DIR.mkdir(exist_ok=True)
    RUN_CHECKPOINT_JSON.write_text(json.dumps({
        "signature": signature,
        "completedSources": sorted(set(completed_sources)),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2, ensure_ascii=False), encoding="utf-8")


def clear_run_checkpoint(signature):
    if not RUN_CHECKPOINT_JSON.exists():
        return
    try:
        checkpoint = json.loads(RUN_CHECKPOINT_JSON.read_text(encoding="utf-8"))
        if checkpoint.get("signature") != signature:
            return
    except Exception:
        pass
    try:
        RUN_CHECKPOINT_JSON.unlink()
    except Exception:
        pass

TOPIC_BUCKETS = {
    "govt": "government_updates",
    "news": "news",
    "competitor": "competitor",
    "evergreen": "evergreen",
}

OPPORTUNITY_TYPES = {
    "govt": "government_update",
    "news": "market_news",
    "competitor": "competitor_intelligence",
    "evergreen": "evergreen_guide",
}


def domain_from_url(url):
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def normalize_custom_source_url(value):
    raw = str(value or "").strip()
    if not raw:
        return "", ""
    url = raw if re.match(r"^https?://", raw, re.I) else f"https://{raw}"
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return "", ""
    start_url = urlunparse((parsed.scheme or "https", parsed.netloc, parsed.path or "/", "", "", ""))
    return host, start_url


def normalize_source_config(source):
    normalized = dict(source or {})
    if "start_urls" not in normalized and "urls" in normalized:
        normalized["start_urls"] = normalized.get("urls") or []
    normalized["start_urls"] = list(normalized.get("start_urls") or [])
    normalized["sitemap_urls"] = list(normalized.get("sitemap_urls") or [])
    normalized["allow_patterns"] = list(normalized.get("allow_patterns") or [])

    if not normalized.get("domain"):
        first_url = next((url for url in normalized["start_urls"] + normalized["sitemap_urls"] if url), "")
        normalized["domain"] = domain_from_url(first_url)

    if not normalized.get("name"):
        normalized["name"] = normalized.get("domain") or "Unknown source"

    return normalized


# Add future countries here. A source can be as small as:
# {"name": "Example News", "start_urls": ["https://example.com/news"]}
# Optional keys such as domain, sitemap_urls, and allow_patterns are supported
# when a site needs tighter filtering.
SOURCES = {
    "Singapore": {
        "govt": [
            {
                "name": "ACRA",
                "domain": "acra.gov.sg",
                "start_urls": ["https://www.acra.gov.sg/news-events/news-announcements/"],
                "sitemap_urls": [],
                "allow_patterns": ["/news-events/news-announcements/"],
            },
            {
                "name": "IRAS",
                "domain": "iras.gov.sg",
                "start_urls": ["https://www.iras.gov.sg/latest-updates"],
                
            },
            {
                "name": "MOM",
                "domain": "mom.gov.sg",
                "start_urls": [
                    "https://www.mom.gov.sg/newsroom/press-releases",
                    "https://www.mom.gov.sg/newsroom/announcements",
                    "https://www.mom.gov.sg/newsroom/speeches",
                    "https://www.mom.gov.sg/newsroom/press-replies",
                    "https://www.mom.gov.sg/newsroom/fact-checks",
                    "https://www.mom.gov.sg/newsroom/mom-statements",
                    "https://www.mom.gov.sg/newsroom/media-articles",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/newsroom/", "/employment-practices/", "/passes-and-permits/", "/workplace-safety-and-health/"],
            },
            {
                "name": "EDB",
                "domain": "edb.gov.sg",
                "start_urls": [
                    "https://www.edb.gov.sg/en/about-edb/media-releases-publications.html",
                    "https://www.edb.gov.sg/en/business-insights/insights.html",
                    "https://www.edb.gov.sg/en/business-insights/market-and-industry-reports.html",
                    "https://www.edb.gov.sg/en/business-insights/business-guides.html",
                    "https://www.edb.gov.sg/en/about-edb/media-releases-publications/corporate-news.html",
                    "https://www.edb.gov.sg/en/about-edb/media-releases-publications/industry-news.html",
                ],
                "sitemap_urls": ["https://www.edb.gov.sg/en.sitemap.xml"],
                "allow_patterns": [
                    "/en/about-edb/media-releases-publications",
                    "/en/business-insights/",
                ],
            },
            {
                "name": "Singapore Government",
                "domain": "gov.sg",
                "start_urls": [],
                "sitemap_urls": ["https://www.gov.sg/sitemap.xml"],
                "allow_patterns": ["/article/", "/news/", "/features/", "/explainers/", "/profile-stories/", "/budget2026/", "/parliament/", "/stopvaping"],
            },
            {
                "name": "MFA",
                "domain": "mfa.gov.sg",
                "start_urls": [
                    "https://www.mfa.gov.sg/newsroom/press-statements-transcripts-and-photos?filters=%5B%7B%22id%22%3A%22Country%22%2C%22items%22%3A%5B%7B%22id%22%3A%22Singapore%22%7D%5D%7D%5D&page=1",
                    "https://www.mfa.gov.sg/newsroom/announcements-and-highlights?filters=%5B%5D&page=1",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/newsroom/press-statements-transcripts-and-photos/", "/newsroom/announcements-and-highlights/"],
            },
        ],
        "news": [
            {
                "name": "Business Times",
                "domain": "businesstimes.com.sg",
                "start_urls": ["https://www.businesstimes.com.sg/search?query=singapore+"],
                "sitemap_urls": [],
                "allow_patterns": [],
            },
            {
                "name": "Straits Times",
                "domain": "straitstimes.com",
                "start_urls": [
                    "https://www.straitstimes.com/singapore",
                    "https://www.straitstimes.com/business",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/singapore/", "/business/"],
            },
           
            {
                "name": "Channel News Asia",
                "domain": "channelnewsasia.com",
                "start_urls": [
                    "https://www.channelnewsasia.com/singapore",
                    "https://www.channelnewsasia.com/business",
                ],
               
            },
        ],
        "competitor": [
            {
                "name": "Vistra",
                "domain": "vistra.com",
                "start_urls": [
                    "https://www.vistra.com/news-and-insights",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/news-and-insights", "/insights/"],
            },
            {
                "name": "Tricor Group",
                "domain": "tricorglobal.com",
                "start_urls": [
                    "https://www.tricorglobal.com/blog",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/blog"],
            },
            {
                "name": "Acclime",
                "domain": "acclime.com",
                "start_urls": [
                    "https://singapore.acclime.com/guides/",
                    "https://singapore.acclime.com/downloads/",
                    "https://singapore.acclime.com/category/press-releases/",
                    "https://singapore.acclime.com/case-studies/",
                    "https://singapore.acclime.com/category/insights/",
                    "https://singapore.acclime.com/category/news/",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/guides/", "/downloads/", "/category/", "/case-studies/"],
            },
            {
                "name": "KPMG",
                "domain": "kpmg.com",
                "start_urls": [
                    "https://kpmg.com/sg/en/media/press-releases.html",
                    "https://kpmg.com/sg/en/events.html",
                    "https://kpmg.com/sg/en/media.html",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/sg/en/media/", "/sg/en/events", "/sg/en/media"],
            },
            {
                "name": "PwC",
                "domain": "pwc.com",
                "start_urls": [
                    "https://www.pwc.com/sg/en/blog.html",
                    "https://www.pwc.com/sg/en/publications.html",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/sg/en/blog", "/sg/en/publications"],
            },
            {
                "name": "BoardRoom",
                "domain": "boardroomlimited.com",
                "start_urls": [
                    "https://www.boardroomlimited.com/insights-news/articles/",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/insights-news/articles/"],
            },
            {
                "name": "Hawksford",
                "domain": "hawksford.com",
                "start_urls": [
                    "https://www.hawksford.com/insights-and-guides",
                    "https://www.hawksford.com/insights-and-guides?type=news",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/insights-and-guides"],
            },
            {
                "name": "TMF Group",
                "domain": "tmf-group.com",
                "start_urls": [
                    "https://www.tmf-group.com/en/news-insights/?filters=1066",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/en/news-insights/"],
            },
        ],
        "evergreen": [
            {
                "name": "ACRA Guides",
                "domain": "acra.gov.sg",
                "start_urls": [],
                "sitemap_urls": ["https://www.acra.gov.sg/sitemap.xml"],
                "allow_patterns": [
                    "/manage/companies/",
                    "/manage/limited-liability-partnerships/",
                    "/manage/limited-partnerships/",
                    "/manage/sole-proprietorship-partnerships/",
                ],
            },
        ],
    },
    "Hong Kong": {
        "govt": [
            {
                "name": "Companies Registry",
                "domain": "cr.gov.hk",
                "start_urls": [
                    "https://www.cr.gov.hk/en/publications/news-press/press.htm",
                    
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/publications/news-press/",
                ],
            },
            {
                "name": "Inland Revenue Department",
                "domain": "ird.gov.hk",
                "start_urls": [
                    "https://www.ird.gov.hk/eng/new/index.htm",
                    "https://www.ird.gov.hk/eng/ppr/pre_rpr.htm",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/eng/new/", "/eng/ppr/"],
            },
            {
                "name": "Labour Department",
                "domain": "labour.gov.hk",
                "start_urls": [
                    "https://www.labour.gov.hk/eng/news/highlights.php",
                    "https://www.labour.gov.hk/eng/major/content.php",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/eng/news/", "/eng/major/"],
            },
            {
                "name": "InvestHK",
                "domain": "investhk.gov.hk",
                "start_urls": [
                    "https://www.investhk.gov.hk/en/news/?newsType=News",
                    "https://www.investhk.gov.hk/en/events/",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/en/news/", "/en/events/"],
            },
            {
                "name": "Immigration Department",
                "domain": "immd.gov.hk",
                "start_urls": [
                    "https://www.immd.gov.hk/eng/press/press_releases.html",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/eng/press/"],
            },
            {
                "name": "GovHK",
                "domain": "info.gov.hk",
                "start_urls": [
                    "https://www.info.gov.hk/gia/general/today.htm",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/gia/general/"],
            },
        ],
        "news": [
            {
                "name": "SCMP",
                "domain": "scmp.com",
                "start_urls": [
                    "https://www.scmp.com/news/hong-kong?module=oneline_menu_section_hk&pgtype=homepage",
                    "https://www.scmp.com/news/hong-kong/politics?module=sub_section_menu&pgtype=section",
                    "https://www.scmp.com/news/hong-kong/hong-kong-economy?module=sub_section_menu&pgtype=section",
                    "https://www.scmp.com/news/hong-kong/law-and-crime?module=sub_section_menu&pgtype=section",
                    "https://www.scmp.com/news/china-future-tech?module=sub_section_menu&pgtype=section",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/news/hong-kong/", "/news/china-future-tech/"],
            },
            {
                "name": "HKTDC Research",
                "domain": "hktdc.com",
                "start_urls": [
                    "https://research.hktdc.com/en/data-and-profiles/market-profiles/hong-kong",
                    "https://research.hktdc.com/en/analysis-and-news/analysis",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/data-and-profiles/market-profiles/hong-kong",
                    "/en/analysis-and-news/",
                ],
            },
        ],
        "competitor": [
            {
                "name": "PwC Hong Kong",
                "domain": "pwchk.com",
                "start_urls": [
                    "https://www.pwchk.com/en/research-and-insights.html",
                    "https://www.pwchk.com/en/publications.html",
                    "https://www.pwchk.com/en/press-room.html",
                    "https://www.pwchk.com/en/press-room/press-releases.html",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/research-and-insights",
                    "/en/publications",
                    "/en/press-room",
                ],
            },
            {
                "name": "TMF Group",
                "domain": "tmf-group.com",
                "start_urls": [
                    "https://www.tmf-group.com/en/news-insights/",
                    "https://www.tmf-group.com/en/news-insights/?filters=994",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/news-insights/",
                    "/en/locations/asia-pacific/hong-kong/",
                ],
            },
            {
                "name": "Acclime Hong Kong",
                "domain": "acclime.com",
                "start_urls": [
                    "https://hongkong.acclime.com/news-insights/",
                    "https://hongkong.acclime.com/category/news/",
                    "https://hongkong.acclime.com/category/insights/",
                    "https://hongkong.acclime.com/category/press-release/",
                    "https://hongkong.acclime.com/downloads/",
                ],
                "sitemap_urls": [],
                "allow_patterns": ["/news-insights/", "/downloads/"],
            },
        ],
        "evergreen": [
            {
                "name": "Companies Registry Guides",
                "domain": "cr.gov.hk",
                "start_urls": [
                    "https://www.cr.gov.hk/en/services/register-company.htm",
                    "https://www.cr.gov.hk/en/services/running-company.htm",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/services/register-company",
                    "/en/services/running-company",
                    "/en/services/company",
                ],
            },
            {
                "name": "IRD Business Tax Guides",
                "domain": "ird.gov.hk",
                "start_urls": [
                    "https://www.ird.gov.hk/eng/tax/bus.htm",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/eng/tax/",
                ],
            },
            {
                "name": "InvestHK Setting Up Guides",
                "domain": "investhk.gov.hk",
                "start_urls": [
                    "https://www.investhk.gov.hk/en/setting-up/",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/en/setting-up/",
                ],
            },
            {
                "name": "Immigration Department Visa Guides",
                "domain": "immd.gov.hk",
                "start_urls": [
                    "https://www.immd.gov.hk/eng/services/visas/investment.html",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/eng/services/visas/",
                ],
            },
            {
                "name": "Acclime Hong Kong Guides",
                "domain": "acclime.com",
                "start_urls": [
                    "https://hongkong.acclime.com/guides/",
                    "https://hongkong.acclime.com/downloads/",
                ],
                "sitemap_urls": [],
                "allow_patterns": [
                    "/guides/",
                    "/downloads/",
                ],
            },
        ],
    }
}


BLOCK_PATTERNS = [
    "mailto:", "tel:", "javascript:", "/login", "/contact", "/careers", "/privacy",
    "/terms", "/cookie", "/sitemap", "/search", "/subscribe", "/newsletter",
    "/author/", "/tag/", "#", ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
    ".zip", ".doc", ".docx", ".xls", ".xlsx",
]

def clean_text(value):
    return " ".join(str(value or "").split()).strip()


def sha256(value):
    return hashlib.sha256(str(value or "").encode("utf-8", errors="ignore")).hexdigest()


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")


def source_matches_filter(source):
    if not ONLY_SOURCES:
        return True
    aliases = {
        clean_text(source.get("name")).lower(),
        clean_text(source.get("domain")).lower(),
        slug(source.get("name")),
        slug(source.get("domain")),
    }
    for url in list(source.get("start_urls") or []) + list(source.get("sitemap_urls") or []):
        aliases.add(domain_from_url(url).lower())
    return any(token in aliases or slug(token) in aliases for token in ONLY_SOURCES)


def parse_input_date(value):
    return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def parse_any_date(value):
    value = clean_text(value)
    if not value:
        return None
    try:
        parsed = date_parser.parse(value, fuzzy=True)
        if not parsed.tzinfo:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def iso_date(value):
    return value.astimezone(timezone.utc).isoformat() if value else ""


def same_domain(url, domain):
    host = urlparse(url).netloc.lower()
    domain = domain.lower()
    return host == domain or host.endswith("." + domain)


def normalize_url(url, base_url=None):
    if base_url:
        url = urljoin(base_url, url)
    url, _fragment = urldefrag(url)
    return url.strip()


def is_blocked_url(url):
    lower = url.lower()
    parsed = urlparse(url)
    if parsed.netloc.lower().endswith("pwchk.com") and "icid=footer" in parsed.query.lower():
        return True
    return any(pattern.lower() in lower for pattern in BLOCK_PATTERNS)


def allowed_by_patterns(url, allow_patterns):
    if not allow_patterns:
        return True
    lower = url.lower()
    return any(pattern.lower() in lower for pattern in allow_patterns)


def is_content_detail_url(url, source, topic):
    parsed = urlparse(url)
    path = parsed.path.rstrip("/").lower()
    bucket = TOPIC_BUCKETS.get(topic, topic)

    if not path or path in {"", "/"}:
        return False

    if source.get("domain") == "acra.gov.sg":
        if bucket == "government_updates":
            return path.startswith("/news-events/news-announcements/") and path != "/news-events/news-announcements"
        if bucket == "evergreen":
            acra_evergreen_listing_paths = {
                "/manage",
                "/manage/companies",
                "/manage/companies/overview",
                "/manage/limited-liability-partnerships",
                "/manage/limited-liability-partnerships/overview",
                "/manage/limited-partnerships",
                "/manage/limited-partnerships/overview",
                "/manage/sole-proprietorship-partnerships",
                "/manage/sole-proprietorship-partnerships/overview",
            }
            if path in acra_evergreen_listing_paths:
                return False
            return any(path.startswith(token) for token in [
                "/manage/companies/",
                "/manage/limited-liability-partnerships/",
                "/manage/limited-partnerships/",
                "/manage/sole-proprietorship-partnerships/",
            ])
        return False

    if source.get("domain") == "iras.gov.sg":
        iras_listing_paths = {
            "/latest-updates",
            "/taxes",
            "/schemes",
            "/quick-links",
            "/taxes/individual-income-tax",
            "/taxes/corporate-income-tax",
            "/taxes/goods-services-tax-(gst)",
            "/taxes/property-tax",
            "/taxes/stamp-duty",
        }
        if path in iras_listing_paths:
            return False
        return any(token in path for token in ["/taxes/", "/news-events/", "/schemes/", "/quick-links/"])

    if source.get("domain") == "mom.gov.sg":
        mom_listing_paths = {
            "/newsroom",
            "/newsroom/press-releases",
            "/newsroom/announcements",
            "/newsroom/speeches",
            "/newsroom/press-replies",
            "/newsroom/parliament-questions-and-replies",
            "/newsroom/fact-checks",
            "/newsroom/mom-statements",
            "/newsroom/media-articles",
        }
        if path in mom_listing_paths:
            return False
        return path.startswith("/newsroom/")

    if source.get("domain") == "mfa.gov.sg":
        mfa_listing_paths = {
            "/newsroom",
            "/newsroom/press-statements-transcripts-and-photos",
            "/newsroom/announcements-and-highlights",
        }
        if path in mfa_listing_paths:
            return False
        return path.startswith("/newsroom/press-statements-transcripts-and-photos/") or path.startswith("/newsroom/announcements-and-highlights/")

    if source.get("domain") == "gov.sg":
        gov_listing_paths = {
            "/explainers",
            "/features",
            "/profile-stories",
            "/resources",
            "/search",
            "/parliament",
        }
        if path in gov_listing_paths:
            return False
        return any(token in path for token in ["/explainers/", "/features/", "/profile-stories/", "/budget2026/", "/parliament/", "/stopvaping"])

    if source.get("domain") == "businesstimes.com.sg":
        blocked_prefixes = (
            "/search",
            "/events-awards/",
            "/paid-press-release/",
            "/companies-markets/market-statistics",
        )
        if path in {"/singapore", "/companies-markets", "/property", "/esg", "/international"}:
            return False
        if any(path.startswith(prefix) for prefix in blocked_prefixes):
            return False
        return len([part for part in path.split("/") if part]) >= 2

    if source.get("domain") == "straitstimes.com":
        straits_listing_paths = {
            "/singapore",
            "/singapore/housing",
            "/singapore/health",
            "/singapore/transport",
            "/singapore/parenting-education",
            "/singapore/politics",
            "/singapore/jobs",
            "/singapore/environment",
            "/singapore/courts-crime",
            "/singapore/community",
            "/business",
            "/business/banking",
            "/business/companies-markets",
            "/business/economy",
            "/business/invest",
            "/business/property",
        }
        if path in straits_listing_paths:
            return False
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2:
            return False
        if parts[0] == "singapore":
            return len(parts) >= 2 and "-" in parts[-1]
        if parts[0] == "business":
            return len(parts) >= 2 and "-" in parts[-1]
        return False

    if source.get("domain") == "scmp.com":
        return "/article/" in path

    if source.get("domain") == "immd.gov.hk":
        if path in {"/eng/press/press_releases.html"}:
            return False
        return path.startswith("/eng/press/") and path.endswith((".html", ".htm"))

    if source.get("domain") == "info.gov.hk":
        if path.endswith("/today.htm") or path.endswith("/today.html"):
            return False
        if re.match(r"^/gia/general/\d{6}/\d{2}\.html?$", path):
            return False
        return path.startswith("/gia/general/") and path.endswith((".htm", ".html"))

    if source.get("domain") == "investhk.gov.hk":
        if path in {"/en/news", "/en/news/", "/en/events", "/en/events/"}:
            return False
        return path.startswith("/en/news/") or path.startswith("/en/events/")

    if source.get("domain") == "ird.gov.hk":
        if path == "/eng/new/index.htm":
            return True
        if path in {"/eng/ppr/pre_rpr.htm"}:
            return False
        return path.startswith("/eng/new/") or path.startswith("/eng/ppr/")

    if source.get("domain") == "labour.gov.hk":
        if path == "/eng/news/highlights.php":
            return True
        listing_paths = {
            "/eng/news/content.htm",
            "/eng/major/content.php",
        }
        if path in listing_paths:
            return False
        return path.startswith("/eng/news/") or path.startswith("/eng/major/")

    if source.get("domain") == "cr.gov.hk":
        listing_paths = {
            "/en/about/news/highlights.htm",
            "/en/about/corp-info/event.htm",
            "/en/consolidated-annual-open-data-plans/index.htm",
        }
        if path in listing_paths:
            return False
        return path.startswith("/en/about/news/") or path.startswith("/en/about/corp-info/") or path.startswith("/en/consolidated-annual-open-data-plans/")

    if source.get("domain") == "hktdc.com":
        hktdc_listing_paths = {
            "/en/data-and-profiles/market-profiles/hong-kong",
            "/en/analysis-and-news/analysis",
        }
        if path in hktdc_listing_paths:
            return False
        return path.startswith("/en/analysis-and-news/") or path.startswith("/en/data-and-profiles/")

    if source.get("domain") == "pwchk.com":
        pwc_listing_paths = {
            "/en/research-and-insights.html",
            "/en/publications.html",
            "/en/press-room.html",
            "/en/press-room/press-releases.html",
            "/en/research-and-insights",
            "/en/publications",
            "/en/press-room",
            "/en/press-room/press-releases",
            "/en/research-and-insights/digital-assets.html",
            "/en/research-and-insights/greater-bay-area.html",
            "/en/press-room/press-release-chi.html",
        }
        if path in pwc_listing_paths:
            return False
        if "_jcr_content" in path or path.endswith(".dynamic.html"):
            return False
        if path.startswith("/en/press-room/press-releases/"):
            return bool(re.search(r"/pr-\d+\.html$", path, re.I))
        return path.startswith("/en/research-and-insights/") or path.startswith("/en/publications/") or path.startswith("/en/press-room/")

    if source.get("domain") == "tmf-group.com":
        tmf_listing_paths = {
            "/en/news-insights",
            "/en/news-insights/",
            "/en/locations/asia-pacific/hong-kong",
            "/en/locations/asia-pacific/hong-kong/",
        }
        if path in tmf_listing_paths:
            return False
        return path.startswith("/en/news-insights/")

    if source.get("domain") == "acclime.com" and "hongkong.acclime.com" in parsed.netloc.lower():
        acclime_listing_paths = {
            "/news-insights",
            "/news-insights/",
            "/downloads",
            "/downloads/",
        }
        if path in acclime_listing_paths:
            return False
        return path.startswith("/news-insights/") or path.startswith("/downloads/")

    if source.get("domain") == "edb.gov.sg":
        edb_listing_paths = {
            "/en/about-edb/media-releases-publications.html",
            "/en/news-and-events.html",
            "/en/business-insights.html",
            "/en/business-insights/insights.html",
            "/en/business-insights/market-and-industry-reports.html",
            "/en/business-insights/business-guides.html",
            "/en/about-edb/media-releases-publications/corporate-news.html",
            "/en/about-edb/media-releases-publications/industry-news.html",
            "/en/about-edb/media-releases-publications/corporate-reports.html",
            "/en/about-edb/media-releases-publications/manufacturing-statistics.html",
        }
        if path in edb_listing_paths:
            return False
        return path.endswith(".html") and any(path.startswith(token) for token in [
            "/en/about-edb/media-releases-publications/",
            "/en/news-and-events/",
            "/en/our-industries/",
            "/en/business-insights/",
        ])

    listing_endings = {
        "/news",
        "/newsroom",
        "/news-events",
        "/news-announcements",
        "/insights",
        "/resources",
        "/guides",
        "/articles",
        "/singapore",
        "/business",
    }
    if path in listing_endings or any(path.endswith(item) for item in listing_endings):
        return False

    if bucket == "government_updates":
        return any(token in path for token in ["/news", "/newsroom", "/news-events", "/article", "/press", "/media"])
    if bucket == "news":
        return any(token in path for token in ["/singapore/", "/business/", "/news/", "/companies-markets/", "/international/"])
    if bucket == "competitor":
        if source.get("allow_patterns") and not allowed_by_patterns(url, source.get("allow_patterns", [])):
            return False
        return any(token in path for token in [
            "/blog",
            "/category/",
            "/case-studies/",
            "/downloads/",
            "/events/",
            "/media/",
            "/insights/",
            "/insights-and-guides",
            "/insights-news/",
            "/news-insights/",
            "/news/",
            "/guides/",
            "/articles/",
            "/resources/",
            "/knowledge-hub/",
            "/singapore/",
            "/sg/",
        ])
    if bucket == "evergreen":
        return any(token in path for token in ["/guides/", "/resources/", "/how-to", "/faq", "/explainer"])
    return False


def in_date_range(published_at, from_date, to_date):
    if not published_at:
        return True
    return from_date <= published_at <= to_date


def fetch_url(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    response = requests.get(url, headers=headers, timeout=25, allow_redirects=True)
    response.raise_for_status()
    return response.text, response.url, response.headers.get("content-type", "")


def is_incapsula_block_page(html):
    text = html[:2000].lower()
    return "_incapsula_resource" in text or "request unsuccessful. incapsula incident id" in text


def is_pwc_dynamic_listing_shell(html):
    text = str(html or "")
    return (
        "{{item.publishDate}}" in text
        or "{{item.title}}" in text
        or "{{contentList.loadingText}}" in text
        or "Loading Results" in text and "No Match Found" in text
    )


def find_edge_executable():
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return "msedge"


def ensure_edge_cdp_running():
    try:
        requests.get(f"{PLAYWRIGHT_CDP_URL.rstrip('/')}/json/version", timeout=2)
        return
    except Exception:
        pass

    edge_path = find_edge_executable()
    args = [
        edge_path,
        "--remote-debugging-port=9223",
        f"--user-data-dir={PLAYWRIGHT_EDB_PROFILE_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
    ]
    subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(5)


def close_known_ad_overlays(page, url):
    domain = domain_from_url(url)
    if domain != "businesstimes.com.sg":
        return

    selectors = [
        '#dfp-ad-prestitial button',
        '#dfp-ad-prestitial [role="button"]',
        '[id*="prestitial" i] button',
        '[id*="prestitial" i] [role="button"]',
        'button[aria-label*="close" i]',
        'button[title*="close" i]',
        '[role="button"][aria-label*="close" i]',
        '.close',
        '.close-button',
        '.modal-close',
        '.popup-close',
        '[class*="close" i]',
    ]
    for _attempt in range(3):
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                if locator.count() and locator.is_visible(timeout=500):
                    locator.click(timeout=1000)
                    page.wait_for_timeout(1000)
                    return
            except Exception:
                continue

    try:
        page.evaluate(
            """
            () => {
              const selectors = [
                '#dfp-ad-prestitial',
                '[id*="prestitial" i]',
                '[data-placement*="prestitial" i]',
                '[data-slot-name*="prestitial" i]',
                'iframe[src*="sensic.net"]'
              ];
              for (const selector of selectors) {
                document.querySelectorAll(selector).forEach((node) => node.remove());
              }
              document.documentElement.style.overflow = 'auto';
              document.body.style.overflow = 'auto';
              document.body.style.position = 'static';
            }
            """
        )
        page.wait_for_timeout(500)
    except Exception:
        pass


def fetch_rendered_html(url):
    if not USE_PLAYWRIGHT_EDB:
        return "", url, ""
    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:
        print(f"  Playwright unavailable: {error}")
        return "", url, ""

    try:
        with sync_playwright() as playwright:
            browser = None
            if PLAYWRIGHT_EDB_MODE != "headless":
                ensure_edge_cdp_running()
                browser = playwright.chromium.connect_over_cdp(PLAYWRIGHT_CDP_URL)
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                rendered_type = "text/html; rendered=playwright-cdp"
            else:
                context = playwright.chromium.launch_persistent_context(
                    PLAYWRIGHT_EDB_PROFILE_DIR,
                    headless=True,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                    locale="en-US",
                )
                rendered_type = "text/html; rendered=playwright-headless"
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            close_known_ad_overlays(page, url)
            page.wait_for_timeout(PLAYWRIGHT_EDB_WAIT_MS)
            close_known_ad_overlays(page, page.url)
            html = page.content()
            final_url = page.url
            page.close()
            if browser:
                browser.close()
            else:
                context.close()
            return html, final_url, rendered_type
    except Exception as error:
        print(f"  Playwright fetch failed: {url} | {error}")
        return "", url, ""


def fetch_headless_html(url):
    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:
        print(f"  Playwright unavailable: {error}")
        return "", url, ""

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                locale="en-US",
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(PLAYWRIGHT_HEADLESS_WAIT_MS)
            html = page.content()
            final_url = page.url
            browser.close()
            return html, final_url, "text/html; rendered=headless-playwright"
    except Exception as error:
        print(f"  Headless Playwright fetch failed: {url} | {error}")
        return "", url, ""


def fetch_url_with_render_fallback(url, source=None):
    try:
        html, final_url, content_type = fetch_url(url)
    except Exception as error:
        if source and source.get("domain") == "edb.gov.sg":
            print(f"  EDB requests fetch failed, trying Playwright: {url} | {error}")
            rendered_html, rendered_url, rendered_type = fetch_rendered_html(url)
            if rendered_html:
                return rendered_html, rendered_url, rendered_type
        if source and source.get("domain") == "pwchk.com":
            print(f"  PwC requests fetch failed, trying headless Playwright: {url} | {error}")
            rendered_html, rendered_url, rendered_type = fetch_headless_html(url)
            if rendered_html:
                return rendered_html, rendered_url, rendered_type
        raise
    if source and source.get("domain") == "edb.gov.sg" and is_incapsula_block_page(html):
        print(f"  Requests blocked by Incapsula, trying Playwright: {url}")
        rendered_html, rendered_url, rendered_type = fetch_rendered_html(url)
        if rendered_html and not is_incapsula_block_page(rendered_html):
            return rendered_html, rendered_url, rendered_type
    return html, final_url, content_type


def get_collection():
    if not MONGO_URI:
        print("MongoDB disabled: MONGO_URI is empty. Files will still be written.")
        return None, None

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=15000)
    client.admin.command("ping")
    collection = client[MONGO_DB][MONGO_COLLECTION]
    collection.create_index([("urlHash", ASCENDING)], unique=True, sparse=True)
    collection.create_index([("contentHash", ASCENDING)], sparse=True)
    collection.create_index([("country", ASCENDING), ("type", ASCENDING), ("sourceDomain", ASCENDING)])
    collection.create_index([("recordType", ASCENDING), ("intelligenceBucket", ASCENDING), ("isActive", ASCENDING)])
    collection.create_index([("publishedAt", ASCENDING)])
    collection.create_index([("title", "text"), ("summary", "text")])
    return client, collection


def storage_article(article):
    return {
        key: value
        for key, value in article.items()
        if key not in TRANSIENT_ARTICLE_FIELDS and key not in DEPRECATED_STORAGE_FIELDS
    }


def cleanup_deprecated_fields(collection, document_id):
    if not DEPRECATED_STORAGE_FIELDS:
        return 0
    result = collection.update_one(
        {"_id": document_id},
        {"$unset": {field: "" for field in DEPRECATED_STORAGE_FIELDS}},
    )
    return result.modified_count


def insert_if_new(collection, article):
    if collection is None:
        return "file_only"

    now = datetime.now(timezone.utc).isoformat()
    stored_article = storage_article(article)
    document = {
        **stored_article,
        "createdAt": now,
        "updatedAt": now,
        "ingestStatus": "inserted",
    }

    existing_by_url = collection.find_one({"urlHash": article.get("urlHash")})
    if existing_by_url:
        changed_fields = {}
        comparable_fields = [
            "contentHash",
            "title",
            "summary",
            "content",
            "publishedAt",
            "canonicalUrl",
            "dateFallbackUsed",
            "announcementType",
            "audience",
            "newsTopic",
            "categoryHints",
            "tags",
        ]
        for key in comparable_fields:
            if stored_article.get(key) != existing_by_url.get(key):
                changed_fields[key] = stored_article.get(key)

        if changed_fields:
            collection.update_one(
                {"_id": existing_by_url["_id"]},
                {
                    "$set": {
                        **stored_article,
                        "createdAt": existing_by_url.get("createdAt", now),
                        "updatedAt": now,
                        "lastScrapedAt": now,
                        "ingestStatus": "updated",
                    },
                    "$unset": {field: "" for field in DEPRECATED_STORAGE_FIELDS},
                },
            )
            return "updated"

        metadata_fields = {
            key: article.get(key)
            for key in ["announcementType", "audience", "newsTopic", "categoryHints", "tags"]
            if article.get(key)
        }
        if metadata_fields:
            result = collection.update_one(
                {
                    "_id": existing_by_url["_id"],
                    "$or": [
                        {"categoryHints": {"$exists": False}},
                        {"categoryHints": []},
                    ],
                },
                {
                    "$set": {
                        **metadata_fields,
                        "metadataEnrichedAt": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )
            if result.modified_count:
                return "enriched_duplicate"
        if cleanup_deprecated_fields(collection, existing_by_url["_id"]):
            return "cleaned_duplicate"
        return "duplicate"

    existing_by_content = collection.find_one({"contentHash": article.get("contentHash")}, {"_id": 1})
    if existing_by_content:
        return "duplicate"

    try:
        collection.insert_one(document)
        return "inserted"
    except DuplicateKeyError:
        return "duplicate"


def build_dynamic_source(country, topic, raw_value):
    domain, start_url = normalize_custom_source_url(raw_value)
    if not domain or not start_url:
        return None
    label = domain.split(".")[0].replace("-", " ").title()
    return {
        "name": label,
        "domain": domain,
        "start_urls": [start_url],
        "sitemap_urls": [f"https://{domain}/sitemap.xml"],
        "allow_patterns": [],
        "custom": True,
    }


def effective_sources():
    merged = {
        country: {
            topic: list(source_list or [])
            for topic, source_list in (topics or {}).items()
        }
        for country, topics in SOURCES.items()
    }

    for country, topics in (SOURCE_DOMAINS_BY_COUNTRY or {}).items():
        country_name = str(country or "").strip()
        if not country_name or not isinstance(topics, dict):
            continue
        country_entry = merged.setdefault(country_name, {"news": [], "govt": [], "competitor": [], "evergreen": []})
        for topic, values in topics.items():
            topic_key = str(topic or "").strip().lower()
            if topic_key not in TOPIC_BUCKETS:
                continue
            topic_entry = country_entry.setdefault(topic_key, [])
            existing_domains = {
                normalize_source_config(item).get("domain")
                for item in topic_entry
                if isinstance(item, dict)
            }
            for raw_value in values if isinstance(values, list) else []:
                source = build_dynamic_source(country_name, topic_key, raw_value)
                if not source or source["domain"] in existing_domains:
                    continue
                existing_domains.add(source["domain"])
                topic_entry.append(source)
    return merged


def load_existing_url_hashes():
    hashes = set()
    try:
        if MASTER_OUTPUT_JSON.exists():
            items = json.loads(MASTER_OUTPUT_JSON.read_text(encoding="utf-8"))
            hashes.update(
                item.get("urlHash")
                for item in items
                if isinstance(item, dict) and item.get("urlHash")
            )
    except Exception:
        pass

    if MONGO_URI:
        client = None
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=15000)
            collection = client[MONGO_DB][MONGO_COLLECTION]
            for item in collection.find({"urlHash": {"$exists": True, "$ne": ""}}, {"_id": 0, "urlHash": 1}):
                hashes.add(item.get("urlHash"))
        except Exception as error:
            print(f"Existing URL hash preload skipped: {error}")
        finally:
            if client is not None:
                client.close()

    return hashes


def existing_url_hash(url):
    return sha256(normalize_url(url))


def url_already_scraped(url, collection=None):
    url_hash = existing_url_hash(url)
    if url_hash in LOCAL_EXISTING_URL_HASHES:
        return True
    if collection is None:
        return False
    try:
        return collection.find_one({"urlHash": url_hash}, {"_id": 1}) is not None
    except Exception:
        return False


def parse_sitemap_index_xml(xml_text, source):
    sitemap_urls = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return sitemap_urls

    if not root.tag.lower().endswith("sitemapindex"):
        return sitemap_urls

    namespace = ""
    if root.tag.startswith("{"):
        namespace = root.tag.split("}")[0] + "}"

    for sitemap_node in root.findall(f".//{namespace}sitemap"):
        loc_node = sitemap_node.find(f"{namespace}loc")
        if loc_node is None or not loc_node.text:
            continue
        url = normalize_url(loc_node.text)
        if same_domain(url, source["domain"]) and not is_blocked_url(url):
            sitemap_urls.append(url)
    return list(dict.fromkeys(sitemap_urls))


def parse_sitemap_xml(xml_text, source, from_date, to_date):
    urls = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return urls

    namespace = ""
    if root.tag.startswith("{"):
        namespace = root.tag.split("}")[0] + "}"

    for url_node in root.findall(f".//{namespace}url"):
        loc_node = url_node.find(f"{namespace}loc")
        lastmod_node = url_node.find(f"{namespace}lastmod")
        if loc_node is None or not loc_node.text:
            continue

        url = normalize_url(loc_node.text)
        if source.get("domain") == "acra.gov.sg" and url.rstrip("/") == "https://www.acra.gov.sg/news-events/news-announcements":
            continue
        if not same_domain(url, source["domain"]):
            continue
        if is_blocked_url(url):
            continue
        if not allowed_by_patterns(url, source.get("allow_patterns", [])):
            continue

        lastmod = parse_any_date(lastmod_node.text if lastmod_node is not None else "")
        if lastmod and not in_date_range(lastmod, from_date, to_date):
            continue
        urls.append(url)

    return list(dict.fromkeys(urls))


def discover_from_sitemaps(source, from_date, to_date):
    found = []
    pending = list(source.get("sitemap_urls", []))
    seen_sitemaps = set()

    while pending and len(found) < MAX_SITEMAP_URLS_PER_SOURCE:
        sitemap_url = pending.pop(0)
        if sitemap_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap_url)

        try:
            print(f"  Sitemap: {sitemap_url}")
            xml_text, _final_url, _content_type = fetch_url(sitemap_url)
            nested_sitemaps = parse_sitemap_index_xml(xml_text, source)
            if nested_sitemaps:
                pending.extend(url for url in nested_sitemaps if url not in seen_sitemaps)
                time.sleep(REQUEST_DELAY_SECONDS)
                continue

            found.extend(parse_sitemap_xml(xml_text, source, from_date, to_date))
            time.sleep(REQUEST_DELAY_SECONDS)
        except Exception as error:
            print(f"  Sitemap failed: {sitemap_url} | {error}")
    return list(dict.fromkeys(found))[:MAX_SITEMAP_URLS_PER_SOURCE]


def discover_from_html(html, base_url, source, from_date=None, to_date=None):
    if source.get("domain") == "businesstimes.com.sg" and "/search" in base_url:
        return discover_business_times_search_links(base_url, source, from_date, to_date)
    if source.get("domain") == "acra.gov.sg" and "/news-events/news-announcements" in base_url:
        return discover_acra_announcement_links(html, base_url)
    if source.get("domain") == "iras.gov.sg" and "/latest-updates" in base_url:
        return discover_iras_latest_update_links(html, base_url)
    if source.get("domain") == "mom.gov.sg" and "/newsroom/" in base_url:
        return discover_mom_newsroom_links(html, base_url)
    if source.get("domain") == "mfa.gov.sg" and "/newsroom/" in base_url:
        return discover_mfa_newsroom_links(html, base_url)
    if source.get("domain") == "info.gov.hk" and "/gia/general/" in base_url:
        return discover_info_gov_press_links(html, base_url)
    if source.get("domain") == "immd.gov.hk" and "/eng/press/press_releases" in base_url:
        return discover_immd_press_release_links(html, base_url)
    if source.get("domain") == "pwchk.com":
        return discover_pwc_hk_links(html, base_url, source)
    if source.get("domain") == "edb.gov.sg":
        return discover_edb_links(html, base_url, source)

    soup = BeautifulSoup(html, "html.parser")
    links = []
    for tag in soup.select("a[href]"):
        href = tag.get("href")
        if not href:
            continue
        url = normalize_url(href, base_url)
        if is_blocked_url(url):
            continue
        if not same_domain(url, source["domain"]):
            continue
        if not allowed_by_patterns(url, source.get("allow_patterns", [])):
            continue
        if source.get("domain") != "straitstimes.com" or is_content_detail_url(url, source, "news"):
            links.append(url)
    return list(dict.fromkeys(links))


def discover_pwc_hk_links(html, base_url, source):
    links = []
    is_press_release_listing = "/press-room/press-releases" in urlparse(base_url).path.lower()

    def add_link(url):
        if is_blocked_url(url):
            return
        if not same_domain(url, source["domain"]):
            return
        if not allowed_by_patterns(url, source.get("allow_patterns", [])):
            return
        if not is_content_detail_url(url, source, "competitor"):
            return
        if is_press_release_listing and not re.search(r"/en/press-room/press-releases/pr-\d+\.html$", urlparse(url).path, re.I):
            return
        links.append(url)

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select("a[href]"):
        url = normalize_url(tag.get("href"), base_url)
        add_link(url)

    # PwC listing pages are hydrated client-side. Depending on the response,
    # URLs may be embedded in script/config JSON before becoming anchor tags.
    for match in re.finditer(r"/en/(?:research-and-insights|publications|press-room)/[^\"'\\<>\s]+", html):
        url = normalize_url(match.group(0).replace("\\/", "/"), base_url)
        url = url.rstrip(".,);")
        add_link(url)

    decoded_html = str(html or "")
    try:
        decoded_html = decoded_html.encode("utf-8", errors="ignore").decode("unicode_escape")
    except Exception:
        pass
    decoded_html = decoded_html.replace("\\/", "/").replace("\\u002D", "-").replace("\\u002d", "-")
    for pattern in [
        r"https?://www\.pwchk\.com/en/(?:research-and-insights|publications|press-room)/[^\"'\\<>\s]+?\.html",
        r"/en/(?:research-and-insights|publications|press-room)/[^\"'\\<>\s]+?\.html",
    ]:
        for match in re.finditer(pattern, decoded_html, re.I):
            url = normalize_url(match.group(0), base_url).rstrip(".,);")
            add_link(url)

    return list(dict.fromkeys(links))


def discover_edb_links(html, base_url, source):
    links = []
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select("a[href]"):
        url = normalize_url(tag.get("href"), base_url)
        if is_blocked_url(url):
            continue
        if not same_domain(url, source["domain"]):
            continue
        if not allowed_by_patterns(url, source.get("allow_patterns", [])):
            continue
        if is_content_detail_url(url, source, "govt"):
            links.append(url)

    # EDB pages often hydrate cards from escaped/embedded HTML or JSON, so scan
    # the raw response too instead of relying only on rendered anchor tags.
    for match in re.finditer(r"/en/(?:about-edb/media-releases-publications|news-and-events|our-industries|business-insights)/[^\"'\\<>\s]+", html):
        url = normalize_url(match.group(0).replace("\\/", "/"), base_url)
        url = url.rstrip(".,);")
        if is_blocked_url(url):
            continue
        if same_domain(url, source["domain"]) and allowed_by_patterns(url, source.get("allow_patterns", [])) and is_content_detail_url(url, source, "govt"):
            links.append(url)

    return list(dict.fromkeys(links))


def discover_acra_announcement_links(html, base_url):
    links = []
    pattern = r"/news-events/news-announcements/[^\"'\\<\s]+"
    for match in re.finditer(pattern, html):
        url = normalize_url(match.group(0).rstrip("\\/") + "/", base_url)
        if url.rstrip("/") == "https://www.acra.gov.sg/news-events/news-announcements":
            continue
        if is_blocked_url(url):
            continue
        links.append(url)
    return list(dict.fromkeys(links))


def discover_iras_latest_update_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for item in soup.select(".eyd-article-item--updates"):
        link = item.select_one("h3 a[href]")
        if not link:
            continue
        url = normalize_url(link.get("href"), base_url)
        if is_blocked_url(url):
            continue
        date_text = extract_meta_content(item, [".eyd-article-item__meta--date"])
        parsed_date = parse_any_date(date_text)
        if parsed_date:
            IRAS_LATEST_UPDATE_DATES[url.rstrip("/")] = parsed_date
        links.append(url)
    return list(dict.fromkeys(links))


def discover_mom_newsroom_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for item in soup.select("section.item-listing article"):
        link = item.select_one("h3.item-title a[href], a[href]")
        if not link:
            continue
        url = normalize_url(link.get("href"), base_url)
        if is_blocked_url(url):
            continue
        date_text = extract_meta_content(item, ["time", ".article-meta time", ".article-meta"])
        parsed_date = parse_any_date(date_text)
        if parsed_date:
            MOM_NEWSROOM_DATES[url.rstrip("/")] = parsed_date
        links.append(url)
    return list(dict.fromkeys(links))


def discover_mfa_newsroom_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    is_singapore_filtered_listing = "Singapore" in base_url or "Singapore" in unquote(base_url)
    for tag in soup.select('a[href*="/newsroom/press-statements-transcripts-and-photos/"], a[href*="/newsroom/announcements-and-highlights/"]'):
        url = normalize_url(tag.get("href"), base_url)
        if is_blocked_url(url):
            continue
        if is_singapore_filtered_listing:
            MFA_SINGAPORE_URLS.add(url.rstrip("/"))
        text = clean_text(tag.get_text(" ", strip=True))
        date_match = re.search(r"\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b", text)
        if date_match:
            parsed_date = parse_any_date(date_match.group(1))
            if parsed_date:
                MFA_NEWSROOM_DATES[url.rstrip("/")] = parsed_date
        links.append(url)
    return list(dict.fromkeys(links))


def discover_immd_press_release_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for row in soup.select("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        date_text = clean_text(cells[0].get_text(" ", strip=True))
        parsed_date = parse_any_date(date_text)
        for tag in row.select('a[href*="/eng/press/press-releases/"], a[href*="press-releases/"]'):
            url = normalize_url(tag.get("href"), base_url)
            if is_blocked_url(url) or not same_domain(url, "immd.gov.hk"):
                continue
            if parsed_date:
                IMMD_PRESS_RELEASE_DATES[url.rstrip("/")] = parsed_date
            links.append(url)

    if not links:
        for tag in soup.select('a[href*="/eng/press/press-releases/"], a[href*="press-releases/"]'):
            url = normalize_url(tag.get("href"), base_url)
            if is_blocked_url(url) or not same_domain(url, "immd.gov.hk"):
                continue
            links.append(url)

    return list(dict.fromkeys(links))


def info_gov_date_from_listing_url(base_url):
    match = re.search(r"/gia/general/(\d{4})(\d{2})/(\d{2})\.html?$", urlparse(base_url).path, re.I)
    if not match:
        return None
    year, month, day = match.groups()
    return parse_any_date(f"{year}-{month}-{day}")


def discover_info_gov_press_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    listing_date = info_gov_date_from_listing_url(base_url)
    links = []
    for tag in soup.select('a[href*="/gia/general/"]'):
        url = normalize_url(tag.get("href"), base_url)
        if is_blocked_url(url) or not same_domain(url, "info.gov.hk"):
            continue
        if not re.search(r"/gia/general/\d{6}/\d{2}/[^/]+\.html?$", urlparse(url).path, re.I):
            continue
        if listing_date:
            INFO_GOV_PRESS_DATES[url.rstrip("/")] = listing_date
        links.append(url)
    return list(dict.fromkeys(links))


def discover_business_times_search_links(base_url, source, from_date=None, to_date=None):
    parsed = urlparse(base_url)
    query_match = re.search(r"(?:^|[?&])query=([^&]+)", base_url)
    base_query = unquote(query_match.group(1)).replace("+", " ").strip() if query_match else "singapore"
    queries = list(dict.fromkeys([base_query, *BUSINESS_TIMES_SEARCH_QUERIES]))
    links = []

    for query in queries:
        old_result_streak = 0
        last_old_date = None
        for endindex in range(0, MAX_DISCOVERED_LINKS_PER_SOURCE, 10):
            print(f"  Business Times API: query='{query}' offset={endindex}", flush=True)
            response = requests.get(
                f"{parsed.scheme}://{parsed.netloc}/_plat/api/v1/queryly-search",
                params={"query": query, "endindex": endindex, "batchsize": 10, "sort": "date"},
                headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
                timeout=BUSINESS_TIMES_SEARCH_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            items = response.json().get("items", [])
            if not items:
                break
            page_has_in_range_result = False
            for item in items:
                url = normalize_url(item.get("link", ""), base_url)
                if not same_domain(url, "businesstimes.com.sg"):
                    continue
                if not allowed_by_patterns(url, source.get("allow_patterns", [])):
                    continue
                parsed_date = parse_any_date(item.get("pubdate", ""))
                if parsed_date:
                    BUSINESS_TIMES_SEARCH_DATES[url.rstrip("/")] = parsed_date
                    if from_date and parsed_date < from_date:
                        old_result_streak += 1
                        last_old_date = parsed_date
                        continue
                    if to_date and parsed_date > to_date:
                        continue
                    page_has_in_range_result = True
                links.append(url)
                if len(dict.fromkeys(links)) >= MAX_PAGES_PER_SOURCE:
                    print(f"  Business Times search collected required links: {MAX_PAGES_PER_SOURCE}")
                    return list(dict.fromkeys(links))
            if from_date and old_result_streak >= 10 and not page_has_in_range_result:
                print(f"  Business Times search stopped at old results: {iso_date(last_old_date) if last_old_date else 'older than range'}")
                break
            if len(items) < 10:
                break
    return list(dict.fromkeys(links))


def discover_from_start_urls(source, country=None, topic=None, from_date=None, to_date=None):
    found = []
    start_urls = list(source.get("start_urls", []))
    if source.get("domain") == "info.gov.hk":
        current = from_date.date()
        final = to_date.date()
        while current <= final and len(start_urls) < source_link_limit(source):
            start_urls.append(f"https://www.info.gov.hk/gia/general/{current:%Y%m}/{current:%d}.htm")
            current += timedelta(days=1)

    for start_url in start_urls:
        try:
            print(f"  Start URL: {start_url}")
            if source.get("domain") == "businesstimes.com.sg" and "/search" in start_url:
                found.extend(discover_business_times_search_links(start_url, source, from_date, to_date))
                time.sleep(REQUEST_DELAY_SECONDS)
                continue
            html, final_url, _content_type = fetch_url_with_render_fallback(start_url, source)
            if is_incapsula_block_page(html):
                print(f"  Start URL blocked by Incapsula: {start_url}")
                continue
            if is_content_detail_url(final_url, source, topic or ""):
                found.append(final_url)
            found.extend(discover_from_html(html, final_url, source, from_date, to_date))
            time.sleep(REQUEST_DELAY_SECONDS)
        except Exception as error:
            print(f"  Start URL failed: {start_url} | {error}")
    limit = source_link_limit(source)
    return list(dict.fromkeys(found))[:limit]


def source_link_limit(source):
    domain = source.get("domain")
    if domain == "immd.gov.hk":
        return max(MAX_DISCOVERED_LINKS_PER_SOURCE, 160)
    return MAX_DISCOVERED_LINKS_PER_SOURCE


def source_page_limit(source):
    domain = source.get("domain")
    if domain == "immd.gov.hk":
        return max(MAX_PAGES_PER_SOURCE, 160)
    return MAX_PAGES_PER_SOURCE


def extract_meta_content(soup, selectors):
    for selector in selectors:
        tag = soup.select_one(selector)
        if not tag:
            continue
        value = tag.get("content") or tag.get("datetime") or tag.get("href") or tag.get_text(" ", strip=True)
        value = clean_text(value)
        if value:
            return value
    return ""


def extract_published_date(soup, text):
    acra_match = re.search(r"News Topic\s+.+?\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})", text)
    if acra_match:
        parsed = parse_any_date(acra_match.group(1))
        if parsed:
            return parsed

    for pattern in [
        r"\bEnds/\s*(?:[A-Za-z]+,\s*)?([A-Za-z]+\s+\d{1,2},\s+\d{4})\b",
        r"\bIssued\s+at\s+.*?\b(?:on\s+)?(?:[A-Za-z]+,\s*)?([A-Za-z]+\s+\d{1,2},\s+\d{4})\b",
        r"\bLast\s+revision\s+date\s*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b",
        r"\bLast\s+review\s+date\s*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b",
    ]:
        match = re.search(pattern, text, re.I)
        if match:
            parsed = parse_any_date(match.group(1))
            if parsed:
                return parsed

    header_date_match = re.search(r"\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b", text[:1200])
    if header_date_match:
        parsed = parse_any_date(header_date_match.group(1))
        if parsed:
            return parsed

    candidates = [
        extract_meta_content(soup, [
            'meta[property="article:published_time"]',
            'meta[name="article:published_time"]',
            'meta[name="pubdate"]',
            'meta[name="publishdate"]',
            'meta[name="date"]',
            'meta[itemprop="datePublished"]',
            "time",
        ])
    ]

    for selector in [".date", ".published", ".publish-date", ".article-date", ".story-date", ".news-date", "[class*=date]", "[class*=Date]"]:
        tag = soup.select_one(selector)
        if tag:
            candidates.append(tag.get_text(" ", strip=True))

    for candidate in candidates:
        parsed = parse_any_date(candidate)
        if parsed:
            return parsed

    return parse_any_date(text[:500])


def split_acra_tags(value):
    known_tags = [
        "Accountants",
        "Accounting entities",
        "Businesses",
        "Corporate service providers (CSPs)",
        "Public",
        "Regulatory updates",
        "Enforcement and penalties",
        "eService announcements",
        "Accountancy careers",
        "Accounting standards and sector regulation",
        "Sustainability reporting",
    ]
    found = [tag for tag in known_tags if tag.lower() in value.lower()]
    if found:
        return found
    cleaned = clean_text(value)
    return [cleaned] if cleaned else []


def extract_acra_metadata(cleaned_text):
    metadata = {
        "announcementType": "",
        "audience": [],
        "newsTopic": [],
        "categoryHints": [],
    }

    type_match = re.search(r"News & announcements\s+.+?\s+(Announcement|Press release|Speech|News)\s+", cleaned_text, re.I)
    if type_match:
        metadata["announcementType"] = clean_text(type_match.group(1))

    audience_match = re.search(r"Audience\s+(.+?)\s+News Topic\s+", cleaned_text)
    if audience_match:
        metadata["audience"] = split_acra_tags(audience_match.group(1))

    topic_match = re.search(r"News Topic\s+(.+?)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}", cleaned_text)
    if topic_match:
        metadata["newsTopic"] = split_acra_tags(topic_match.group(1))

    hints = metadata["audience"] + metadata["newsTopic"]
    if metadata["announcementType"]:
        hints.append(metadata["announcementType"])
    metadata["categoryHints"] = list(dict.fromkeys(hints))
    return metadata


def select_content_root(soup, source):
    domain = source.get("domain")
    domain_selectors = {
        "acra.gov.sg": [
            "main",
            "#main-content",
            ".main-content",
            ".content",
            "[class*=article]",
        ],
        "iras.gov.sg": [
            "main",
            "#main-content",
            ".main-content",
            ".sfContentBlock",
            ".content",
        ],
        "mom.gov.sg": [
            "#MainContent",
            "#maincontent",
            ".page-content",
            ".main-content",
            "[id*=documentcontent]",
            "[id*=documentContent]",
        ],
        "mfa.gov.sg": [
            "main",
            "#main-content",
            ".main-content",
            ".article-content",
            ".content",
        ],
        "straitstimes.com": [
            "article",
            "[data-testid*=article]",
            ".article-content",
            ".story-content",
            ".field-name-body",
            "main",
        ],
        "businesstimes.com.sg": [
            "article",
            ".article-content",
            ".story-content",
            ".field-name-body",
            "main",
        ],
        "channelnewsasia.com": [
            "article",
            ".text-long",
            ".article-content",
            ".content",
            "main",
        ],
        "edb.gov.sg": [
            "main",
            ".cmp-text",
            ".article-content",
            ".content",
        ],
    }
    generic_selectors = [
        "article",
        "main",
        "#main",
        "#content",
        "#main-content",
        ".article-content",
        ".story-content",
        ".entry-content",
        ".post-content",
        ".page-content",
        ".main-content",
        ".content",
    ]

    for selector in domain_selectors.get(domain, []) + generic_selectors:
        node = soup.select_one(selector)
        if node and len(clean_text(node.get_text(" ", strip=True))) >= 300:
            return node
    return soup


def clean_article_text(text):
    text = clean_text(text)
    junk_patterns = [
        r"\bSubscribe to our newsletter\b.*",
        r"\bSign up for our newsletters\b.*",
        r"\bDownload our app\b.*",
        r"\bShare this article\b.*",
        r"\bFollow us on\b.*",
        r"\bRelated stories\b.*",
        r"\bMore on this topic\b.*",
        r"\bRecommended\b.*",
        r"\bBack to top\b.*",
    ]
    for pattern in junk_patterns:
        text = re.sub(pattern, "", text, flags=re.I)
    return clean_text(text)


def extract_page(html, url, source, country, topic):
    soup = BeautifulSoup(html, "html.parser")

    title = extract_meta_content(soup, ['meta[property="og:title"]', 'meta[name="twitter:title"]', "h1", "title"])
    summary = extract_meta_content(soup, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'])
    canonical = extract_meta_content(soup, ['link[rel="canonical"]'])
    canonical_url = normalize_url(canonical, url) if canonical else url

    removable_selectors = (
        "script, style, nav, footer, header, aside, noscript, iframe, "
        "[aria-label*=breadcrumb], .breadcrumb, .breadcrumbs, "
        ".related, .related-articles, .recommended, .recommendations, "
        ".newsletter, .subscribe, .social, .share, .sharing, "
        ".advertisement, .ad, [class*=advert], [id*=advert]"
    )
    if source.get("domain") != "mom.gov.sg":
        removable_selectors += ", form"
    for bad in soup.select(removable_selectors):
        bad.decompose()

    content_root = select_content_root(soup, source)
    cleaned = clean_article_text(content_root.get_text(" ", strip=True))
    content = cleaned[:MAX_STORED_CONTENT_CHARS]
    published_at = extract_published_date(soup, cleaned)
    if source.get("domain") == "iras.gov.sg":
        published_at = IRAS_LATEST_UPDATE_DATES.get(url.rstrip("/")) or published_at
    if source.get("domain") == "mom.gov.sg":
        published_at = MOM_NEWSROOM_DATES.get(url.rstrip("/")) or published_at
    if source.get("domain") == "mfa.gov.sg":
        published_at = MFA_NEWSROOM_DATES.get(url.rstrip("/")) or published_at
    if source.get("domain") == "info.gov.hk":
        published_at = INFO_GOV_PRESS_DATES.get(url.rstrip("/")) or published_at
    if source.get("domain") == "immd.gov.hk":
        published_at = IMMD_PRESS_RELEASE_DATES.get(url.rstrip("/")) or published_at
    if source.get("domain") == "businesstimes.com.sg":
        published_at = BUSINESS_TIMES_SEARCH_DATES.get(url.rstrip("/")) or published_at
    now = datetime.now(timezone.utc).isoformat()
    normalized_topic = topic if topic in TOPIC_BUCKETS else "news"
    source_domain = source["domain"]
    canonical_hash = sha256(canonical_url)
    content_hash = sha256(cleaned[:MAX_STORED_CONTENT_CHARS])
    category_metadata = extract_acra_metadata(cleaned) if source.get("domain") == "acra.gov.sg" else {
        "announcementType": "",
        "audience": [],
        "newsTopic": [],
        "categoryHints": [],
    }
    tags = list(dict.fromkeys([slug(item) for item in category_metadata.get("categoryHints", []) if slug(item)]))

    article = {
        "schemaVersion": 1,
        "recordType": "intelligence_content",
        "isActive": True,

        # Backend replacement contract
        "type": normalized_topic,
        "intelligenceBucket": TOPIC_BUCKETS.get(normalized_topic, normalized_topic),
        "country": country,
        "language": "en",

        # Source attribution for dashboard and downstream article views.
        "source": source["name"],
        "sourceId": slug(source["name"]),
        "sourceDomain": source_domain,

        "url": url,
        "canonicalUrl": canonical_url,
        "urlHash": canonical_hash,
        "contentHash": content_hash,

        "title": title,
        "summary": summary,
        "content": content,
        "_contentText": cleaned,

        "publishedAt": iso_date(published_at),
        "dateFallbackUsed": published_at is None,
        "fetchedAt": now,
        "lastScrapedAt": now,

        "announcementType": category_metadata.get("announcementType", ""),
        "audience": category_metadata.get("audience", []),
        "newsTopic": category_metadata.get("newsTopic", []),
        "categoryHints": category_metadata.get("categoryHints", []),
        "tags": tags,

        "crawlStatus": "success",
        "errorReason": "",
    }
    if SAVE_RAW_HTML:
        article["rawHtml"] = html
    return article


def has_minimum_content(article):
    if len(article.get("title", "")) < 5:
        return False
    if len(article.get("_contentText", "")) < 300:
        return False
    return True


def is_mfa_singapore_content(article):
    url = article.get("url", "").lower()
    if "/newsroom/announcements-and-highlights/" in url:
        return True
    if article.get("url", "").rstrip("/") in MFA_SINGAPORE_URLS:
        return True
    text = clean_text(article.get("_contentText", ""))
    return re.search(r"\bCountry\s+Singapore\b", text, re.I) is not None


def is_singapore_focused_content(article):
    source_domain = article.get("sourceDomain", "")
    url = article.get("url", "").lower()
    title = clean_text(article.get("title", ""))
    summary = clean_text(article.get("summary", ""))
    text = clean_text(article.get("_contentText", ""))
    headline_text = clean_text(f"{title} {summary}")
    lead_text = clean_text(f"{headline_text} {text[:700]}")

    if source_domain in {"acra.gov.sg", "iras.gov.sg", "mom.gov.sg", "gov.sg"}:
        return True
    if source_domain == "mfa.gov.sg":
        return is_mfa_singapore_content(article)
    if source_domain == "businesstimes.com.sg" and url.rstrip("/") in BUSINESS_TIMES_SEARCH_DATES:
        return True
    if "/singapore/" in url:
        return True
    if re.search(r"\bSingapore('?s)?\b", headline_text, re.I):
        return True
    singapore_entities = [
        "STI",
        "SIA",
        "UOB",
        "OCBC",
        "DBS",
        "SingPost",
        "CapitaLand",
        "ComfortDelGro",
        "GovTech",
        "MAS",
        "SGX",
        "Temasek",
        "GIC",
    ]
    return any(re.search(rf"\b{re.escape(entity)}\b", headline_text, re.I) for entity in singapore_entities)


def scrape_page(url, source, country, topic, from_date, to_date):
    html, final_url, content_type = fetch_url_with_render_fallback(url, source)
    if source.get("domain") == "edb.gov.sg" and is_incapsula_block_page(html):
        return None, "blocked by Incapsula"
    if "html" not in content_type.lower() and "text" not in content_type.lower():
        return None, f"non-html content type: {content_type}"

    article = extract_page(html, final_url, source, country, topic)
    if not is_content_detail_url(article["url"], source, topic):
        return None, "not intelligence content detail page"

    published_at = parse_any_date(article["publishedAt"])
    if not in_date_range(published_at, from_date, to_date):
        return None, "outside date range"
    if source.get("domain") == "mfa.gov.sg" and not is_mfa_singapore_content(article):
        return None, "not Singapore country content"
    if country == "Singapore" and not is_singapore_focused_content(article):
        return None, "not Singapore focused content"
    if not has_minimum_content(article):
        return None, "missing title or low text"
    return article, ""


def persist_source_results(results, report, collection=None):
    if not results:
        return

    print(f"  Commit source results: {len(results)}")
    for article in results:
        insert_status = insert_if_new(collection, article)
        if insert_status == "inserted":
            report["insertedPages"] += 1
            LOCAL_EXISTING_URL_HASHES.add(article.get("urlHash"))
            print(f"  Insert: {article['title'][:90]}")
        elif insert_status == "updated":
            report["updatedPages"] += 1
            LOCAL_EXISTING_URL_HASHES.add(article.get("urlHash"))
            print(f"  Update: {article['title'][:90]}")
        elif insert_status == "duplicate":
            report["duplicatePages"] += 1
            print(f"  Duplicate skip: {article['title'][:90]}")
        elif insert_status == "enriched_duplicate":
            report["duplicatePages"] += 1
            report["enrichedDuplicatePages"] += 1
            print(f"  Duplicate metadata enriched: {article['title'][:90]}")
        elif insert_status == "cleaned_duplicate":
            report["duplicatePages"] += 1
            print(f"  Duplicate cleanup: {article['title'][:90]}")
        else:
            report["fileOnlyPages"] += 1
            LOCAL_EXISTING_URL_HASHES.add(article.get("urlHash"))
            print(f"  Save file only: {article['title'][:90]}")


def scrape_source(country, topic, source, from_date, to_date, collection=None):
    source = normalize_source_config(source)
    report = {
        "country": country,
        "topic": topic,
        "sourceName": source["name"],
        "sourceDomain": source["domain"],
        "sitemapLinks": 0,
        "discoveredLinks": 0,
        "attemptedPages": 0,
        "savedPages": 0,
        "insertedPages": 0,
        "updatedPages": 0,
        "duplicatePages": 0,
        "enrichedDuplicatePages": 0,
        "existingSkippedPages": 0,
        "fileOnlyPages": 0,
        "skippedPages": 0,
        "failedPages": 0,
        "skipReasons": {},
        "errors": [],
    }
    results = []
    print(f"\n=== {country} | {topic} | {source['name']} ===")

    sitemap_links = discover_from_sitemaps(source, from_date, to_date)
    html_links = discover_from_start_urls(source, country, topic, from_date, to_date)

    report["sitemapLinks"] = len(sitemap_links)
    report["discoveredLinks"] = len(html_links)

    candidate_links = list(dict.fromkeys(sitemap_links + html_links))[:source_page_limit(source)]
    print(f"  Candidate pages: {len(candidate_links)}")

    old_page_streak = 0
    for url in candidate_links:
        if INCREMENTAL_MODE and not FORCE_RESCAN and url_already_scraped(url, collection):
            report["existingSkippedPages"] += 1
            report["skippedPages"] += 1
            report["skipReasons"]["already in master"] = report["skipReasons"].get("already in master", 0) + 1
            print(f"  Skip: already in master | {url}")
            continue
        report["attemptedPages"] += 1
        try:
            time.sleep(REQUEST_DELAY_SECONDS)
            article, reason = scrape_page(url, source, country, topic, from_date, to_date)
            if not article:
                report["skippedPages"] += 1
                report["skipReasons"][reason] = report["skipReasons"].get(reason, 0) + 1
                print(f"  Skip: {reason} | {url}")
                if reason == "outside date range":
                    old_page_streak += 1
                    if STOP_AFTER_OLD_PAGES_PER_SOURCE and old_page_streak >= STOP_AFTER_OLD_PAGES_PER_SOURCE:
                        print(f"  Stop source scan: {old_page_streak} consecutive old pages | {source['name']}")
                        break
                else:
                    old_page_streak = 0
                continue

            old_page_streak = 0
            results.append(article)
            report["savedPages"] += 1
            print(f"  Keep for source commit: {article['title'][:90]}")
        except Exception as error:
            report["failedPages"] += 1
            report["errors"].append({"url": url, "error": str(error)})
            print(f"  Fail: {url} | {error}")

    persist_source_results(results, report, collection)
    return results, report


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)


def save_csv(path, rows):
    fields = [
        "recordType", "type", "intelligenceBucket", "country", "source", "sourceId",
        "sourceDomain", "title", "summary", "content", "url", "canonicalUrl",
        "publishedAt", "dateFallbackUsed", "announcementType", "audience", "newsTopic",
        "categoryHints", "tags", "urlHash", "contentHash", "fetchedAt",
    ]
    with open(path, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def merge_with_master_results(new_results):
    existing = []
    if MASTER_OUTPUT_JSON.exists():
        try:
            existing = json.loads(MASTER_OUTPUT_JSON.read_text(encoding="utf-8"))
        except Exception:
            existing = []

    merged = {}
    for item in existing + new_results:
        key = item.get("urlHash") or item.get("contentHash")
        if key:
            merged[key] = item

    master_results = list(merged.values())
    save_json(MASTER_OUTPUT_JSON, master_results)
    return master_results


def auto_limit_for_date_range(from_date, to_date):
    days = max(1, (to_date.date() - from_date.date()).days + 1)
    limit_points = [
        (2, 50),
        (7, 150),
        (30, 500),
        (183, 3000),
    ]

    if days <= limit_points[0][0]:
        return limit_points[0][1]

    for index in range(1, len(limit_points)):
        previous_days, previous_limit = limit_points[index - 1]
        next_days, next_limit = limit_points[index]
        if days <= next_days:
            ratio = (days - previous_days) / (next_days - previous_days)
            return round(previous_limit + ratio * (next_limit - previous_limit))

    return limit_points[-1][1]


def apply_date_range_limits(from_date, to_date):
    global MAX_PAGES_PER_SOURCE, MAX_DISCOVERED_LINKS_PER_SOURCE
    auto_limit = auto_limit_for_date_range(from_date, to_date)
    MAX_PAGES_PER_SOURCE = min(MAX_PAGES_PER_SOURCE, auto_limit)
    MAX_DISCOVERED_LINKS_PER_SOURCE = min(MAX_DISCOVERED_LINKS_PER_SOURCE, auto_limit)
    print(
        "Auto scrape limit: "
        f"{(to_date.date() - from_date.date()).days + 1} days => "
        f"maxPages={MAX_PAGES_PER_SOURCE}, maxDiscovered={MAX_DISCOVERED_LINKS_PER_SOURCE}"
    )


def main():
    global LOCAL_EXISTING_URL_HASHES
    run_started_at = datetime.now(timezone.utc)
    OUTPUT_DIR.mkdir(exist_ok=True)
    LOCAL_EXISTING_URL_HASHES = load_existing_url_hashes()
    from_date = parse_input_date(FROM_DATE)
    to_date = parse_input_date(TO_DATE).replace(hour=23, minute=59, second=59)
    apply_date_range_limits(from_date, to_date)
    signature = current_run_signature()
    checkpoint = load_run_checkpoint(signature)
    completed_sources = set(checkpoint.get("completedSources") or [])
    if completed_sources:
        print(f"Resume checkpoint: {len(completed_sources)} completed source(s) will be skipped")
    elif FORCE_RESCAN:
        print("Resume checkpoint: ignored because full source rescan is enabled")

    all_results = []
    all_reports = []
    mongo_client = None
    collection = None

    try:
        mongo_client, collection = get_collection()
        if collection is not None:
            print(f"MongoDB connected: {MONGO_DB}.{MONGO_COLLECTION}")
    except Exception as error:
        print(f"MongoDB connection failed: {error}")
        print("Continuing in file-only mode.")
        collection = None

    try:
        for country, topics in effective_sources().items():
            if ONLY_COUNTRIES and country.lower() not in ONLY_COUNTRIES:
                continue
            for topic, source_list in topics.items():
                if COUNTRY_TOPICS and topic.lower() not in COUNTRY_TOPICS.get(country.lower(), set()):
                    continue
                if ONLY_TOPICS and topic.lower() not in ONLY_TOPICS:
                    continue
                for raw_source in source_list:
                    source = normalize_source_config(raw_source)
                    if not source_matches_filter(source):
                        continue
                    checkpoint_key = source_checkpoint_key(country, topic, source)
                    if checkpoint_key in completed_sources:
                        print(f"  Resume skip completed source: {country} | {topic} | {source.get('name')}")
                        continue
                    try:
                        results, report = scrape_source(country, topic, source, from_date, to_date, collection)
                        all_results.extend(results)
                        all_reports.append(report)
                        completed_sources.add(checkpoint_key)
                        save_run_checkpoint(signature, completed_sources)
                    except Exception as error:
                        all_reports.append({
                            "country": country,
                            "topic": topic,
                            "sourceName": source.get("name"),
                            "sourceDomain": source.get("domain"),
                            "fatalError": str(error),
                            "trace": traceback.format_exc(),
                        })
    finally:
        if mongo_client is not None:
            mongo_client.close()

    deduped = {}
    for item in all_results:
        key = item.get("contentHash") or item.get("urlHash")
        if key:
            deduped[key] = item

    final_results = [storage_article(item) for item in deduped.values()]
    master_results = merge_with_master_results(final_results)
    run_finished_at = datetime.now(timezone.utc)
    duration_seconds = round((run_finished_at - run_started_at).total_seconds(), 2)
    source_reports = [report for report in all_reports if report.get("topic") != "run-summary"]
    report_total = lambda key: sum(int(report.get(key) or 0) for report in source_reports)
    run_summary = {
        "country": "ALL",
        "topic": "run-summary",
        "sourceName": "Scraper Run",
        "sourceDomain": "",
        "sitemapLinks": report_total("sitemapLinks"),
        "discoveredLinks": report_total("discoveredLinks"),
        "attemptedPages": report_total("attemptedPages"),
        "savedPages": report_total("savedPages"),
        "insertedPages": report_total("insertedPages"),
        "updatedPages": report_total("updatedPages"),
        "duplicatePages": report_total("duplicatePages"),
        "enrichedDuplicatePages": report_total("enrichedDuplicatePages"),
        "existingSkippedPages": report_total("existingSkippedPages"),
        "fileOnlyPages": report_total("fileOnlyPages"),
        "skippedPages": report_total("skippedPages"),
        "failedPages": report_total("failedPages"),
        "startedAt": run_started_at.isoformat(),
        "finishedAt": run_finished_at.isoformat(),
        "durationSeconds": duration_seconds,
        "durationText": format_duration(duration_seconds),
        "totalSavedPagesBeforeDedupe": len(all_results),
        "totalSavedPagesAfterDedupe": len(final_results),
        "totalCumulativeLocalPages": len(master_results),
    }
    all_reports.append(run_summary)
    save_json(OUTPUT_DIR / "scraped_output.json", final_results)
    save_csv(OUTPUT_DIR / "scraped_output.csv", final_results)
    save_json(OUTPUT_DIR / "scrape_report.json", all_reports)
    clear_run_checkpoint(signature)

    print("\n====================")
    print("SCRAPE TEST COMPLETE")
    print("====================")
    print(f"Total saved pages before dedupe: {len(all_results)}")
    print(f"Total saved pages after dedupe: {len(final_results)}")
    print(f"Total cumulative local pages: {len(master_results)}")
    print(f"Incremental mode: {'on' if INCREMENTAL_MODE and not FORCE_RESCAN else 'off'}")
    print(f"Total scrape duration: {run_summary['durationText']} ({duration_seconds} seconds)")
    print(f"Mongo inserted pages: {sum(report.get('insertedPages', 0) for report in all_reports)}")
    print(f"Mongo updated pages: {sum(report.get('updatedPages', 0) for report in all_reports)}")
    print(f"Mongo duplicate skips: {sum(report.get('duplicatePages', 0) for report in all_reports)}")
    print(f"Mongo duplicate metadata enriched: {sum(report.get('enrichedDuplicatePages', 0) for report in all_reports)}")
    print("Files created in scraper/outputs/")

    for report in all_reports:
        print(
            f"{report.get('country')} | {report.get('topic')} | {report.get('sourceName')} "
            f"=> saved={report.get('savedPages', 0)}, inserted={report.get('insertedPages', 0)}, "
            f"updated={report.get('updatedPages', 0)}, "
            f"duplicates={report.get('duplicatePages', 0)}, enriched={report.get('enrichedDuplicatePages', 0)}, "
            f"existingSkipped={report.get('existingSkippedPages', 0)}, "
            f"attempted={report.get('attemptedPages', 0)}, "
            f"failed={report.get('failedPages', 0)}, skipped={report.get('skippedPages', 0)}"
        )

    if final_results:
        print("\nSample result:")
        print(json.dumps(final_results[0], indent=2, ensure_ascii=False)[:2500])


if __name__ == "__main__":
    main()
