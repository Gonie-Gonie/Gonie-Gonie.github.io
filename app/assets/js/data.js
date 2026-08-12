
(function () {
  "use strict";

  const FILES = {
    settings: "data/settings.json",
    profile: "data/profile.json",
    people: "data/people.json",
    projects: "data/projects.json",
    software: "data/software.json",
    publications: "data/publications.json",
    awards: "data/awards.json",
    board: "data/board.json",
    academicActivities: "data/academic_activities.json"
  };
  const SOFTWARE_STAGES = new Set(["release", "preview", "development"]);
  const CANONICAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
  const EXCHANGE_RATE_API = "https://api.frankfurter.dev/v2/rate";
  const exchangeRateRequests = new Map();
  const MAIN_PAGE_SECTIONS = [
    "experience",
    "education",
    "scholarships",
    "certifications",
    "awards",
    "teaching",
    "skills",
    "academic_activities"
  ];
  const LEGACY_MAIN_PAGE_SECTIONS = MAIN_PAGE_SECTIONS.filter((section) => section !== "academic_activities");
  const ACADEMIC_ACTIVITY_FIELDS = Object.freeze({
    reviews: ["journal_en", "journal_ko", "completed_dates"],
    invited_talks: ["event_en", "event_ko", "topic_en", "topic_ko", "date"],
    conference_service: ["conference_en", "conference_ko", "role_en", "role_ko", "start_date", "end_date"],
    professional_service: ["organization_en", "organization_ko", "role_en", "role_ko", "start_date", "end_date"],
    editorial_service: ["journal_en", "journal_ko", "role_en", "role_ko", "start_date", "end_date"]
  });
  const ACADEMIC_ACTIVITY_CATEGORIES = Object.freeze([
    "editorial_service",
    "professional_service",
    "conference_service",
    "invited_talks",
    "reviews"
  ]);
  const CV_SECTIONS = [
    "experience",
    "education",
    "projects",
    "publications",
    "software",
    "awards",
    "academic_activities",
    "teaching",
    "scholarships",
    "certifications",
    "skills"
  ];
  const PROFILE_CV_SECTIONS = [
    "experience",
    "education",
    "scholarships",
    "teaching",
    "certifications",
    "skills"
  ];

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.json();
  }

  function isValidISODate(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parsed = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
  }

  function requireArray(value, context) {
    if (!Array.isArray(value)) {
      throw new Error(`${context}: must be an array.`);
    }
    return value;
  }

  function requireRecord(value, context) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${context}: must be an object.`);
    }
    return value;
  }

  function validateScholarships(value) {
    requireArray(value, "profile.json scholarships").forEach((row, index) => {
      const context = `profile.json scholarships item ${index + 1}`;
      const item = requireRecord(row, context);
      if (Object.prototype.hasOwnProperty.call(item, "details")) {
        throw new Error(`${context}: details is obsolete; use amount instead.`);
      }
      const amount = requireRecord(item.amount, `${context} amount`);
      if (typeof amount.value !== "number" || !Number.isFinite(amount.value) || amount.value <= 0) {
        throw new Error(`${context} amount: value must be a positive finite number.`);
      }
      if (typeof amount.currency !== "string" || !CURRENCY_CODE_PATTERN.test(amount.currency)) {
        throw new Error(`${context} amount: currency must be a three-letter uppercase code.`);
      }
    });
  }

  function scholarshipTargetCurrency(language) {
    return language === "ko" ? "KRW" : "USD";
  }

  function roundedCurrencyValue(value) {
    const rounded = Math.round(Number(value) / 10) * 10;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function formatCurrency(value, currency, language) {
    return new Intl.NumberFormat(language === "ko" ? "ko-KR" : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(roundedCurrencyValue(value));
  }

  function formatScholarshipAmount(amount, language = "en") {
    return formatCurrency(amount.value, amount.currency, language);
  }

  function exchangeRate(base, quote) {
    if (base === quote) return Promise.resolve(1);
    const key = `${base}/${quote}`;
    if (!exchangeRateRequests.has(key)) {
      const request = fetchJSON(`${EXCHANGE_RATE_API}/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`)
        .then((response) => {
          const rate = Number(response?.rate);
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new Error(`Invalid exchange rate for ${key}.`);
          }
          return rate;
        });
      exchangeRateRequests.set(key, request);
    }
    return exchangeRateRequests.get(key);
  }

  async function resolveScholarshipAmount(amount, language = "en") {
    const fallback = formatScholarshipAmount(amount, language);
    const targetCurrency = scholarshipTargetCurrency(language);
    if (amount.currency === targetCurrency) return fallback;
    try {
      const rate = await exchangeRate(amount.currency, targetCurrency);
      return formatCurrency(amount.value * rate, targetCurrency, language);
    } catch (_error) {
      return fallback;
    }
  }

  function requireOptionalCVVisibility(value, context) {
    if (Object.prototype.hasOwnProperty.call(value, "visible_in_CV") && typeof value.visible_in_CV !== "boolean") {
      throw new Error(`${context}: visible_in_CV must be a boolean when present.`);
    }
  }

  function visibleInCV(value) {
    return value?.visible_in_CV !== false;
  }

  function normalizeCVSectionSettings(settings) {
    const hasVisible = Object.prototype.hasOwnProperty.call(settings, "cv_sections");
    const hasHidden = Object.prototype.hasOwnProperty.call(settings, "hidden_cv_sections");
    if (!hasVisible && !hasHidden && Number(settings.schema_version || 0) <= 4) {
      settings.cv_sections = [...CV_SECTIONS];
      settings.hidden_cv_sections = [];
      return;
    }

    const visible = settings.cv_sections;
    const hidden = settings.hidden_cv_sections;
    const configured = Array.isArray(visible) && Array.isArray(hidden) ? [...visible, ...hidden] : [];
    const valid = Array.isArray(visible)
      && Array.isArray(hidden)
      && configured.length === CV_SECTIONS.length
      && configured.every((section) => CV_SECTIONS.includes(section))
      && new Set(configured).size === CV_SECTIONS.length;
    if (!valid) {
      throw new Error(
        "settings.json: cv_sections and hidden_cv_sections must together contain each supported section exactly once: "
        + CV_SECTIONS.join(", ")
      );
    }
  }

  function normalizeMainPageSectionSettings(settings) {
    const visible = settings.main_page_sections;
    const hidden = settings.hidden_main_page_sections;
    const configured = Array.isArray(visible) && Array.isArray(hidden) ? [...visible, ...hidden] : [];
    const isLegacyConfiguration = Number(settings.schema_version || 0) <= 5
      && configured.length === LEGACY_MAIN_PAGE_SECTIONS.length
      && configured.every((section) => LEGACY_MAIN_PAGE_SECTIONS.includes(section))
      && new Set(configured).size === LEGACY_MAIN_PAGE_SECTIONS.length;
    if (isLegacyConfiguration) {
      settings.hidden_main_page_sections = [...hidden, "academic_activities"];
    }
  }

  function validateAcademicActivities(value) {
    const document = requireRecord(value, "academic_activities.json");
    if (!Number.isInteger(document.schema_version) || document.schema_version !== 1) {
      throw new Error("academic_activities.json: schema_version must be 1.");
    }

    Object.entries(ACADEMIC_ACTIVITY_FIELDS).forEach(([category, fields]) => {
      requireArray(document[category], `academic_activities.json ${category}`).forEach((row, index) => {
        const context = `academic_activities.json ${category} item ${index + 1}`;
        const item = requireRecord(row, context);
        requireOptionalCVVisibility(item, context);
        const missingFields = fields.filter((field) => !Object.prototype.hasOwnProperty.call(item, field));
        if (missingFields.length) throw new Error(`${context}: missing field(s): ${missingFields.join(", ")}.`);

        fields.filter((field) => field !== "completed_dates").forEach((field) => {
          if (typeof item[field] !== "string") throw new Error(`${context}: ${field} must be a string.`);
        });
        if (category === "reviews") {
          const completedDates = requireArray(item.completed_dates, `${context} completed_dates`);
          if (!completedDates.length) {
            throw new Error(`${context}: completed_dates must contain at least one date.`);
          }
          completedDates.forEach((date, dateIndex) => {
            if (typeof date !== "string" || date !== date.trim() || !isValidISODate(date)) {
              throw new Error(`${context}: completed_dates[${dateIndex}] must be a valid YYYY-MM-DD date.`);
            }
          });
          if (new Set(completedDates).size !== completedDates.length) {
            throw new Error(`${context}: completed_dates must not contain duplicate dates.`);
          }
          if (![item.journal_en, item.journal_ko].some((text) => text.trim())) {
            throw new Error(`${context}: at least one localized journal name is required.`);
          }
          return;
        }

        const localizedPairs = category === "invited_talks"
          ? [["event_en", "event_ko"], ["topic_en", "topic_ko"]]
          : category === "conference_service"
            ? [["conference_en", "conference_ko"], ["role_en", "role_ko"]]
            : category === "professional_service"
              ? [["organization_en", "organization_ko"], ["role_en", "role_ko"]]
              : [["journal_en", "journal_ko"], ["role_en", "role_ko"]];
        localizedPairs.forEach((pair) => {
          if (!pair.some((field) => item[field].trim())) {
            throw new Error(`${context}: at least one localized value is required for ${pair.join("/")}.`);
          }
        });
        if (category === "invited_talks") {
          if (!isValidISODate(item.date)) throw new Error(`${context}: date must be a valid YYYY-MM-DD date.`);
          return;
        }
        if (!isValidISODate(item.start_date)) {
          throw new Error(`${context}: start_date must be a valid YYYY-MM-DD date.`);
        }
        if (item.end_date && !isValidISODate(item.end_date)) {
          throw new Error(`${context}: end_date must be blank or a valid YYYY-MM-DD date.`);
        }
        if (item.end_date && item.start_date > item.end_date) {
          throw new Error(`${context}: start_date must not be later than end_date.`);
        }
      });
    });
    return document;
  }

  function requireCanonicalId(value, context) {
    if (typeof value !== "string" || !CANONICAL_ID_PATTERN.test(value)) {
      throw new Error(
        `${context}: id must be a lowercase kebab-case string matching `
        + "/^[a-z0-9]+(?:-[a-z0-9]+)*$/. Reserved sentinel values are not valid data IDs."
      );
    }
    return value;
  }

  function collectUniqueIds(rows, context) {
    const ids = new Set();
    requireArray(rows, context).forEach((row, index) => {
      const itemContext = `${context} item ${index + 1}`;
      requireRecord(row, itemContext);
      const id = requireCanonicalId(row.id, `${itemContext} id`);
      if (ids.has(id)) {
        throw new Error(`${itemContext}: duplicate id '${id}' in ${context}; every id must be unique.`);
      }
      ids.add(id);
    });
    return ids;
  }

  function requireKnownId(value, knownIds, context) {
    const id = requireCanonicalId(value, context);
    if (!knownIds.has(id)) {
      throw new Error(`${context}: unknown id '${id}'; add it to the referenced JSON collection or correct the reference.`);
    }
    return id;
  }

  async function loadAll() {
    const [settings, profile, people, projects, software, publications, awards, board, academicActivities] = await Promise.all([
      fetchJSON(FILES.settings),
      fetchJSON(FILES.profile),
      fetchJSON(FILES.people),
      fetchJSON(FILES.projects),
      fetchJSON(FILES.software),
      fetchJSON(FILES.publications),
      fetchJSON(FILES.awards),
      fetchJSON(FILES.board),
      fetchJSON(FILES.academicActivities)
    ]);

    requireRecord(settings, "settings.json");
    requireRecord(profile, "profile.json");
    requireArray(projects, "projects.json");
    requireArray(publications, "publications.json");
    requireArray(board, "board.json");
    validateAcademicActivities(academicActivities);
    normalizeMainPageSectionSettings(settings);
    normalizeCVSectionSettings(settings);
    PROFILE_CV_SECTIONS.forEach((sectionName) => {
      requireArray(profile[sectionName], `profile.json ${sectionName}`).forEach((item, index) => {
        const context = `profile.json ${sectionName} item ${index + 1}`;
        requireRecord(item, context);
        requireOptionalCVVisibility(item, context);
      });
    });
    validateScholarships(profile.scholarships);

    const peopleIds = collectUniqueIds(people, "people.json");
    const awardIds = collectUniqueIds(awards, "awards.json");
    collectUniqueIds(software, "software.json");
    const projectThemeIds = collectUniqueIds(settings.project_themes, "settings.json project_themes");
    const publicationTopicIds = collectUniqueIds(settings.publication_topics, "settings.json publication_topics");

    const peopleById = new Map(people.map((person) => [person.id, person]));
    awards.forEach((award, index) => {
      const context = `awards.json item ${index + 1}`;
      requireRecord(award, context);
      requireOptionalCVVisibility(award, context);
      ["date", "title_en", "title_ko", "organization_en", "organization_ko"].forEach((field) => {
        if (typeof award[field] !== "string") {
          throw new Error(`${context}: ${field} must be a string.`);
        }
      });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(award.date) || !isValidISODate(award.date)) {
        throw new Error(`${context}: date must be a valid YYYY-MM-DD date exactly.`);
      }
      if (![award.title_en, award.title_ko].some((value) => value.trim())) {
        throw new Error(`${context}: at least one localized title is required.`);
      }
      if (![award.organization_en, award.organization_ko].some((value) => value.trim())) {
        throw new Error(`${context}: at least one localized organization is required.`);
      }
    });
    projects.forEach((project, index) => {
      const context = `projects.json item ${index + 1}`;
      requireRecord(project, context);
      requireOptionalCVVisibility(project, context);
      if (typeof project.theme !== "string" || !project.theme) {
        throw new Error(`${context} theme: must be a non-empty canonical project theme id.`);
      }
      requireKnownId(project.theme, projectThemeIds, `${context} theme`);
      if ("summary" in project || "summary_en" in project || "summary_ko" in project) {
        throw new Error(`projects.json item ${index + 1}: use notes_en and notes_kr instead of summary.`);
      }
      ["notes_en", "notes_kr"].forEach((field) => {
        if (
          !Array.isArray(project[field])
          || !project[field].length
          || project[field].some((note) => typeof note !== "string" || !note.trim())
        ) {
          throw new Error(`projects.json item ${index + 1}: ${field} must be a non-empty array of non-empty strings.`);
        }
      });
      if (project.notes_en.length !== project.notes_kr.length) {
        throw new Error(`projects.json item ${index + 1}: notes_en and notes_kr must contain the same number of items.`);
      }
      (project.media || []).forEach((mediaItem, mediaIndex) => {
        if ("caption_kr" in mediaItem || "caption-en" in mediaItem) {
          throw new Error(`projects.json item ${index + 1} media ${mediaIndex + 1}: use caption_en and caption_ko.`);
        }
        const captionEn = String(mediaItem.caption_en || "").trim();
        const captionKo = String(mediaItem.caption_ko || "").trim();
        if (Boolean(captionEn) !== Boolean(captionKo)) {
          throw new Error(`projects.json item ${index + 1} media ${mediaIndex + 1}: caption_en and caption_ko must both be filled or both be blank.`);
        }
      });
    });
    software.forEach((item, index) => {
      const context = `software.json item ${index + 1}`;
      requireRecord(item, context);
      requireOptionalCVVisibility(item, context);
      if (!SOFTWARE_STAGES.has(item.stage)) {
        throw new Error(`software.json item ${index + 1}: stage must be release, preview, or development.`);
      }
      if ("summary" in item || "summary_en" in item || "summary_ko" in item) {
        throw new Error(`software.json item ${index + 1}: use notes_en and notes_kr instead of summary.`);
      }
      ["notes_en", "notes_kr"].forEach((field) => {
        if (
          !Array.isArray(item[field])
          || !item[field].length
          || item[field].some((note) => typeof note !== "string" || !note.trim())
        ) {
          throw new Error(`software.json item ${index + 1}: ${field} must be a non-empty array of non-empty strings.`);
        }
      });
      if (item.notes_en.length !== item.notes_kr.length) {
        throw new Error(`software.json item ${index + 1}: notes_en and notes_kr must contain the same number of items.`);
      }
    });
    board.forEach((item, index) => {
      const context = `board.json item ${index + 1}`;
      requireRecord(item, context);
      if ("date" in item) {
        throw new Error(`${context}: use start_date and end_date instead of date.`);
      }
      const startDate = String(item.start_date || "").trim();
      const endDate = String(item.end_date || "").trim();
      if (!isValidISODate(startDate)) {
        throw new Error(`${context}: start_date must be a valid YYYY-MM-DD date.`);
      }
      if (endDate && !isValidISODate(endDate)) {
        throw new Error(`${context}: end_date must be blank or a valid YYYY-MM-DD date.`);
      }
      if (endDate && startDate > endDate) {
        throw new Error(`${context}: start_date must not be later than end_date.`);
      }
      ["content_en", "content_ko"].forEach((field) => {
        if (typeof item[field] !== "string") {
          throw new Error(`${context}: ${field} must be a string.`);
        }
      });
    });
    const resolvedPublications = publications.map((publication, publicationIndex) => {
      const context = `publications.json item ${publicationIndex + 1}`;
      requireRecord(publication, context);
      requireOptionalCVVisibility(publication, context);

      if (!Array.isArray(publication.author_ids) || !publication.author_ids.length) {
        throw new Error(`${context} author_ids: must be a non-empty array of canonical people IDs.`);
      }
      const authorIds = publication.author_ids.map((authorId, authorIndex) => (
        requireKnownId(authorId, peopleIds, `${context} author_ids[${authorIndex}]`)
      ));
      const seenAuthorIds = new Set();
      authorIds.forEach((authorId, authorIndex) => {
        if (seenAuthorIds.has(authorId)) {
          throw new Error(`${context} author_ids[${authorIndex}]: duplicate author id '${authorId}'.`);
        }
        seenAuthorIds.add(authorId);
      });

      if (typeof publication.award_id !== "string") {
        throw new Error(`${context} award_id: must be an empty string or a canonical awards.json id.`);
      }
      if (publication.award_id) {
        requireKnownId(publication.award_id, awardIds, `${context} award_id`);
      }

      if (typeof publication.topic !== "string") {
        throw new Error(`${context} topic: must be an empty string or a canonical settings.json publication topic id.`);
      }
      if (publication.topic) {
        requireKnownId(publication.topic, publicationTopicIds, `${context} topic`);
      }

      return {
        ...publication,
        publicationIndex,
        authors: authorIds.map((id) => peopleById.get(id))
      };
    });

    return {
      settings,
      profile,
      people,
      projects,
      software,
      publications: resolvedPublications,
      awards,
      board,
      academicActivities
    };
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
    return [record[`${key}_${language}`], record[key], record[`${key}_en`], record[`${key}_ko`]]
      .find((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value))) || "";
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

  function projectNotes(item, language = "en") {
    const primary = language === "ko" ? item.notes_kr : item.notes_en;
    const fallback = language === "ko" ? item.notes_en : item.notes_kr;
    const notes = Array.isArray(primary) && primary.length ? primary : fallback;
    return (Array.isArray(notes) ? notes : [])
      .map((note) => String(note).trim())
      .filter(Boolean);
  }

  function softwareNotes(item, language = "en") {
    return projectNotes(item, language);
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
    } else if (matches("food4rhino.com")) {
      [platform, labelEn, labelKo, icon] = ["food4rhino", "food4Rhino", "food4Rhino", "food4rhino"];
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
    ACADEMIC_ACTIVITY_CATEGORIES,
    loadAll,
    visibleInCV,
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
    projectNotes,
    softwareNotes,
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
    contentMediaType,
    scholarshipTargetCurrency,
    formatScholarshipAmount,
    resolveScholarshipAmount
  });
}());
