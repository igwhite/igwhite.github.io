#!/usr/bin/env python3
"""
Fetch publications from a Google Scholar profile and write them to a JSON file
that a static GitHub Pages site can display.

Two backends:
  * SerpAPI (reliable; needs a free/paid key)  -> used when SERPAPI_KEY is set
  * scholarly (free; scrapes Scholar directly) -> used otherwise. Google often
    blocks GitHub Actions IPs, so expect occasional failures with this one.

Environment variables:
  SCHOLAR_ID   (required)  the "user=" value from your Scholar profile URL,
                           e.g. https://scholar.google.com/citations?user=AbCdEfGhIjk
  SERPAPI_KEY  (optional)  SerpAPI key; switches to the SerpAPI backend
  OUTPUT_PATH  (optional)  default: data/publications.json
  FILL_AUTHORS (optional)  "1" to fetch full author lists with scholarly
                           (one request per paper; slow and more likely blocked)

If fetching fails, the existing JSON file is left untouched so your site keeps
showing the last good data.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

SCHOLAR_ID = os.environ.get("SCHOLAR_ID", "").strip()
SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "").strip()
OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "data/publications.json")
FILL_AUTHORS = os.environ.get("FILL_AUTHORS", "0") == "1"

PROFILE_URL = f"https://scholar.google.com/citations?user={SCHOLAR_ID}"


def to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- #
# SerpAPI backend
# --------------------------------------------------------------------------- #
def fetch_serpapi():
    profile = {}
    publications = []
    start = 0
    page_size = 100

    while True:
        resp = requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google_scholar_author",
                "author_id": SCHOLAR_ID,
                "api_key": SERPAPI_KEY,
                "num": page_size,
                "start": start,
                "sort": "pubdate",
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"SerpAPI error: {data['error']}")

        if not profile:
            author = data.get("author", {})
            metrics = {}
            for row in data.get("cited_by", {}).get("table", []):
                for key, val in row.items():
                    metrics[key] = to_int(val.get("all"))
            profile = {
                "name": author.get("name", ""),
                "affiliation": author.get("affiliations", ""),
                "citations": metrics.get("citations", 0),
                "h_index": metrics.get("h_index", 0),
                "i10_index": metrics.get("i10_index", 0),
                "url": PROFILE_URL,
            }

        articles = data.get("articles", [])
        for art in articles:
            publications.append({
                "title": art.get("title", ""),
                "authors": art.get("authors", ""),
                "venue": art.get("publication", ""),
                "year": to_int(art.get("year"), None),
                "citations": to_int((art.get("cited_by") or {}).get("value")),
                "url": art.get("link", ""),
            })

        if len(articles) < page_size or not data.get("serpapi_pagination", {}).get("next"):
            break
        start += page_size

    return profile, publications


# --------------------------------------------------------------------------- #
# scholarly backend
# --------------------------------------------------------------------------- #
def fetch_scholarly():
    from scholarly import scholarly  # imported lazily so SerpAPI users don't need it

    author = scholarly.search_author_id(SCHOLAR_ID)
    author = scholarly.fill(author, sections=["basics", "indices", "publications"])

    profile = {
        "name": author.get("name", ""),
        "affiliation": author.get("affiliation", ""),
        "citations": to_int(author.get("citedby")),
        "h_index": to_int(author.get("hindex")),
        "i10_index": to_int(author.get("i10index")),
        "url": PROFILE_URL,
    }

    publications = []
    for pub in author.get("publications", []):
        if FILL_AUTHORS:
            try:
                pub = scholarly.fill(pub)
                time.sleep(2)  # be gentle; reduces the chance of being blocked
            except Exception as exc:  # keep going with partial data
                print(f"  could not fill '{pub.get('bib', {}).get('title')}': {exc}")

        bib = pub.get("bib", {})
        pub_id = pub.get("author_pub_id", "")
        url = (
            f"https://scholar.google.com/citations?view_op=view_citation"
            f"&citation_for_view={pub_id}" if pub_id else ""
        )
        publications.append({
            "title": bib.get("title", ""),
            "authors": bib.get("author", "").replace(" and ", ", "),
            "venue": bib.get("journal") or bib.get("conference") or bib.get("venue")
                     or bib.get("citation", ""),
            "year": to_int(bib.get("pub_year"), None),
            "citations": to_int(pub.get("num_citations")),
            "url": pub.get("pub_url") or url,
        })

    return profile, publications


# --------------------------------------------------------------------------- #
def main():
    if not SCHOLAR_ID:
        sys.exit("SCHOLAR_ID is not set.")

    backend = "serpapi" if SERPAPI_KEY else "scholarly"
    print(f"Fetching Scholar profile {SCHOLAR_ID} via {backend}...")

    try:
        profile, publications = fetch_serpapi() if SERPAPI_KEY else fetch_scholarly()
    except Exception as exc:
        sys.exit(f"Fetch failed ({backend}): {exc}\nExisting data left unchanged.")

    if not publications:
        sys.exit("No publications returned; existing data left unchanged.")

    publications.sort(key=lambda p: (p["year"] or 0, p["citations"]), reverse=True)

    output = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "profile": profile,
        "publications": publications,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    print(f"Wrote {len(publications)} publications to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
