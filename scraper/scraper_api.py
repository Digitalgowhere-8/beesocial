import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from zoneinfo import ZoneInfo

from dotenv import dotenv_values, load_dotenv

try:
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
except Exception:
    MongoClient = None
    PyMongoError = Exception


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
ARTICLES_JSON = OUTPUT_DIR / "scraped_output.json"
MASTER_ARTICLES_JSON = OUTPUT_DIR / "all_scraped_articles.json"
REPORT_JSON = OUTPUT_DIR / "scrape_report.json"
ARTICLES_CSV = OUTPUT_DIR / "scraped_output.csv"
SCRAPER_SCRIPT = BASE_DIR / "scraper_runner.py"
SCHEDULE_JSON = OUTPUT_DIR / "scraper_schedule.json"
RUN_CHECKPOINT_JSON = OUTPUT_DIR / "scraper_run_checkpoint.json"

load_dotenv(BASE_DIR / ".env", encoding="utf-8-sig", override=True)

run_state = {
    "running": False,
    "startedAt": "",
    "finishedAt": "",
    "durationSeconds": None,
    "exitCode": None,
    "log": "",
    "error": "",
    "params": {},
    "events": [],
    "currentSource": "",
    "liveCounts": {
        "inserted": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "failed": 0,
        "savedFileOnly": 0,
    },
}

run_lock = threading.Lock()
current_process = None
scheduler_started = False


def read_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path, data):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def default_schedule():
    return {
        "enabled": False,
        "frequency": "daily",
        "time": "07:00",
        "timezone": "Asia/Calcutta",
        "lastRunKey": "",
        "lastRunAt": "",
        "params": {
            "countries": [],
            "topics": [],
            "countryTopics": {},
            "mode": "",
            "days": "",
            "fromDate": "",
            "toDate": "",
            "onlySources": "",
            "incremental": True,
            "forceRescan": False,
        },
    }


def load_schedule():
    schedule = {**default_schedule(), **read_json(SCHEDULE_JSON, {})}
    params = {**default_schedule()["params"], **(schedule.get("params") or {})}
    schedule["params"] = params
    return schedule


def save_schedule(schedule):
    current = load_schedule()
    next_schedule = {**current, **(schedule or {})}
    next_schedule["params"] = {**current.get("params", {}), **((schedule or {}).get("params") or {})}
    write_json(SCHEDULE_JSON, next_schedule)
    return next_schedule


def article_id(article):
    return article.get("urlHash") or article.get("contentHash") or article.get("canonicalHash") or ""


def query_value(query, key, default=""):
    return str((query.get(key) or [default])[0]).strip()[:300]


def query_int(query, key, default, minimum=1, maximum=200):
    try:
        value = int(query_value(query, key, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def parse_iso_date(value, field_name):
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return value
    except ValueError:
        raise ValueError(f"{field_name} must be a valid YYYY-MM-DD date.")


def validate_date_order(from_date, to_date):
    if from_date and to_date and from_date > to_date:
        raise ValueError("From date cannot be after To date.")


def clean_id_list(values, maximum=500):
    if not isinstance(values, list):
        raise ValueError("ids must be an array.")
    cleaned = []
    for value in values[:maximum]:
        item = str(value or "").strip()
        if not item:
            continue
        if len(item) > 160:
            raise ValueError("Invalid article id.")
        cleaned.append(item)
    return cleaned


def filter_articles(articles, query):
    search = query_value(query, "q").lower()
    country = query_value(query, "country").lower()
    source = query_value(query, "source").lower()
    topic = query_value(query, "topic").lower()
    from_date = parse_iso_date(query_value(query, "from"), "from")
    to_date = parse_iso_date(query_value(query, "to"), "to")
    validate_date_order(from_date, to_date)

    filtered = []
    for article in articles:
        article_country = str(article.get("country", "")).lower()
        article_date = str(article.get("publishedAt") or article.get("fetchedAt") or "")[:10]
        if country and country != article_country:
            continue
        if source and source != str(article.get("source", "")).lower() and source != str(article.get("sourceDomain", "")).lower():
            continue
        if topic and topic != str(article.get("type", "")).lower() and topic != str(article.get("intelligenceBucket", "")).lower():
            continue
        if from_date and article_date and article_date < from_date:
            continue
        if to_date and article_date and article_date > to_date:
            continue
        if search:
            haystack = " ".join(
                str(article.get(key, ""))
                for key in ["title", "summary", "content", "source", "sourceDomain", "url"]
            ).lower()
            if search not in haystack:
                continue
        filtered.append(article)
    return sort_articles_latest_first(filtered)


def article_sort_date(article):
    return str(
        article.get("publishedAt")
        or article.get("fetchedAt")
        or article.get("lastScrapedAt")
        or article.get("updatedAt")
        or article.get("createdAt")
        or ""
    )


def sort_articles_latest_first(articles):
    return sorted(articles, key=article_sort_date, reverse=True)


def mongo_article_query(query):
    criteria = {"recordType": "intelligence_content", "isActive": {"$ne": False}}
    country = query_value(query, "country")
    source = query_value(query, "source")
    topic = query_value(query, "topic")
    search = query_value(query, "q")
    from_date = parse_iso_date(query_value(query, "from"), "from")
    to_date = parse_iso_date(query_value(query, "to"), "to")
    validate_date_order(from_date, to_date)

    if country:
        criteria["country"] = country
    if source:
        criteria["$or"] = [{"source": source}, {"sourceDomain": source}]
    if topic:
        criteria["$and"] = criteria.get("$and", []) + [{"$or": [{"type": topic}, {"intelligenceBucket": topic}]}]
    if from_date or to_date:
        date_range = {}
        if from_date:
            date_range["$gte"] = from_date
        if to_date:
            date_range["$lte"] = f"{to_date}T23:59:59"
        criteria["publishedAt"] = date_range
    if search:
        pattern = {"$regex": search, "$options": "i"}
        criteria["$and"] = criteria.get("$and", []) + [{"$or": [
            {"title": pattern},
            {"summary": pattern},
            {"content": pattern},
            {"source": pattern},
            {"sourceDomain": pattern},
            {"url": pattern},
        ]}]
    return criteria


def article_filter_options_from_rows(rows):
    rows = list(rows or [])
    countries = sorted({item.get("country") for item in rows if item.get("country")})
    topics = sorted({item.get("type") or item.get("intelligenceBucket") for item in rows if item.get("type") or item.get("intelligenceBucket")})
    sources = sorted({item.get("source") or item.get("sourceDomain") for item in rows if item.get("source") or item.get("sourceDomain")})
    return {"countries": countries, "topics": topics, "sources": sources}


def query_articles(query):
    page = query_int(query, "page", 1, 1, 100000)
    limit = query_int(query, "limit", 40, 1, 100)
    skip = (page - 1) * limit
    client, collection = get_mongo_collection()
    if collection is not None:
        try:
            criteria = mongo_article_query(query)
            total = collection.count_documents(criteria)
            pipeline = [
                {"$match": criteria},
                {"$addFields": {"_sortDate": {"$ifNull": [
                    "$publishedAt",
                    {"$ifNull": ["$fetchedAt", {"$ifNull": ["$lastScrapedAt", {"$ifNull": ["$updatedAt", "$createdAt"]}]}]},
                ]}}},
                {"$sort": {"_sortDate": -1}},
                {"$skip": skip},
                {"$limit": limit},
                {"$project": {"_id": 0, "_sortDate": 0}},
            ]
            documents = collection.aggregate(pipeline)
            option_scope = {k: v for k, v in criteria.items() if k not in {"$or"}}
            option_rows = collection.find(option_scope, {"_id": 0, "country": 1, "type": 1, "intelligenceBucket": 1, "source": 1, "sourceDomain": 1}).limit(5000)
            items = [clean_mongo_document(item) for item in documents]
            filters = article_filter_options_from_rows(option_rows)
            return {"items": items, "total": total, "page": page, "limit": limit, "hasMore": skip + len(items) < total, "dataSource": "mongo", "filters": filters}
        except PyMongoError as error:
            print(f"[api] Mongo articles query failed, falling back to file data: {error}")
        finally:
            client.close()

    articles = filter_articles(read_json(MASTER_OUTPUT_JSON, read_json(ARTICLES_JSON, [])), query)
    items = articles[skip:skip + limit]
    return {"items": items, "total": len(articles), "page": page, "limit": limit, "hasMore": skip + len(items) < len(articles), "dataSource": "file", "filters": article_filter_options_from_rows(articles)}


def query_analysis_articles(query):
    limit = query_int(query, "limit", 5000, 1, 10000)
    projection = {
        "_id": 0,
        "urlHash": 1,
        "contentHash": 1,
        "canonicalHash": 1,
        "url": 1,
        "title": 1,
        "summary": 1,
        "country": 1,
        "source": 1,
        "sourceDomain": 1,
        "type": 1,
        "intelligenceBucket": 1,
        "publishedAt": 1,
        "fetchedAt": 1,
    }
    client, collection = get_mongo_collection()
    if collection is not None:
        try:
            criteria = mongo_article_query(query)
            total = collection.count_documents(criteria)
            documents = collection.find(criteria, projection).sort("publishedAt", -1).limit(limit)
            items = [clean_mongo_document(item) for item in documents]
            return {"items": items, "total": total, "limit": limit, "truncated": len(items) < total, "dataSource": "mongo"}
        except PyMongoError as error:
            print(f"[api] Mongo analysis query failed, falling back to file data: {error}")
        finally:
            client.close()

    articles = filter_articles(read_json(MASTER_OUTPUT_JSON, read_json(ARTICLES_JSON, [])), query)
    return {"items": articles[:limit], "total": len(articles), "limit": limit, "truncated": len(articles[:limit]) < len(articles), "dataSource": "file"}


def build_summary(articles, reports):
    by_source = {}
    by_topic = {}
    by_country = {}
    by_date = {}
    for article in articles:
        country = article.get("country") or "Unknown"
        source = article.get("source") or article.get("sourceDomain") or "Unknown"
        topic = article.get("type") or article.get("intelligenceBucket") or "unknown"
        date_key = str(article.get("publishedAt") or article.get("fetchedAt") or "")[:10] or "unknown"
        by_country[country] = by_country.get(country, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1
        by_topic[topic] = by_topic.get(topic, 0) + 1
        by_date[date_key] = by_date.get(date_key, 0) + 1

    return {
        "totalArticles": len(articles),
        "totalReports": len(reports),
        "savedPages": sum(item.get("savedPages", 0) for item in reports if isinstance(item, dict)),
        "attemptedPages": sum(item.get("attemptedPages", 0) for item in reports if isinstance(item, dict)),
        "skippedPages": sum(item.get("skippedPages", 0) for item in reports if isinstance(item, dict)),
        "failedPages": sum(item.get("failedPages", 0) for item in reports if isinstance(item, dict)),
        "insertedPages": sum(item.get("insertedPages", 0) for item in reports if isinstance(item, dict)),
        "updatedPages": sum(item.get("updatedPages", 0) for item in reports if isinstance(item, dict)),
        "duplicatePages": sum(item.get("duplicatePages", 0) for item in reports if isinstance(item, dict)),
        "byCountry": by_country,
        "bySource": by_source,
        "byTopic": by_topic,
        "byDate": by_date,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def get_mongo_collection():
    mongo_uri = os.getenv("MONGO_URI", "")
    if not mongo_uri or MongoClient is None:
        return None, None
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=8000)
    collection = client[
        os.getenv("MONGO_DB", "master")
    ][
        os.getenv("MONGO_COLLECTION", "master_articles")
    ]
    return client, collection


def clean_mongo_document(document):
    document = dict(document or {})
    document.pop("_id", None)
    return document


def load_articles():
    client, collection = get_mongo_collection()
    if collection is None:
        return read_json(MASTER_ARTICLES_JSON, read_json(ARTICLES_JSON, [])), "file"
    try:
        documents = collection.find(
            {"recordType": "intelligence_content", "isActive": {"$ne": False}},
            {"_id": 0},
        ).sort("publishedAt", -1)
        return [clean_mongo_document(item) for item in documents], "mongo"
    except Exception:
        return read_json(MASTER_ARTICLES_JSON, read_json(ARTICLES_JSON, [])), "file"
    finally:
        client.close()


def delete_from_mongo(article):
    client, collection = get_mongo_collection()
    if collection is None:
        return {"enabled": False, "deleted": 0}
    try:
        result = collection.delete_many({
            "$or": [
                {"urlHash": article.get("urlHash")},
                {"contentHash": article.get("contentHash")},
                {"url": article.get("url")},
            ]
        })
        return {"enabled": True, "deleted": result.deleted_count}
    finally:
        client.close()


def rewrite_csv_from_articles(articles):
    if not ARTICLES_CSV.exists():
        return
    import csv

    fields = [
        "recordType", "type", "intelligenceBucket", "country", "source", "sourceId",
        "sourceDomain", "title", "summary", "content", "url", "canonicalUrl",
        "publishedAt", "dateFallbackUsed", "announcementType", "audience", "newsTopic",
        "categoryHints", "tags", "urlHash", "contentHash", "fetchedAt",
    ]
    with ARTICLES_CSV.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for article in articles:
            writer.writerow(article)


def delete_articles_by_ids(target_ids):
    target_ids = set(target_ids)
    if not target_ids:
        return {"deleted": 0, "mongo": {"enabled": False, "deleted": 0}}

    articles = read_json(ARTICLES_JSON, [])
    master_articles = read_json(MASTER_ARTICLES_JSON, [])
    deleted_items = []
    kept = []
    for article in articles:
        if article_id(article) in target_ids:
            deleted_items.append(article)
        else:
            kept.append(article)

    mongo_deleted = 0
    mongo_enabled = False
    lookup_articles, _source = load_articles()
    for article in lookup_articles:
        if article_id(article) not in target_ids:
            continue
        result = delete_from_mongo(article)
        mongo_enabled = mongo_enabled or result.get("enabled", False)
        mongo_deleted += result.get("deleted", 0)

    if deleted_items:
        write_json(ARTICLES_JSON, kept)
        rewrite_csv_from_articles(kept)
    if master_articles:
        write_json(MASTER_ARTICLES_JSON, [article for article in master_articles if article_id(article) not in target_ids])

    deleted_count = max(len(deleted_items), mongo_deleted)
    return {"deleted": deleted_count, "mongo": {"enabled": mongo_enabled, "deleted": mongo_deleted}}


def clear_scraper_data(clear_mongo=False):
    articles = read_json(ARTICLES_JSON, [])
    reports = read_json(REPORT_JSON, [])
    write_json(ARTICLES_JSON, [])
    write_json(MASTER_ARTICLES_JSON, [])
    write_json(REPORT_JSON, [])
    if RUN_CHECKPOINT_JSON.exists():
        RUN_CHECKPOINT_JSON.unlink()
    rewrite_csv_from_articles([])

    mongo_result = {"enabled": False, "deleted": 0}
    if clear_mongo:
        mongo_result = clear_mongo_collection()

    return {
        "clearedArticles": len(articles),
        "clearedReports": len(reports),
        "mongo": mongo_result,
    }


def clear_mongo_collection():
    mongo_uri = os.getenv("MONGO_URI", "")
    if not mongo_uri or MongoClient is None:
        return {"enabled": False, "deleted": 0}

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=8000)
    try:
        collection = client[
            os.getenv("MONGO_DB", "master")
        ][
            os.getenv("MONGO_COLLECTION", "master_articles")
        ]
        result = collection.delete_many({})
        return {"enabled": True, "deleted": result.deleted_count}
    finally:
        client.close()


def scraper_catalog():
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("scraper_runner_catalog", SCRAPER_SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sources = getattr(module, "SOURCES", {})
    except Exception:
        sources = {"Singapore": {"news": [], "govt": [], "competitor": [], "evergreen": []}}

    countries = list(sources.keys())
    topic_keys = ["news", "govt", "competitor", "evergreen"]
    def source_values(items):
        values = []
        for item in items or []:
            urls = list(item.get("start_urls") or []) + list(item.get("sitemap_urls") or [])
            if urls:
                values.extend(urls)
            elif item.get("domain"):
                values.append(item.get("domain"))
            elif item.get("name"):
                values.append(item.get("name"))
        return values

    return {
        "countries": countries,
        "topics": topic_keys,
        "countryTopics": {
            country: [topic for topic in topic_keys if (topics or {}).get(topic)]
            for country, topics in sources.items()
        },
        "sources": {
            country: {
                topic: [
                    item.get("name") or item.get("domain") or "Unknown source"
                    for item in (topics or {}).get(topic, [])
                ]
                for topic in topic_keys
            }
            for country, topics in sources.items()
        },
        "sourceCatalog": {
            country: {
                topic: source_values((topics or {}).get(topic, []))
                for topic in topic_keys
            }
            for country, topics in sources.items()
        },
    }


def start_scraper_with_params(params):
    if run_state["running"]:
        return {"started": False, "status": run_state}
    run_state["params"] = params
    thread = threading.Thread(target=run_scraper_background, daemon=False)
    thread.start()
    return {"started": True, "params": params}


def run_scraper_background():
    global run_state, current_process
    started_at = datetime.now(timezone.utc)
    with run_lock:
        if run_state["running"]:
            return
        run_state = {
            "running": True,
            "startedAt": started_at.isoformat(),
            "finishedAt": "",
            "durationSeconds": None,
            "exitCode": None,
            "log": "",
            "error": "",
            "params": dict(run_state.get("params") or {}),
            "events": [],
            "currentSource": "",
            "liveCounts": {
                "inserted": 0,
                "updated": 0,
                "duplicates": 0,
                "skipped": 0,
                "failed": 0,
                "savedFileOnly": 0,
            },
        }

    try:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        scraper_env = dotenv_values(BASE_DIR / ".env", encoding="utf-8-sig")
        for key in ["MONGO_URI", "MONGO_DB", "MONGO_COLLECTION"]:
            if scraper_env.get(key):
                env[key] = scraper_env[key]
        params = run_state.get("params") or {}
        if params.get("fromDate"):
            env["FROM_DATE"] = params["fromDate"]
        if params.get("toDate"):
            env["TO_DATE"] = params["toDate"]
        if params.get("onlyTopics"):
            env["ONLY_TOPICS"] = params["onlyTopics"]
        if params.get("onlySources"):
            env["ONLY_SOURCES"] = params["onlySources"]
        if params.get("onlyCountries"):
            env["ONLY_COUNTRIES"] = params["onlyCountries"]
        if params.get("countryTopics"):
            env["COUNTRY_TOPICS"] = json.dumps(params["countryTopics"])
        if params.get("sourceDomainsByCountry"):
            env["SOURCE_DOMAINS_BY_COUNTRY"] = json.dumps(params["sourceDomainsByCountry"])
        env["INCREMENTAL_MODE"] = "1" if params.get("incremental", True) else "0"
        env["FORCE_RESCAN"] = "1" if params.get("forceRescan") else "0"

        popen_options = {}
        if os.name == "nt":
            popen_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_options["start_new_session"] = True

        process = subprocess.Popen(
            [sys.executable, "-u", str(SCRAPER_SCRIPT)],
            cwd=str(BASE_DIR),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            **popen_options,
        )
        with run_lock:
            current_process = process
        for line in process.stdout:
            append_run_log(line.rstrip())
        run_state["exitCode"] = process.wait()
    except Exception as error:
        run_state["exitCode"] = -1
        run_state["error"] = str(error)
    finally:
        finished_at = datetime.now(timezone.utc)
        run_state["running"] = False
        run_state["finishedAt"] = finished_at.isoformat()
        run_state["durationSeconds"] = round((finished_at - started_at).total_seconds(), 2)
        append_run_log(f"  Duration: {run_state['durationSeconds']} seconds")
        with run_lock:
            current_process = None


def stop_scraper_process():
    global current_process
    with run_lock:
        process = current_process
    if process is None or process.poll() is not None:
        return {"stopped": False, "reason": "No scraper is running"}

    append_run_log("  Stop: user requested stop")
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)

    with run_lock:
        finished_at = datetime.now(timezone.utc)
        started_at = parse_iso_datetime(run_state.get("startedAt"))
        run_state["running"] = False
        run_state["finishedAt"] = finished_at.isoformat()
        if started_at:
            run_state["durationSeconds"] = round((finished_at - started_at).total_seconds(), 2)
        run_state["exitCode"] = process.returncode
        run_state["error"] = "Stopped by user"
        current_process = None
    return {"stopped": True, "exitCode": process.returncode}


def schedule_due(schedule):
    if not schedule.get("enabled"):
        return False, ""
    try:
        zone = ZoneInfo(str(schedule.get("timezone") or "Asia/Calcutta"))
    except Exception:
        zone = ZoneInfo("UTC")
    now = datetime.now(zone)
    time_value = str(schedule.get("time") or "07:00")
    if now.strftime("%H:%M") != time_value:
        return False, ""
    if schedule.get("frequency") == "weekly":
        run_key = now.strftime("%G-W%V")
    else:
        run_key = now.strftime("%Y-%m-%d")
    return schedule.get("lastRunKey") != run_key, run_key


def scheduler_loop():
    while True:
        try:
            schedule = load_schedule()
            due, run_key = schedule_due(schedule)
            if due and not run_state.get("running"):
                params = normalize_run_params(schedule.get("params") or {})
                append_run_log("  Start URL: scheduled scraper trigger")
                start_scraper_with_params(params)
                schedule["lastRunKey"] = run_key
                schedule["lastRunAt"] = datetime.now(timezone.utc).isoformat()
                save_schedule(schedule)
        except Exception as error:
            print(f"Scheduler error: {error}")
        time.sleep(30)


def ensure_scheduler_started():
    global scheduler_started
    if scheduler_started:
        return
    scheduler_started = True
    threading.Thread(target=scheduler_loop, daemon=True).start()


def append_run_log(line):
    if not line:
        return
    event = parse_run_event(line)
    with run_lock:
        existing_log = run_state.get("log", "")
        run_state["log"] = (existing_log + line + "\n")[-50000:]
        if event:
            events = run_state.setdefault("events", [])
            events.append(event)
            run_state["events"] = events[-300:]
            if event["kind"] == "source":
                run_state["currentSource"] = event.get("source", "")
            counts = run_state.setdefault("liveCounts", {})
            if event["kind"] == "insert":
                counts["inserted"] = counts.get("inserted", 0) + 1
            elif event["kind"] == "update":
                counts["updated"] = counts.get("updated", 0) + 1
            elif event["kind"] in {"duplicate", "cleanup", "enriched"}:
                counts["duplicates"] = counts.get("duplicates", 0) + 1
            elif event["kind"] == "skip":
                counts["skipped"] = counts.get("skipped", 0) + 1
            elif event["kind"] == "fail":
                counts["failed"] = counts.get("failed", 0) + 1
            elif event["kind"] == "file_only":
                counts["savedFileOnly"] = counts.get("savedFileOnly", 0) + 1


def parse_run_event(line):
    now = datetime.now(timezone.utc).isoformat()
    if line.startswith("=== ") and line.endswith(" ==="):
        parts = [part.strip() for part in line.strip("= ").split("|")]
        return {
            "time": now,
            "kind": "source",
            "label": line.strip("= "),
            "country": parts[0] if len(parts) > 0 else "",
            "topic": parts[1] if len(parts) > 1 else "",
            "source": parts[2] if len(parts) > 2 else "",
        }
    mapping = [
        ("  Insert: ", "insert"),
        ("  Update: ", "update"),
        ("  Duplicate skip: ", "duplicate"),
        ("  Duplicate cleanup: ", "cleanup"),
        ("  Duplicate metadata enriched: ", "enriched"),
        ("  Save file only: ", "file_only"),
        ("  Skip: ", "skip"),
        ("  Fail: ", "fail"),
        ("  Candidate pages: ", "candidate"),
        ("  Keep for source commit: ", "kept"),
        ("  Commit source results: ", "commit"),
        ("  Sitemap: ", "sitemap"),
        ("  Start URL: ", "start_url"),
        ("  Stop: ", "stop"),
    ]
    for prefix, kind in mapping:
        if line.startswith(prefix):
            payload = line[len(prefix):].strip()
            reason = ""
            url = ""
            title = payload
            if " | " in payload:
                first, second = payload.split(" | ", 1)
                if kind in {"skip", "fail"}:
                    reason = first
                    url = second
                    title = first
                else:
                    url = second
                    title = first
            return {
                "time": now,
                "kind": kind,
                "title": title,
                "reason": reason,
                "url": url,
                "message": payload,
            }
    return None


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "SingaporeScraperDashboard/1.0"

    def send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            return self.send_json({
                "service": "Beesocial scraper API",
                "status": "ok",
                "dashboard": "Open the main frontend Super Admin > Scraper tab."
            })
        if parsed.path == "/api/articles":
            try:
                return self.send_json(query_articles(parse_qs(parsed.query)))
            except ValueError as error:
                return self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        if parsed.path == "/api/analysis-articles":
            try:
                return self.send_json(query_analysis_articles(parse_qs(parsed.query)))
            except ValueError as error:
                return self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        if parsed.path == "/api/reports":
            return self.send_json({"items": read_json(REPORT_JSON, [])})
        if parsed.path == "/api/summary":
            articles, data_source = load_articles()
            reports = read_json(REPORT_JSON, [])
            summary = build_summary(articles, reports)
            summary["dataSource"] = data_source
            return self.send_json(summary)
        if parsed.path == "/api/run-status":
            return self.send_json(run_state)
        if parsed.path == "/api/schedule":
            return self.send_json(load_schedule())
        if parsed.path == "/api/config":
            return self.send_json({
                "defaultFromDate": os.getenv("FROM_DATE", "2025-01-01"),
                "defaultToDate": os.getenv("TO_DATE", datetime.now(timezone.utc).date().isoformat()),
                "articlesPath": str(ARTICLES_JSON),
                "reportPath": str(REPORT_JSON),
                "mongoEnabled": bool(os.getenv("MONGO_URI", "")),
                "catalog": scraper_catalog(),
            })
        return self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/run":
            if run_state["running"]:
                return self.send_json(run_state, HTTPStatus.CONFLICT)
            try:
                payload = self.read_body_json()
                params = normalize_run_params(payload)
            except ValueError as error:
                return self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return self.send_json(start_scraper_with_params(params))
        if parsed.path == "/api/schedule":
            try:
                payload = self.read_body_json()
                if not isinstance(payload, dict):
                    raise ValueError("Schedule payload must be an object.")
                if "params" in payload:
                    payload["params"] = normalize_run_params(payload.get("params") or {})
                schedule = save_schedule(payload)
            except ValueError as error:
                return self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return self.send_json(schedule)
        if parsed.path == "/api/stop":
            return self.send_json(stop_scraper_process())
        if parsed.path == "/api/articles/bulk-delete":
            try:
                payload = self.read_body_json()
                return self.send_json(delete_articles_by_ids(clean_id_list(payload.get("ids") or [])))
            except ValueError as error:
                return self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        if parsed.path == "/api/clear-data":
            payload = self.read_body_json()
            return self.send_json(clear_scraper_data(clear_mongo=bool(payload.get("clearMongo"))))
        return self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/articles/"):
            return self.send_error(HTTPStatus.NOT_FOUND)

        target_id = unquote(parsed.path.rsplit("/", 1)[-1]).strip()
        if not target_id or len(target_id) > 160:
            return self.send_json({"deleted": False, "reason": "invalid article id"}, HTTPStatus.BAD_REQUEST)
        articles = read_json(ARTICLES_JSON, [])
        all_articles, _source = load_articles()
        if not any(article_id(article) == target_id for article in all_articles + articles):
            return self.send_json({"deleted": False, "reason": "article not found"}, HTTPStatus.NOT_FOUND)

        result = delete_articles_by_ids([target_id])
        return self.send_json({"deleted": True, **result})

    def read_body_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if not length:
            return {}
        try:
            body = self.rfile.read(length).decode("utf-8")
            return json.loads(body)
        except Exception:
            raise ValueError("Request body must be valid JSON.")

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


def main():
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", os.getenv("SCRAPER_DASHBOARD_PORT", "8091")))
    ensure_scheduler_started()
    server = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Scraper API listening on {host}:{port}")
    print("Scraper service started successfully.")
    server.serve_forever()


def normalize_run_params(payload):
    payload = payload if isinstance(payload, dict) else {}
    today = datetime.now(timezone.utc).date()
    requested_mode = str(payload.get("mode") or "").strip().lower()
    if requested_mode not in {"days", "range"}:
        requested_mode = "days" if payload.get("days") not in ("", None) else "range"
    days = payload.get("days")
    normalized_days = None
    from_date = str(payload.get("fromDate") or "").strip()
    to_date = str(payload.get("toDate") or "").strip()

    if days not in ("", None):
        try:
            days_int = int(days)
            if days_int < 1 or days_int > 730:
                raise ValueError("days must be between 1 and 730.")
            normalized_days = days_int
            from_date = (today - timedelta(days=days_int - 1)).isoformat()
            to_date = today.isoformat()
        except ValueError:
            raise ValueError("days must be a valid number between 1 and 730.")

    if not to_date:
        to_date = today.isoformat()
    if not from_date:
        from_date = os.getenv("FROM_DATE", "2025-01-01")
    from_date = parse_iso_date(from_date, "fromDate")
    to_date = parse_iso_date(to_date, "toDate")
    validate_date_order(from_date, to_date)

    countries = payload.get("countries")
    if isinstance(countries, str):
        country_list = [item.strip() for item in countries.split(",") if item.strip()]
    elif isinstance(countries, list):
        country_list = [str(item).strip() for item in countries if str(item).strip()]
    else:
        country_list = []
    country_list = list(dict.fromkeys(country_list))[:50]

    topics = payload.get("topics")
    if isinstance(topics, str):
        topic_list = [item.strip() for item in topics.split(",") if item.strip()]
    elif isinstance(topics, list):
        topic_list = [str(item).strip() for item in topics if str(item).strip()]
    else:
        topic_list = []
    allowed_topics = {"news", "govt", "competitor", "evergreen"}
    invalid_topics = [topic for topic in topic_list if topic not in allowed_topics]
    if invalid_topics:
        raise ValueError(f"Invalid topic: {invalid_topics[0]}")
    topic_list = list(dict.fromkeys(topic_list))[:20]

    raw_country_topics = payload.get("countryTopics") if isinstance(payload.get("countryTopics"), dict) else {}
    country_topics = {
        str(country).strip(): [str(topic).strip() for topic in values if str(topic).strip() in allowed_topics]
        for country, values in raw_country_topics.items()
        if isinstance(values, list) and str(country).strip()
    }
    raw_source_domains = payload.get("sourceDomainsByCountry") if isinstance(payload.get("sourceDomainsByCountry"), dict) else {}
    source_domains_by_country = {}
    for country, topic_map in raw_source_domains.items():
        country_name = str(country).strip()
        if not country_name or not isinstance(topic_map, dict):
            continue
        source_domains_by_country[country_name] = {
            str(topic).strip(): [str(domain).strip()[:300] for domain in domains[:100] if str(domain).strip()]
            for topic, domains in topic_map.items()
            if isinstance(domains, list) and str(topic).strip() in allowed_topics
        }

    return {
        "fromDate": from_date,
        "toDate": to_date,
        "mode": requested_mode,
        "days": normalized_days if normalized_days is not None else payload.get("days"),
        "onlyTopics": ",".join(topic_list) if topic_list else str(payload.get("onlyTopics") or "").strip(),
        "onlySources": str(payload.get("onlySources") or "").strip(),
        "onlyCountries": ",".join(country_list),
        "countryTopics": country_topics,
        "sourceDomainsByCountry": source_domains_by_country,
        "countries": country_list,
        "topics": topic_list,
        "incremental": payload.get("incremental", True) is not False,
        "forceRescan": bool(payload.get("forceRescan")),
    }


if __name__ == "__main__":
    main()
