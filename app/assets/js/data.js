
(function () {
  "use strict";

  const FILES = {
    settings: "data/settings.json",
    profile: "data/profile.json",
    people: "data/people.json",
    projects: "data/projects.json",
    software: "data/software.json",
    publications: "data/publications.csv",
    awards: "data/awards.csv",
    notes: "data/notes.json"
  };

  function parseCSV(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows.shift().map((header) => header.trim());
    return rows
      .filter((values) => values.some((value) => value !== ""))
      .map((values) => {
        const item = {};
        headers.forEach((header, index) => {
          item[header] = values[index] ?? "";
        });
        return item;
      });
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.text();
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.json();
  }

  async function loadAll() {
    const [settings, profile, people, projects, software, publications, awards, notes] = await Promise.all([
      fetchJSON(FILES.settings),
      fetchJSON(FILES.profile),
      fetchJSON(FILES.people),
      fetchJSON(FILES.projects),
      fetchJSON(FILES.software),
      fetchText(FILES.publications).then(parseCSV),
      fetchText(FILES.awards).then(parseCSV),
      fetchJSON(FILES.notes)
    ]);

    const peopleById = new Map(people.map((person) => [person.id, person]));
    const resolvedPublications = publications.map((publication, publicationIndex) => ({
      ...publication,
      publicationIndex,
      authors: splitList(publication.author_ids).map((id) => (
        peopleById.get(id) || { id, name_en: id, name_ko: "", is_self: false, notes_en: [], notes_ko: [] }
      ))
    }));

    return { settings, profile, people, projects, software, publications: resolvedPublications, awards, notes };
  }

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.map((part) => String(part).trim()).filter(Boolean);
    }
    return String(value || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function truthy(value) {
    return ["true", "1", "yes", "y"].includes(String(value || "").toLowerCase());
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pick(record, key, language) {
    if (!record) return "";
    const localized = record[`${key}_${language}`];
    return localized || record[key] || record[`${key}_en`] || record[`${key}_ko`] || "";
  }

  function publicationTitle(item, language = "en") {
    return pick(item, "title", language);
  }

  function personName(person, language = "en") {
    return person?.[`name_${language}`] || person?.name_en || person?.name_ko || person?.id || "";
  }

  function personNotesHTML(person, language = "en") {
    const cleanNotes = (value) => Array.isArray(value)
      ? value.map((note) => String(note).trim()).filter(Boolean)
      : [];
    const preferred = cleanNotes(person?.[`notes_${language}`]);
    const fallbackLanguage = language === "ko" ? "en" : "ko";
    const fallback = cleanNotes(person?.[`notes_${fallbackLanguage}`]);
    const legacy = cleanNotes(person?.notes);
    const notes = preferred.length ? preferred : fallback.length ? fallback : legacy;
    if (!notes.length) return "";
    return `
      <span class="person-notes-tooltip" role="tooltip">
        ${notes.map((note) => `<span class="person-note">${escapeHTML(note)}</span>`).join("")}
      </span>
    `;
  }

  function displayAuthors(people, language = "en", showNotes = true) {
    return (people || []).map((person) => {
      const name = escapeHTML(personName(person, language));
      const notes = showNotes ? personNotesHTML(person, language) : "";
      const label = person.is_self ? `<strong>${name}</strong>` : name;
      return `<span class="publication-person"${notes ? ' tabindex="0"' : ""}>${label}${notes}</span>`;
    }).join(", ");
  }

  function isFirstAuthor(item) {
    return Boolean(item.authors?.[0]?.is_self);
  }

  function publicationTypeLabel(item, language) {
    const map = {
      en: {
        "international-journal": "International journal",
        "domestic-journal": "Domestic journal",
        "international-conference": "International conference",
        "domestic-conference": "Domestic conference"
      },
      ko: {
        "international-journal": "국제학술지",
        "domestic-journal": "국내학술지",
        "international-conference": "국제학술대회",
        "domestic-conference": "국내학술대회"
      }
    };
    return map[language]?.[item.publication_type] || item.publication_type;
  }

  function publicationTopicLabel(item, settings, language) {
    const topic = (settings.publication_topics || []).find((candidate) => candidate.id === item.topic);
    return pick(topic || settings.publication_topic_fallback, "label", language);
  }

  function projectThemeLabel(item, settings, language) {
    const theme = (settings.project_themes || []).find((candidate) => candidate.id === item.theme);
    return pick(theme || settings.project_theme_fallback, "label", language);
  }

  function formatProjectDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}.` : String(value || "");
  }

  function projectPeriod(item) {
    return [formatProjectDate(item.start_date), formatProjectDate(item.end_date)]
      .filter(Boolean)
      .join(" – ");
  }

  function publicationStatus(item) {
    if (truthy(item.under_review)) return "under review";
    if (truthy(item.in_press)) return "in press";
    return "";
  }

  function publicationStatusRank(item) {
    if (truthy(item.under_review)) return 2;
    if (truthy(item.in_press)) return 1;
    return 0;
  }

  function publicationYear(item) {
    return String(item.date || "").slice(0, 4);
  }

  function normalizeText(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFKD");
  }

  function publicationCitation(item, language = "en") {
    const authorText = (item.authors || []).map((person) => personName(person, language)).join(", ");
    const doiText = item.doi ? ` https://doi.org/${item.doi}` : "";
    const dateLabel = publicationYear(item) || publicationStatus(item) || "n.d.";
    return `${authorText} (${dateLabel}). ${publicationTitle(item, language)}. ${item.venue}${doiText}`.replace(/\s+/g, " ").trim();
  }

  function bibtexEscape(value) {
    return String(value || "")
      .replaceAll("\\", "\\textbackslash{}")
      .replaceAll("&", "\\&")
      .replaceAll("%", "\\%")
      .replaceAll("#", "\\#")
      .replaceAll("_", "\\_")
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}");
  }

  function publicationCitationKey(item) {
    const source = item.doi || item.url || [
      publicationTitle(item, "en"),
      item.date,
      (item.authors || []).map((person) => personName(person, "en")).join("|")
    ].join("|");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const year = publicationYear(item) || "nd";
    return `publication-${year}-${(hash >>> 0).toString(36)}`;
  }

  function bibtexEntry(item) {
    const entryType = item.publication_type.endsWith("-journal") ? "article" : "inproceedings";
    const dateLabel = publicationYear(item) || publicationStatus(item) || "n.d.";
    const fields = [
      `  title = {${bibtexEscape(publicationTitle(item, "en"))}}`,
      `  author = {${(item.authors || []).map((person) => bibtexEscape(personName(person, "en"))).join(" and ")}}`,
      `  year = {${dateLabel}}`
    ];
    if (entryType === "article") {
      fields.push(`  journal = {${bibtexEscape(item.venue)}}`);
    } else {
      fields.push(`  booktitle = {${bibtexEscape(item.venue)}}`);
    }
    if (item.doi) fields.push(`  doi = {${item.doi}}`);
    if (item.url) fields.push(`  url = {${item.url}}`);
    return `@${entryType}{${publicationCitationKey(item)},\n${fields.join(",\n")}\n}`;
  }

  function download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPublicationBib(item) {
    download(`${publicationCitationKey(item)}.bib`, `${bibtexEntry(item)}\n`, "application/x-bibtex;charset=utf-8");
  }

  function safeExternalURL(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function softwareLinkInfo(value, language = "en") {
    const source = typeof value === "object" && value ? value.url : value;
    let url;
    try {
      url = new URL(String(source || "").trim());
    } catch {
      return null;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    const matches = (domain) => host === domain || host.endsWith(`.${domain}`);
    let platform = "webpage";
    let labelEn = "Webpage";
    let labelKo = "웹페이지";
    let icon = "webpage";

    if (matches("github.com")) {
      [platform, labelEn, labelKo, icon] = ["github", "GitHub", "GitHub", "github"];
    } else if (matches("gitlab.com")) {
      [platform, labelEn, labelKo, icon] = ["gitlab", "GitLab", "GitLab", "repository"];
    } else if (matches("bitbucket.org")) {
      [platform, labelEn, labelKo, icon] = ["bitbucket", "Bitbucket", "Bitbucket", "repository"];
    } else if (matches("codeberg.org")) {
      [platform, labelEn, labelKo, icon] = ["codeberg", "Codeberg", "Codeberg", "repository"];
    } else if (matches("sourceforge.net")) {
      [platform, labelEn, labelKo, icon] = ["sourceforge", "SourceForge", "SourceForge", "repository"];
    } else if (matches("pypi.org")) {
      [platform, labelEn, labelKo, icon] = ["pypi", "PyPI", "PyPI", "package"];
    } else if (matches("npmjs.com")) {
      [platform, labelEn, labelKo, icon] = ["npm", "npm", "npm", "package"];
    } else if (matches("jsr.io")) {
      [platform, labelEn, labelKo, icon] = ["jsr", "JSR", "JSR", "package"];
    } else if (matches("crates.io")) {
      [platform, labelEn, labelKo, icon] = ["crates", "crates.io", "crates.io", "package"];
    } else if (matches("nuget.org")) {
      [platform, labelEn, labelKo, icon] = ["nuget", "NuGet", "NuGet", "package"];
    } else if (["central.sonatype.com", "search.maven.org", "repo1.maven.org", "mvnrepository.com"].some(matches)) {
      [platform, labelEn, labelKo, icon] = ["maven", "Maven Central", "Maven Central", "package"];
    } else if (matches("hub.docker.com")) {
      [platform, labelEn, labelKo, icon] = ["docker", "Docker Hub", "Docker Hub", "container"];
    } else if (matches("anaconda.org")) {
      [platform, labelEn, labelKo, icon] = ["anaconda", "Anaconda", "Anaconda", "package"];
    } else if (matches("rubygems.org")) {
      [platform, labelEn, labelKo, icon] = ["rubygems", "RubyGems", "RubyGems", "package"];
    } else if (matches("packagist.org")) {
      [platform, labelEn, labelKo, icon] = ["packagist", "Packagist", "Packagist", "package"];
    } else if (matches("pub.dev")) {
      [platform, labelEn, labelKo, icon] = ["pub", "pub.dev", "pub.dev", "package"];
    } else if (matches("hex.pm")) {
      [platform, labelEn, labelKo, icon] = ["hex", "Hex", "Hex", "package"];
    } else if (matches("metacpan.org") || matches("cpan.org")) {
      [platform, labelEn, labelKo, icon] = ["cpan", "CPAN", "CPAN", "package"];
    } else if (matches("cran.r-project.org")) {
      [platform, labelEn, labelKo, icon] = ["cran", "CRAN", "CRAN", "package"];
    } else if (matches("bioconductor.org")) {
      [platform, labelEn, labelKo, icon] = ["bioconductor", "Bioconductor", "Bioconductor", "package"];
    } else if (matches("huggingface.co")) {
      [platform, labelEn, labelKo, icon] = ["huggingface", "Hugging Face", "Hugging Face", "package"];
    } else if (matches("pkg.go.dev")) {
      [platform, labelEn, labelKo, icon] = ["go-package", "Go package", "Go 패키지", "package"];
    } else if (matches("quay.io")) {
      [platform, labelEn, labelKo, icon] = ["quay", "Quay", "Quay", "container"];
    } else if (matches("flathub.org")) {
      [platform, labelEn, labelKo, icon] = ["flathub", "Flathub", "Flathub", "package"];
    } else if (matches("snapcraft.io")) {
      [platform, labelEn, labelKo, icon] = ["snapcraft", "Snap Store", "Snap Store", "package"];
    } else if (matches("formulae.brew.sh")) {
      [platform, labelEn, labelKo, icon] = ["homebrew", "Homebrew", "Homebrew", "package"];
    } else if (matches("zenodo.org") || (matches("doi.org") && path.includes("zenodo."))) {
      [platform, labelEn, labelKo, icon] = ["zenodo", "Zenodo", "Zenodo", "archive"];
    } else if (matches("figshare.com")) {
      [platform, labelEn, labelKo, icon] = ["figshare", "Figshare", "Figshare", "archive"];
    } else if (matches("osf.io")) {
      [platform, labelEn, labelKo, icon] = ["osf", "OSF", "OSF", "archive"];
    } else if (matches("softwareheritage.org")) {
      [platform, labelEn, labelKo, icon] = ["software-heritage", "Software Heritage", "Software Heritage", "archive"];
    } else if (matches("doi.org")) {
      [platform, labelEn, labelKo, icon] = ["doi", "DOI", "DOI", "archive"];
    }

    const customLabel = typeof value === "object" && value
      ? value[`label_${language}`] || value.label || ""
      : "";
    return {
      url: url.href,
      platform,
      icon,
      label: customLabel || (language === "ko" ? labelKo : labelEn)
    };
  }

  function softwareLinks(item, language = "en") {
    return (Array.isArray(item?.links) ? item.links : [])
      .map((value) => softwareLinkInfo(value, language))
      .filter(Boolean);
  }

  function contentMediaPath(value) {
    const source = typeof value === "object" && value ? value.src : value;
    const relative = String(source || "").trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return "";
    return `data/media/${relative}`;
  }

  function contentMediaType(value) {
    if (typeof value === "object" && value?.type === "video") return "video";
    if (typeof value === "object" && value?.type === "image") return "image";
    const source = typeof value === "object" && value ? value.src : value;
    const extension = String(source || "").split(/[?#]/, 1)[0].split(".").pop().toLowerCase();
    return ["mp4", "webm", "ogv", "ogg", "mov", "m4v"].includes(extension) ? "video" : "image";
  }

  window.SiteData = Object.freeze({
    FILES,
    parseCSV,
    loadAll,
    splitList,
    truthy,
    escapeHTML,
    pick,
    publicationTitle,
    personName,
    personNotesHTML,
    displayAuthors,
    isFirstAuthor,
    publicationTypeLabel,
    publicationTopicLabel,
    projectThemeLabel,
    projectPeriod,
    publicationStatus,
    publicationStatusRank,
    publicationYear,
    normalizeText,
    publicationCitation,
    publicationCitationKey,
    bibtexEntry,
    download,
    downloadPublicationBib,
    safeExternalURL,
    softwareLinkInfo,
    softwareLinks,
    contentMediaPath,
    contentMediaType
  });
}());
