"""Refresh keyless OpenAlex counts, preserving verified KCI counts on disk."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "data/publication-citations.json"


def normalize_doi(value: str) -> str:
    doi = re.sub(r"^doi:\s*", "", str(value or "").strip(), flags=re.I)
    doi = re.sub(r"^(?:https?://)?(?:dx\.)?doi\.org/", "", doi, flags=re.I).lower()
    return doi if re.fullmatch(r"10\.\d{4,9}/\S+", doi) else ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kci-count", nargs=2, action="append", default=[], metavar=("DOI", "COUNT"),
                        help="Record a manually verified count for an existing KCI article.")
    parser.add_argument("--kci-only", action="store_true", help="Skip the OpenAlex request.")
    args = parser.parse_args()
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8")) if SNAPSHOT.exists() else {"version": 1, "records": {}}
    if snapshot.get("version") != 1 or not isinstance(snapshot.get("records"), dict):
        parser.error("Invalid citation snapshot")
    records = snapshot["records"]
    publications = json.loads((ROOT / "data/publications.json").read_text(encoding="utf-8"))
    eligible = {normalize_doi(item.get("doi")) for item in publications
                if not item.get("under_review") and not item.get("in_press")}
    eligible.discard("")
    updates = []
    for doi, value in args.kci_count:
        key = normalize_doi(doi)
        record = records.get(key)
        if key not in eligible or not record or record.get("provider") != "kci":
            parser.error(f"No published, mapped KCI article for {doi}")
        if not re.fullmatch(r"\d+", value) or int(value) > 9007199254740991:
            parser.error("KCI count must be a nonnegative safe integer")
        updates.append((key, int(value)))

    failed = False
    matched = 0
    pending = sorted(doi for doi in eligible if records.get(doi, {}).get("provider") != "kci")
    if not args.kci_only:
        for offset in range(0, len(pending), 100):
            batch = pending[offset:offset + 100]
            url = "https://api.openalex.org/works?" + urlencode({
                "filter": "doi:" + "|".join(batch), "select": "id,doi,cited_by_count", "per_page": 100
            })
            try:
                request = Request(url, headers={"Accept": "application/json"})
                with urlopen(request, timeout=12) as response:
                    data = json.load(response)
                if not isinstance(data.get("results"), list):
                    raise ValueError("Invalid OpenAlex response")
                checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
                for work in data["results"]:
                    doi = normalize_doi(work.get("doi"))
                    work_id = str(work.get("id", "")).removeprefix("https://openalex.org/")
                    count = work.get("cited_by_count")
                    if doi not in batch or not re.fullmatch(r"W\d+", work_id):
                        continue
                    if type(count) is not int or count < 0 or count > 9007199254740991:
                        continue
                    records[doi] = {"provider": "openalex", "work_id": work_id,
                                    "count": count, "checked_at": checked_at}
                    matched += 1
            except Exception as error:
                print(f"OpenAlex refresh failed; existing counts and dates retained: {error}", file=sys.stderr)
                failed = True

    for doi, count in updates:
        records[doi]["count"] = count
        records[doi]["checked_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # Remove records for deleted/unpublished papers; leave unknown results unknown.
    snapshot["records"] = {doi: record for doi, record in sorted(records.items()) if doi in eligible}
    content = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    if not SNAPSHOT.exists() or SNAPSHOT.read_text(encoding="utf-8") != content:
        temporary = SNAPSHOT.with_suffix(".json.tmp")
        temporary.write_text(content, encoding="utf-8", newline="\n")
        temporary.replace(SNAPSHOT)
    print(f"OpenAlex: {matched} updated; KCI: {len(updates)} manually verified; total: {len(snapshot['records'])}.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
