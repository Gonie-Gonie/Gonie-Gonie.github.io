#!/usr/bin/env python3
"""Validate the website data and generate bibliography exports.

This script uses only the Python standard library so it can run on a normal
Windows Python installation without pip packages.
"""

from __future__ import annotations

import argparse
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
SOFTWARE_STAGES = {"release", "preview", "development"}
MAIN_PAGE_SECTIONS = [
    "experience",
    "education",
    "scholarships",
    "certifications",
    "awards",
    "teaching",
    "skills",
]
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


def read_json(name: str) -> Any:
    path = DATA_DIR / name
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def split_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(part).strip() for part in value if str(part).strip()]
    return [part.strip() for part in str(value or "").split(";") if part.strip()]


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"true", "1", "yes", "y"}


def localized_value(item: dict[str, Any], key: str, language: str = "en") -> str:
    return (
        item.get(f"{key}_{language}", "")
        or item.get(key, "")
        or item.get(f"{key}_en", "")
        or item.get(f"{key}_ko", "")
    )


def localized_list(item: dict[str, Any], key: str, language: str = "en") -> list[str]:
    for field in (f"{key}_{language}", key, f"{key}_en", f"{key}_ko"):
        values = split_list(item.get(field))
        if values:
            return values
    return []


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


def unique_ids(rows: list[dict[str, Any]], label: str, errors: list[str]) -> set[str]:
    ids = [str(row.get("id", "")).strip() for row in rows]
    missing = [index + 1 for index, value in enumerate(ids) if not value]
    if missing:
        errors.append(f"{label}: missing id at record position(s) {missing}.")
    duplicates = [item for item, count in Counter(ids).items() if item and count > 1]
    if duplicates:
        errors.append(f"{label}: duplicate id(s): {', '.join(sorted(duplicates))}.")
    return {value for value in ids if value}


def validate_fields(
    value: Any, expected: list[str], label: str, errors: list[str]
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        errors.append(f"{label}: top-level value must be an array.")
        return []

    rows: list[dict[str, Any]] = []
    expected_fields = set(expected)
    for index, row in enumerate(value, start=1):
        if not isinstance(row, dict):
            errors.append(f"{label} item {index}: must be an object.")
            continue
        rows.append(row)
        actual_fields = set(row)
        missing = [field for field in expected if field not in actual_fields]
        unexpected = sorted(actual_fields - expected_fields)
        if missing:
            errors.append(f"{label} item {index}: missing field(s): {', '.join(missing)}.")
        if unexpected:
            errors.append(f"{label} item {index}: unexpected field(s): {', '.join(unexpected)}.")
    return rows


def validate_references(
    rows: list[dict[str, Any]],
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
    publications = validate_fields(
        data["publications"], PUBLICATION_FIELDS, "publications.json", errors
    )
    awards = validate_fields(data["awards"], AWARD_FIELDS, "awards.json", errors)
    board = data["board"]

    main_page_sections = settings.get("main_page_sections")
    if (
        not isinstance(main_page_sections, list)
        or not all(isinstance(section, str) for section in main_page_sections)
        or len(main_page_sections) != len(MAIN_PAGE_SECTIONS)
        or len(set(main_page_sections)) != len(MAIN_PAGE_SECTIONS)
        or set(main_page_sections) != set(MAIN_PAGE_SECTIONS)
    ):
        errors.append(
            "settings.json: main_page_sections must contain each supported section exactly once: "
            + ", ".join(MAIN_PAGE_SECTIONS)
            + "."
        )

    unique_ids(software, "software.json", errors)
    people_ids = unique_ids(people, "people.json", errors)
    award_ids = unique_ids(awards, "awards.json", errors)

    validate_references(publications, "author_ids", people_ids, "publications.json", errors)

    for index, award in enumerate(awards, start=1):
        context = f"awards.json item {index}"
        for field in AWARD_FIELDS:
            if not isinstance(award.get(field), str):
                errors.append(f"{context}: {field} must be a string.")

    for index, item in enumerate(software, start=1):
        context = f"software.json item {index}"
        if item.get("stage") not in SOFTWARE_STAGES:
            errors.append(f"{context}: stage must be release, preview, or development.")
        if any(field in item for field in ("summary", "summary_en", "summary_ko")):
            errors.append(f"{context}: use notes_en and notes_kr instead of summary.")
        for field in ("notes_en", "notes_kr"):
            notes_value = item.get(field)
            if (
                not isinstance(notes_value, list)
                or not notes_value
                or any(not isinstance(note, str) or not note.strip() for note in notes_value)
            ):
                errors.append(
                    f"{context}: {field} must be a non-empty array of non-empty strings."
                )
        if (
            isinstance(item.get("notes_en"), list)
            and isinstance(item.get("notes_kr"), list)
            and len(item["notes_en"]) != len(item["notes_kr"])
        ):
            errors.append(f"{context}: notes_en and notes_kr must contain the same number of items.")

    for index, item in enumerate(board, start=1):
        context = f"board.json item {index}"
        if "date" in item:
            errors.append(f"{context}: use start_date and end_date instead of date.")
        start_date = str(item.get("start_date") or "").strip()
        end_date = str(item.get("end_date") or "").strip()
        parsed_start: datetime | None = None
        parsed_end: datetime | None = None
        try:
            parsed_start = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            errors.append(f"{context}: start_date must use YYYY-MM-DD.")
        if end_date:
            try:
                parsed_end = datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                errors.append(f"{context}: end_date must be blank or use YYYY-MM-DD.")
        if parsed_start and parsed_end and parsed_start > parsed_end:
            errors.append(f"{context}: start_date must not be later than end_date.")
        for field in ("content_en", "content_ko"):
            if not isinstance(item.get(field), str):
                errors.append(f"{context}: {field} must be a string.")

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
        if any(field in project for field in ("summary", "summary_en", "summary_ko")):
            errors.append(f"{context}: use notes_en and notes_kr instead of summary.")
        for field in ("notes_en", "notes_kr"):
            notes_value = project.get(field)
            if (
                not isinstance(notes_value, list)
                or not notes_value
                or any(not isinstance(note, str) or not note.strip() for note in notes_value)
            ):
                errors.append(
                    f"{context}: {field} must be a non-empty array of non-empty strings."
                )
        if (
            isinstance(project.get("notes_en"), list)
            and isinstance(project.get("notes_kr"), list)
            and len(project["notes_en"]) != len(project["notes_kr"])
        ):
            errors.append(f"{context}: notes_en and notes_kr must contain the same number of items.")
        for media_index, media_item in enumerate(project.get("media", []), start=1):
            media_context = f"{context} media {media_index}"
            if "caption_kr" in media_item or "caption-en" in media_item:
                errors.append(f"{media_context}: use caption_en and caption_ko.")
            caption_en = str(media_item.get("caption_en") or "").strip()
            caption_ko = str(media_item.get("caption_ko") or "").strip()
            if bool(caption_en) != bool(caption_ko):
                errors.append(
                    f"{media_context}: caption_en and caption_ko must both be filled or both be blank."
                )
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
        context = f"publications.json item {index}"
        for field in PUBLICATION_FIELDS:
            if field in {"keywords_en", "keywords_ko", "author_ids", "under_review", "in_press"}:
                continue
            if not isinstance(publication.get(field), str):
                errors.append(f"{context}: {field} must be a string.")
        if not localized_value(publication, "title"):
            errors.append(f"{context}: at least one localized title is required.")
        for keyword_field in ("keywords_en", "keywords_ko"):
            keyword_value = publication.get(keyword_field)
            if not isinstance(keyword_value, list) or any(
                not isinstance(keyword, str) or not keyword.strip()
                for keyword in keyword_value or []
            ):
                errors.append(
                    f"{context}: {keyword_field} must be an array of non-empty strings."
                )
            elif any(keyword != keyword.lower() for keyword in keyword_value):
                errors.append(f"{context}: {keyword_field} must use lowercase.")
        author_ids = publication.get("author_ids")
        if not isinstance(author_ids, list) or not author_ids or any(
            not isinstance(author_id, str) or not author_id.strip()
            for author_id in author_ids or []
        ):
            errors.append(f"{context}: author_ids must be a non-empty array of strings.")
        if publication.get("publication_type") not in PUBLICATION_TYPES:
            errors.append(
                f"{context}: unsupported publication_type "
                f"'{publication.get('publication_type')}'."
            )
        for status_field in ("under_review", "in_press"):
            if not isinstance(publication.get(status_field), bool):
                errors.append(f"{context}: {status_field} must be a boolean.")
        if truthy(publication.get("under_review")) and truthy(publication.get("in_press")):
            errors.append(
                f"{context}: under_review and in_press cannot both be true."
            )
        raw_date = publication.get("date")
        date_value = raw_date.strip() if isinstance(raw_date, str) else ""
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
        raw_award_id = publication.get("award_id")
        award_id = raw_award_id.strip() if isinstance(raw_award_id, str) else ""
        if award_id and award_id not in award_ids:
            errors.append(f"{context}: unknown award_id reference '{award_id}'.")
    profile = data["profile"]
    for key in ("schema_version", "identity", "profile_card", "intro", "contact", "experience", "education", "scholarships"):
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
        "publications": read_json("publications.json"),
        "awards": read_json("awards.json"),
        "board": read_json("board.json"),
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
    keywords = localized_list(publication, "keywords")
    if keywords:
        fields.append(f"  keywords = {{{bibtex_escape('; '.join(keywords))}}}")
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
        lines.extend(f"KW  - {keyword}" for keyword in localized_list(item, "keywords"))
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
        keywords = localized_list(item, "keywords")
        if keywords:
            entry["keyword"] = "; ".join(keywords)
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
        "counts": {
            "projects": len(data["projects"]),
            "software": len(data["software"]),
            "publications": len(data["publications"]),
            "people": len(data["people"]),
            "awards": len(data["awards"]),
            "board": len(data["board"]),
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
    except (FileNotFoundError, json.JSONDecodeError) as error:
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
