#!/usr/bin/env python3
"""Check the links in wherecamps.geojson and archives.json.

A link is "live" when it returns HTTP 200 and the page still mentions WhereCamp.
Old domains are often re-registered by someone else, so a 200 alone is not enough.
For every link that is not live, the script looks for the Internet Archive capture
closest to the event date that does mention WhereCamp.

Usage:
  python3 scripts/check_links.py                  # report only
  python3 scripts/check_links.py --fix            # also rewrite dead links to archive copies
  python3 scripts/check_links.py --fixes-from report.json   # apply a saved report, no network
  python3 scripts/check_links.py --discover wherecamppdx.org/wiki   # list archived pages under a prefix

Standard library only. Needs open network access (GitHub Actions has it).
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "wherecamps.geojson"
ARCHIVES = ROOT / "archives.json"
UA = "Mozilla/5.0 (compatible; wherecamp-link-check/1.0)"
MENTION = re.compile(r"where\s?camp", re.I)
WAYBACK = re.compile(r"^https?://web\.archive\.org/web/")
BLOCKED = {202, 401, 403, 429}


def fetch(url, timeout=25, tries=2):
    """Return (status, final_url, body_text, error)."""
    err = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read(600_000).decode("utf-8", "replace")
                return r.status, r.geturl(), body, None
        except urllib.error.HTTPError as e:
            return e.code, url, "", f"HTTP {e.code}"
        except Exception as e:  # DNS failure, timeout, TLS error, ...
            err = f"{type(e).__name__}: {e}"[:120]
            time.sleep(2 * (attempt + 1))
    return None, url, "", err


def title_of(body):
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:80] if m else ""


def check(url):
    status, final, body, err = fetch(url)
    return {
        "status": status,
        "final": final if final != url else None,
        "title": title_of(body),
        "mentions": bool(MENTION.search(body)),
        "error": err,
        "live": status == 200 and bool(MENTION.search(body)),
    }


def cdx(params):
    q = urllib.parse.urlencode(params, doseq=True)
    status, _, body, err = fetch(f"https://web.archive.org/cdx/search/cdx?{q}", timeout=45, tries=2)
    if status != 200 or not body.strip():
        return []
    try:
        rows = json.loads(body)
    except ValueError:
        return []
    return rows[1:]  # first row is the header


def find_snapshot(url, date):
    """Capture closest to `date` (YYYY-MM-DD or None) that returned HTTP 200 and mentions WhereCamp."""
    closest = (date or "2012-01-01").replace("-", "")
    candidates = []
    # The availability API is fast and answers most cases.
    q = urllib.parse.urlencode({"url": url, "timestamp": closest})
    status, _, body, _ = fetch(f"https://archive.org/wayback/available?{q}", timeout=30)
    try:
        c = json.loads(body)["archived_snapshots"]["closest"]
        if c.get("status") == "200":
            candidates.append(re.sub(r"^http:", "https:", c["url"]))
    except (ValueError, KeyError):
        pass
    for snap in candidates:
        status, _, body, _ = fetch(snap, timeout=45)
        if status == 200 and MENTION.search(body):
            return snap
    # Slower: ask the capture index for the nearest few captures and test each one.
    rows = cdx({"url": url, "output": "json", "fl": "timestamp,original", "filter": "statuscode:200",
                "sort": "closest", "closest": closest, "limit": 4})
    for ts, original in rows:
        snap = f"https://web.archive.org/web/{ts}/{original}"
        if snap in candidates:
            continue
        status, _, body, _ = fetch(snap, timeout=45)
        if status == 200 and MENTION.search(body):
            return snap
    return None


def discover(prefix, limit):
    rows = cdx({"url": prefix, "matchType": "prefix", "output": "json", "fl": "timestamp,original",
                "filter": ["statuscode:200", "mimetype:text/html"], "collapse": "urlkey", "limit": limit})
    print(f"## {prefix}: {len(rows)} archived pages")
    for ts, original in rows:
        print(f"https://web.archive.org/web/{ts}/{original}")


def load_items():
    """Yield (file_key, index, label, url, date) for every link the site shows."""
    geo = json.loads(GEOJSON.read_text())
    for i, f in enumerate(geo["features"]):
        p = f["properties"]
        if p.get("url"):
            yield "geojson", i, p["eventName"], p["url"], p.get("endDate")
    if ARCHIVES.exists():
        for i, a in enumerate(json.loads(ARCHIVES.read_text())):
            yield "archives", i, f'{a["camp"]}: {a["title"]}', a["url"], a.get("date")


def apply_fixes(fixes):
    """fixes: {"geojson": {index: snapshot_url}, "archives": {index: snapshot_url}}"""
    n = 0
    geo = json.loads(GEOJSON.read_text())
    for i, snap in fixes.get("geojson", {}).items():
        p = geo["features"][int(i)]["properties"]
        p["originalUrl"], p["url"] = p["url"], snap
        n += 1
    if n:
        GEOJSON.write_text(json.dumps(geo, indent=1, ensure_ascii=False) + "\n")
    if ARCHIVES.exists() and fixes.get("archives"):
        arch = json.loads(ARCHIVES.read_text())
        for i, snap in fixes["archives"].items():
            arch[int(i)]["originalUrl"], arch[int(i)]["url"] = arch[int(i)]["url"], snap
            n += 1
        ARCHIVES.write_text(json.dumps(arch, indent=2, ensure_ascii=False) + "\n")
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fix", action="store_true", help="rewrite dead links to their archive copies")
    ap.add_argument("--fixes-from", metavar="FILE", help="apply the fixes in a saved report, without network")
    ap.add_argument("--discover", nargs="+", metavar="PREFIX", help="list archived pages under each URL prefix")
    ap.add_argument("--limit", type=int, default=60, help="max pages per prefix for --discover")
    ap.add_argument("--report", metavar="FILE", help="write the JSON report here")
    ap.add_argument("--workers", type=int, default=4, help="links to check at the same time")
    args = ap.parse_args()

    if args.fixes_from:
        print(f"applied {apply_fixes(json.loads(Path(args.fixes_from).read_text())['fixes'])} fixes")
        return 0
    if args.discover:
        for prefix in args.discover:
            discover(prefix, args.limit)
            time.sleep(2)
        return 0

    def examine(item):
        key, i, label, url, date = item
        r = check(url)
        archived = bool(WAYBACK.match(url))
        verdict = ("archived" if r["live"] else "dead-archive") if archived else ("live" if r["live"] else "dead")
        if not archived and r["status"] in BLOCKED:
            verdict = "blocked"  # the site answered but refused an automated visitor; a person can likely open it
        if archived and r["status"] is None:
            verdict = "unreachable"  # the Internet Archive did not answer; that says nothing about the copy
        snap = None
        if verdict.startswith("dead"):
            original = WAYBACK.sub("", url).split("/", 1)[-1] if archived else url
            snap = find_snapshot(original, date)
        return {"file": key, "i": i, "label": label, "url": url, "verdict": verdict, "snapshot": snap, **r}

    # A few at a time: dead hosts and the Internet Archive are both slow to answer.
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(examine, load_items()))

    fixes, unresolved = {"geojson": {}, "archives": {}}, 0
    for r in results:
        snap = r["snapshot"]
        if r["verdict"].startswith("dead"):
            if snap and snap != r["url"]:
                fixes[r["file"]][str(r["i"])] = snap
            else:
                unresolved += 1
        detail = r["error"] or f'{r["status"]} "{r["title"]}"' + ("" if r["mentions"] else " (no WhereCamp mention)")
        print(f"[{r['verdict']:12}] {r['label']}\n    {r['url']}\n    {detail}" + (f"\n    -> {r['final']}" if r["final"] else "")
              + (f"\n    archive: {snap}" if snap else ""), flush=True)

    report = {"results": results, "fixes": fixes}
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2))
    print("\nFIXES_JSON=" + json.dumps(fixes, separators=(",", ":")))
    dead = sum(r["verdict"].startswith("dead") for r in results)
    blocked = sum(r["verdict"] in ("blocked", "unreachable") for r in results)
    print(f"\n{len(results)} links: {len(results) - dead - blocked} ok, {blocked} could not be checked, "
          f"{dead} dead, {unresolved} dead with no archive copy")
    if args.fix:
        print(f"rewrote {apply_fixes(fixes)} links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
