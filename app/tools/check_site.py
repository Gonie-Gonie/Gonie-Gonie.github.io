#!/usr/bin/env python3
"""Check local static references and basic HTML integrity.

Uses only the Python standard library and is safe to run on Windows.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
CONTENT_MEDIA_DIR = (ROOT / "data" / "media").resolve()
HTML_FILES = [ROOT / "index.html", ROOT / "cv.html"]


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str, int]] = []
        self.ids: list[tuple[str, int]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append((str(values["id"]), self.getpos()[0]))
        for attribute in ("src", "href", "poster"):
            value = values.get(attribute)
            if value:
                self.references.append((attribute, value, self.getpos()[0]))


def local_target(source: Path, value: str) -> Path | None:
    stripped = value.strip()
    if not stripped or stripped.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    split = urlsplit(stripped)
    if split.scheme or split.netloc:
        return None
    path = unquote(split.path)
    if not path:
        return None
    if path.startswith("/"):
        return ROOT / path.lstrip("/")
    return source.parent / path


def check_html(path: Path, errors: list[str]) -> None:
    parser = ReferenceParser()
    parser.feed(path.read_text(encoding="utf-8"))

    seen: dict[str, int] = {}
    for identifier, line in parser.ids:
        if identifier in seen:
            errors.append(
                f"{path.name}:{line}: duplicate id '{identifier}' "
                f"(first seen at line {seen[identifier]})."
            )
        else:
            seen[identifier] = line

    for attribute, value, line in parser.references:
        target = local_target(path, value)
        if target is not None and not target.exists():
            errors.append(f"{path.name}:{line}: missing {attribute} target '{value}'.")


def check_css(path: Path, errors: list[str]) -> None:
    content = path.read_text(encoding="utf-8")
    for match in re.finditer(r"url\((['\"]?)(.*?)\1\)", content):
        value = match.group(2).strip()
        target = local_target(path, value)
        if target is not None and not target.exists():
            line = content.count("\n", 0, match.start()) + 1
            errors.append(f"{path.relative_to(ROOT)}:{line}: missing CSS asset '{value}'.")


def content_media_target(value: str) -> Path | None:
    relative = Path(value)
    if relative.is_absolute():
        return None
    target = (CONTENT_MEDIA_DIR / relative).resolve()
    try:
        target.relative_to(CONTENT_MEDIA_DIR)
    except ValueError:
        return None
    return target


def check_media_reference(value: object, context: str, errors: list[str]) -> None:
    source = str(value or "").strip()
    if not source:
        errors.append(f"{context}: src is required.")
        return
    target = content_media_target(source)
    if target is None:
        errors.append(f"{context}: media must be relative to data/media.")
    elif not target.is_file():
        errors.append(f"{context}: missing media '{source}'.")


def check_media_collections(
    filename: str,
    require_media: bool,
    errors: list[str],
    require_captions: bool = False,
) -> None:
    path = ROOT / "data" / filename
    items = json.loads(path.read_text(encoding="utf-8"))
    for item in items:
        item_id = item.get("id", "<missing>")
        if "photos" in item:
            errors.append(f"data/{filename} '{item_id}': use media instead of the legacy photos field.")
        media_items = item.get("media")
        if not isinstance(media_items, list):
            errors.append(f"data/{filename} '{item_id}': media must be a list.")
            continue
        if require_media and not media_items:
            errors.append(f"data/{filename} '{item_id}': at least one media item is required.")
        for index, media_item in enumerate(media_items, start=1):
            context = f"data/{filename} '{item_id}' media {index}"
            if not isinstance(media_item, dict):
                errors.append(f"{context}: must be an object.")
                continue
            media_type = str(media_item.get("type") or "").strip().lower()
            if media_type and media_type not in {"image", "video"}:
                errors.append(f"{context}: type must be 'image' or 'video'.")
            check_media_reference(media_item.get("src"), context, errors)
            if media_item.get("poster"):
                check_media_reference(media_item.get("poster"), f"{context} poster", errors)
            if require_captions:
                for language in ("en", "ko"):
                    if not str(media_item.get(f"caption_{language}") or "").strip():
                        errors.append(
                            f"{context}: caption_{language} is required."
                        )


def check_software_data(errors: list[str]) -> None:
    path = ROOT / "data" / "software.json"
    software = json.loads(path.read_text(encoding="utf-8"))
    for item in software:
        item_id = item.get("id", "<missing>")
        if "repo_url" in item or "website_url" in item:
            errors.append(
                f"data/software.json '{item_id}': use the links array instead of repo_url or website_url."
            )
        links = item.get("links")
        if not isinstance(links, list):
            errors.append(f"data/software.json '{item_id}': links must be a list.")
        else:
            for index, link in enumerate(links, start=1):
                context = f"data/software.json '{item_id}' link {index}"
                if isinstance(link, str):
                    url = link.strip()
                elif isinstance(link, dict):
                    url = str(link.get("url") or "").strip()
                    for field in ("label", "label_en", "label_ko"):
                        if field in link and not isinstance(link[field], str):
                            errors.append(f"{context}: {field} must be a string.")
                else:
                    errors.append(f"{context}: must be a URL string or an object with a url field.")
                    continue
                parsed = urlsplit(url)
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    errors.append(f"{context}: must contain a valid http(s) URL.")
        technologies = item.get("technologies")
        if not isinstance(technologies, list) or not technologies:
            errors.append(f"data/software.json '{item_id}': technologies must be a non-empty list.")
        elif not all(isinstance(value, str) and value.strip() for value in technologies):
            errors.append(f"data/software.json '{item_id}': every technology must be a non-empty string.")


def check_array_order(filename: str, errors: list[str]) -> None:
    path = ROOT / "data" / filename
    items = json.loads(path.read_text(encoding="utf-8"))
    for item in items:
        if "order" in item:
            item_id = item.get("id", "<missing>")
            errors.append(
                f"data/{filename} '{item_id}': remove order; array position controls display order."
            )


def check_project_data(errors: list[str]) -> None:
    path = ROOT / "data" / "projects.json"
    projects = json.loads(path.read_text(encoding="utf-8"))
    for index, project in enumerate(projects, start=1):
        if "id" in project:
            errors.append(
                f"data/projects.json item {index}: remove id; projects use their array position."
            )
        if "period" in project:
            errors.append(
                f"data/projects.json item {index}: use start_date and end_date instead of period."
            )
        parsed_dates: dict[str, datetime] = {}
        for field in ("start_date", "end_date"):
            value = str(project.get(field) or "").strip()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                errors.append(
                    f"data/projects.json item {index}: {field} must be a valid YYYY-MM-DD date."
                )
                continue
            try:
                parsed_dates[field] = datetime.strptime(value, "%Y-%m-%d")
            except ValueError:
                errors.append(
                    f"data/projects.json item {index}: {field} must be a valid YYYY-MM-DD date."
                )
        if parsed_dates.get("start_date") and parsed_dates.get("end_date"):
            if parsed_dates["start_date"] > parsed_dates["end_date"]:
                errors.append(
                    f"data/projects.json item {index}: start_date must not be later than end_date."
                )
        if not str(project.get("theme") or "").strip():
            errors.append(f"data/projects.json item {index}: theme is required.")


def check_technology_icons(errors: list[str]) -> None:
    path = ROOT / "app" / "assets" / "js" / "app.js"
    content = path.read_text(encoding="utf-8")
    for value in re.findall(r'icon:\s*"(app/assets/icons/technologies/[^"]+)"', content):
        target = (ROOT / value).resolve()
        if not target.is_file():
            errors.append(f"app/assets/js/app.js: missing technology icon '{value}'.")


def check_profile_media(errors: list[str]) -> None:
    path = ROOT / "data" / "profile.json"
    profile = json.loads(path.read_text(encoding="utf-8"))
    profile_card = profile.get("profile_card", {})
    if "image" in profile_card:
        errors.append("data/profile.json profile_card: use media instead of the legacy image field.")
    media = profile_card.get("media")
    if isinstance(media, dict):
        media_type = str(media.get("type") or "").strip().lower()
        if media_type and media_type not in {"image", "video"}:
            errors.append("data/profile.json profile_card.media: type must be 'image' or 'video'.")
        check_media_reference(media.get("src"), "data/profile.json profile_card.media", errors)
        if media.get("poster"):
            check_media_reference(
                media.get("poster"), "data/profile.json profile_card.media poster", errors
            )
    else:
        errors.append("data/profile.json profile_card.media must be an object.")


def main() -> int:
    errors: list[str] = []
    for path in HTML_FILES:
        if not path.exists():
            errors.append(f"Missing required HTML file: {path.name}.")
        else:
            check_html(path, errors)

    css_path = ROOT / "app" / "assets" / "css" / "styles.css"
    if not css_path.exists():
        errors.append("Missing required stylesheet: app/assets/css/styles.css.")
    else:
        check_css(css_path, errors)

    check_media_collections("notes.json", True, errors)
    check_media_collections("projects.json", False, errors)
    check_media_collections("software.json", True, errors, require_captions=True)
    check_array_order("projects.json", errors)
    check_array_order("software.json", errors)
    check_project_data(errors)
    check_software_data(errors)
    check_technology_icons(errors)
    check_profile_media(errors)

    if errors:
        print("Static site check failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Static site references and HTML IDs are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
