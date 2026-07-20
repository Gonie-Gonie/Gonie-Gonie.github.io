#!/usr/bin/env python3
"""Validate the website data and generate bibliography exports.

This script uses only the Python standard library so it can run on a normal
Windows Python installation without pip packages.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
GENERATED_DIR = ROOT / "app" / "generated"
PUBLICATION_TYPES = {
    "international-journal",
    "domestic-journal",
    "international-conference",
    "domestic-conference",
}
PUBLICATION_FIELDS = [
    "title_en",
    "title_ko",
    "abstract_en",
    "abstract_ko",
    "keywords_en",
    "keywords_ko",
    "author_ids",
    "date",
    "venue",
    "under_review",
    "in_press",
    "publication_type",
    "topic",
    "award_id",
    "doi",
    "url",
    "note",
]
AWARD_FIELDS = [
    "id",
    "date",
    "title_en",
    "title_ko",
    "organization_en",
    "organization_ko",
]


def read_csv(name: str) -> list[dict[str, str]]:
    path = DATA_DIR / name
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def read_json(name: str) -> Any:
    path = DATA_DIR / name
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def split_list(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(";") if part.strip()]


def truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"true", "1", "yes", "y"}


def localized_value(item: dict[str, str], key: str, language: str = "en") -> str:
    return (
        item.get(f"{key}_{language}", "")
        or item.get(key, "")
        or item.get(f"{key}_en", "")
        or item.get(f"{key}_ko", "")
    )


def person_name(person: dict[str, Any], language: str = "en") -> str:
    return (
        person.get(f"name_{language}", "")
        or person.get("name_en", "")
        or person.get("name_ko", "")
        or person.get("id", "")
    )


def is_journal(publication: dict[str, Any]) -> bool:
    return str(publication.get("publication_type", "")).endswith("-journal")


def publication_status(publication: dict[str, Any]) -> str:
    if truthy(publication.get("under_review")):
        return "under review"
    if truthy(publication.get("in_press")):
        return "in press"
    return ""


def publication_status_rank(publication: dict[str, Any]) -> int:
    if truthy(publication.get("under_review")):
        return 2
    if truthy(publication.get("in_press")):
        return 1
    return 0


def publication_date_parts(publication: dict[str, Any]) -> list[int]:
    return [int(part) for part in str(publication.get("date", "")).split("-") if part]


def publication_year(publication: dict[str, Any]) -> str:
    parts = publication_date_parts(publication)
    return str(parts[0]) if parts else ""


def unique_ids(rows: list[dict[str, str]], label: str, errors: list[str]) -> set[str]:
    ids = [str(row.get("id", "")).strip() for row in rows]
    missing = [index + 2 for index, value in enumerate(ids) if not value]
    if missing:
        errors.append(f"{label}: missing id at record position(s) {missing}.")
    duplicates = [item for item, count in Counter(ids).items() if item and count > 1]
    if duplicates:
        errors.append(f"{label}: duplicate id(s): {', '.join(sorted(duplicates))}.")
    return {value for value in ids if value}


def validate_fields(
    rows: list[dict[str, str]], expected: list[str], label: str, errors: list[str]
) -> None:
    if rows and list(rows[0]) != expected:
        errors.append(f"{label}: columns must be {', '.join(expected)}.")


def validate_references(
    rows: list[dict[str, str]],
    field: str,
    valid_ids: set[str],
    label: str,
    errors: list[str],
) -> None:
    for index, row in enumerate(rows, start=1):
        item_label = str(row.get("id") or f"item {index}")
        for reference in split_list(row.get(field)):
            if reference not in valid_ids:
                errors.append(f"{label} '{item_label}': unknown {field} reference '{reference}'.")


def validate(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    settings = data["settings"]
    people = data["people"]
    projects = data["projects"]
    software = data["software"]
    publications = data["publications"]
    awards = data["awards"]
    notes = data["notes"]

    unique_ids(software, "software.json", errors)
    people_ids = unique_ids(people, "people.json", errors)
    award_ids = unique_ids(awards, "awards.csv", errors)
    unique_ids(notes, "notes.json", errors)

    validate_fields(publications, PUBLICATION_FIELDS, "publications.csv", errors)
    validate_fields(awards, AWARD_FIELDS, "awards.csv", errors)
    validate_references(publications, "author_ids", people_ids, "publications.csv", errors)

    self_people = [person for person in people if person.get("is_self") is True]
    if len(self_people) != 1:
        errors.append("people.json: exactly one person must have is_self set to true.")
    for person in people:
        person_id = person.get("id", "<missing>")
        if not localized_value(person, "name"):
            errors.append(f"people.json '{person_id}': a localized name is required.")
        for language in ("en", "ko"):
            notes = person.get(f"notes_{language}")
            if not isinstance(notes, list) or any(
                not isinstance(note, str) or not note.strip() for note in notes
            ):
                errors.append(
                    f"people.json '{person_id}': notes_{language} must be a list of non-empty strings."
                )

    project_themes = settings.get("project_themes", [])
    if not isinstance(project_themes, list) or not project_themes:
        errors.append("settings.json: project_themes must be a non-empty list.")
        project_themes = []
    unique_ids(project_themes, "settings.json project_themes", errors)
    for theme in project_themes:
        theme_id = theme.get("id", "<missing>")
        if not localized_value(theme, "label"):
            errors.append(f"settings.json project theme '{theme_id}': a localized label is required.")

    project_theme_fallback = settings.get("project_theme_fallback", {})
    if not isinstance(project_theme_fallback, dict) or not localized_value(project_theme_fallback, "label"):
        errors.append("settings.json: project_theme_fallback requires a localized label.")

    for index, project in enumerate(projects, start=1):
        context = f"projects.json item {index}"
        if "id" in project:
            errors.append(f"{context}: id is not used.")
        if "period" in project:
            errors.append(f"{context}: use start_date and end_date instead of period.")
        parsed_dates: dict[str, datetime] = {}
        for field in ("start_date", "end_date"):
            value = str(project.get(field) or "").strip()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                errors.append(f"{context}: {field} must use YYYY-MM-DD.")
                continue
            try:
                parsed_dates[field] = datetime.strptime(value, "%Y-%m-%d")
            except ValueError:
                errors.append(f"{context}: invalid {field} '{value}'.")
        if parsed_dates.get("start_date") and parsed_dates.get("end_date"):
            if parsed_dates["start_date"] > parsed_dates["end_date"]:
                errors.append(f"{context}: start_date must not be later than end_date.")
        if not str(project.get("theme") or "").strip():
            errors.append(f"{context}: theme is required.")

    publication_topics = settings.get("publication_topics", [])
    if not isinstance(publication_topics, list) or not publication_topics:
        errors.append("settings.json: publication_topics must be a non-empty list.")
        publication_topics = []
    unique_ids(publication_topics, "settings.json publication_topics", errors)
    for topic in publication_topics:
        topic_id = topic.get("id", "<missing>")
        if not localized_value(topic, "label"):
            errors.append(f"settings.json publication topic '{topic_id}': a localized label is required.")

    topic_fallback = settings.get("publication_topic_fallback", {})
    if not isinstance(topic_fallback, dict) or not localized_value(topic_fallback, "label"):
        errors.append("settings.json: publication_topic_fallback requires a localized label.")

    for index, publication in enumerate(publications, start=1):
        context = f"publications.csv item {index}"
        if not localized_value(publication, "title"):
            errors.append(f"{context}: at least one localized title is required.")
        for keyword_field in ("keywords_en", "keywords_ko"):
            keyword_value = publication.get(keyword_field, "")
            if keyword_value != keyword_value.lower():
                errors.append(f"{context}: {keyword_field} must use lowercase.")
        if publication.get("publication_type") not in PUBLICATION_TYPES:
            errors.append(
                f"{context}: unsupported publication_type "
                f"'{publication.get('publication_type')}'."
            )
        for status_field in ("under_review", "in_press"):
            if publication.get(status_field, "").strip().lower() not in {"true", "false"}:
                errors.append(
                    f"{context}: {status_field} must be 'true' or 'false'."
                )
        if truthy(publication.get("under_review")) and truthy(publication.get("in_press")):
            errors.append(
                f"{context}: under_review and in_press cannot both be true."
            )
        date_value = publication.get("date", "").strip()
        has_status = bool(publication_status(publication))
        if has_status and date_value:
            errors.append(
                f"{context}: date must be blank while a publication status is active."
            )
        if not has_status and not date_value:
            errors.append(
                f"{context}: date is required when no publication status is active."
            )
        if date_value:
            if not re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?", date_value):
                errors.append(
                    f"{context}: date must use YYYY, YYYY-MM, or YYYY-MM-DD."
                )
            else:
                date_format = {4: "%Y", 7: "%Y-%m", 10: "%Y-%m-%d"}[len(date_value)]
                try:
                    datetime.strptime(date_value, date_format)
                except ValueError:
                    errors.append(f"{context}: invalid date '{date_value}'.")
        if not split_list(publication.get("author_ids")):
            errors.append(f"{context}: at least one author_id is required.")
        award_id = publication.get("award_id", "").strip()
        if award_id and award_id not in award_ids:
            errors.append(f"{context}: unknown award_id reference '{award_id}'.")
    profile = data["profile"]
    for key in ("schema_version", "last_updated", "identity", "profile_card", "intro", "contact", "experience", "education", "scholarships"):
        if key not in profile:
            errors.append(f"profile.json: missing top-level key '{key}'.")

    profile_card = profile.get("profile_card", {})
    if not isinstance(profile_card.get("credentials"), list):
        errors.append("profile.json: profile_card.credentials must be a list.")
    if not isinstance(profile.get("scholarships"), list):
        errors.append("profile.json: scholarships must be a list.")
    for index, scholarship in enumerate(profile.get("scholarships", []), start=1):
        if not isinstance(scholarship.get("details", []), list):
            errors.append(f"profile.json: scholarships[{index}].details must be a list.")

    return errors


def load_all() -> dict[str, Any]:
    return {
        "settings": read_json("settings.json"),
        "profile": read_json("profile.json"),
        "people": read_json("people.json"),
        "projects": read_json("projects.json"),
        "software": read_json("software.json"),
        "publications": read_csv("publications.csv"),
        "awards": read_csv("awards.csv"),
        "notes": read_json("notes.json"),
    }


def latex_escape(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in str(value))


def bibtex_escape(value: str) -> str:
    return latex_escape(value)


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    digits: list[str] = []
    while value:
        value, remainder = divmod(value, 36)
        digits.append(alphabet[remainder])
    return "".join(reversed(digits))


def publication_citation_key(publication: dict[str, Any]) -> str:
    source = str(publication.get("doi") or publication.get("url") or "")
    if not source:
        source = "|".join(
            [
                localized_value(publication, "title", "en"),
                str(publication.get("date", "")),
                "|".join(person_name(author, "en") for author in publication.get("authors", [])),
            ]
        )
    hash_value = 2166136261
    for char in source:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    year = publication_year(publication) or "nd"
    return f"publication-{year}-{base36(hash_value)}"


def bibtex_entry(publication: dict[str, Any]) -> str:
    entry_type = "article" if is_journal(publication) else "inproceedings"
    container_field = "journal" if entry_type == "article" else "booktitle"
    date_label = publication_year(publication) or publication_status(publication) or "n.d."
    fields = [
        f"  title = {{{bibtex_escape(localized_value(publication, 'title'))}}}",
        "  author = {"
        + " and ".join(bibtex_escape(person_name(author)) for author in publication.get("authors", []))
        + "}",
        f"  year = {{{date_label}}}",
        f"  {container_field} = {{{bibtex_escape(publication.get('venue', ''))}}}",
    ]
    if publication.get("doi"):
        fields.append(f"  doi = {{{publication['doi']}}}")
    if publication.get("url"):
        fields.append(f"  url = {{{publication['url']}}}")
    if localized_value(publication, "abstract"):
        fields.append(f"  abstract = {{{bibtex_escape(localized_value(publication, 'abstract'))}}}")
    if localized_value(publication, "keywords"):
        fields.append(f"  keywords = {{{bibtex_escape(localized_value(publication, 'keywords'))}}}")
    return f"@{entry_type}{{{publication_citation_key(publication)},\n" + ",\n".join(fields) + "\n}"


def publications_bibtex(publications: Iterable[dict[str, Any]]) -> str:
    return "\n\n".join(bibtex_entry(item) for item in publications) + "\n"


def publications_ris(publications: Iterable[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for item in publications:
        date_label = publication_year(item) or publication_status(item) or "n.d."
        lines = [
            f"TY  - {'JOUR' if is_journal(item) else 'CPAPER'}",
            f"TI  - {localized_value(item, 'title')}",
        ]
        lines.extend(f"AU  - {person_name(author)}" for author in item.get("authors", []))
        lines.append(f"PY  - {date_label}")
        venue = str(item.get("venue", "")).strip()
        if venue:
            lines.append(f"{'JO' if is_journal(item) else 'T2'}  - {venue}")
        if item.get("doi"):
            lines.append(f"DO  - {item['doi']}")
        if item.get("url"):
            lines.append(f"UR  - {item['url']}")
        abstract = localized_value(item, "abstract").strip()
        if abstract:
            lines.append(f"AB  - {abstract}")
        lines.extend(f"KW  - {keyword}" for keyword in split_list(localized_value(item, "keywords")))
        lines.append("ER  -")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks) + "\n"


def parse_csl_author(author: str) -> dict[str, str]:
    if "," in author:
        family, given = author.split(",", 1)
        return {"family": family.strip(), "given": given.strip()}
    return {"literal": author.strip()}


def publications_csl(publications: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in publications:
        entry: dict[str, Any] = {
            # CSL JSON requires an id; this deterministic export key is generated
            # at build time and is not a publication field in user data.
            "id": publication_citation_key(item),
            "type": "article-journal"
            if is_journal(item)
            else "paper-conference",
            "title": localized_value(item, "title"),
            "author": [parse_csl_author(person_name(author)) for author in item.get("authors", [])],
            "container-title": item.get("venue", ""),
        }
        date_parts = publication_date_parts(item)
        if date_parts:
            entry["issued"] = {"date-parts": [date_parts]}
        if publication_status(item):
            entry["status"] = publication_status(item)
        if item.get("doi"):
            entry["DOI"] = item["doi"]
        if item.get("url"):
            entry["URL"] = item["url"]
        if localized_value(item, "abstract"):
            entry["abstract"] = localized_value(item, "abstract")
        if localized_value(item, "keywords"):
            entry["keyword"] = localized_value(item, "keywords")
        output.append(entry)
    return output


def sort_publications(publications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def sort_key(item: dict[str, Any]) -> tuple[int, int, int, int, str]:
        date_parts = publication_date_parts(item) + [0, 0, 0]
        year, month, day = date_parts[:3]
        return (
            -publication_status_rank(item),
            -year,
            -month,
            -day,
            localized_value(item, "title").lower(),
        )

    return sorted(publications, key=sort_key)


def generate(data: dict[str, Any]) -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    people_by_id = {person["id"]: person for person in data["people"]}
    publications = sort_publications([
        {
            **publication,
            "authors": [
                people_by_id[person_id]
                for person_id in split_list(publication.get("author_ids"))
            ],
        }
        for publication in data["publications"]
    ])

    (GENERATED_DIR / "publications.bib").write_text(
        publications_bibtex(publications), encoding="utf-8", newline="\n"
    )
    (GENERATED_DIR / "publications.ris").write_text(
        publications_ris(publications), encoding="utf-8", newline="\n"
    )
    (GENERATED_DIR / "publications.csl.json").write_text(
        json.dumps(publications_csl(publications), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    report = {
        "schema_version": 1,
        "source_last_updated": str(data["profile"].get("last_updated") or ""),
        "counts": {
            "projects": len(data["projects"]),
            "software": len(data["software"]),
            "publications": len(data["publications"]),
            "people": len(data["people"]),
            "awards": len(data["awards"]),
            "notes": len(data["notes"]),
        },
        "publication_types": dict(
            sorted(Counter(item["publication_type"] for item in data["publications"]).items())
        ),
    }
    (GENERATED_DIR / "build-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate data without regenerating exported files.",
    )
    args = parser.parse_args()

    try:
        data = load_all()
    except (FileNotFoundError, json.JSONDecodeError, csv.Error) as error:
        print(f"ERROR: could not read data: {error}", file=sys.stderr)
        return 1

    errors = validate(data)
    if errors:
        print("Validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if not args.validate_only:
        generate(data)
        print(f"Generated exports in: {GENERATED_DIR}")
    print(
        "Validated "
        f"{len(data['publications'])} publications, "
        f"{len(data['projects'])} projects, and "
        f"{len(data['software'])} software records."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
