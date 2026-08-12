const SECTION_LABELS = {
  experience: "경력",
  education: "학력",
  scholarships: "장학금",
  certifications: "자격",
  awards: "수상",
  teaching: "교육",
  skills: "기술",
};

const state = {
  bridge: null,
  baseline: null,
  draft: null,
  revision: "",
  boardBaseline: null,
  boardDraft: null,
  boardRevision: "",
  selectedBoardKey: "",
  projectsBaseline: null,
  projectsDraft: null,
  projectsRevision: "",
  selectedProjectKey: "",
  softwareBaseline: null,
  softwareDraft: null,
  softwareRevision: "",
  selectedSoftwareKey: "",
  usage: { project_themes: {}, publication_topics: {} },
  loading: true,
  saving: false,
  dirty: false,
  validationErrors: new Map(),
  nextClientKey: 1,
  nextBoardKey: 1,
  nextBoardMediaKey: 1,
  nextProjectKey: 1,
  nextSoftwareKey: 1,
  nextContentRowKey: 1,
  drag: null,
  statusText: "데이터를 불러오는 중…",
  statusTone: "",
  dirtySync: Promise.resolve(),
  stagingOps: Promise.resolve(),
  boardDropBusy: false,
  boardDropCount: 0,
  boardDropMessage: "",
  contentDropMessages: {},
  fileDropBound: false,
  discarding: false,
};

const taxonomyConfig = {
  projectThemes: {
    listKey: "project_themes",
    fallbackKey: "project_theme_fallback",
    usageKey: "project_themes",
    listElement: "project-theme-list",
    fallbackElement: "project-theme-fallback",
    itemName: "테마",
  },
  publicationTopics: {
    listKey: "publication_topics",
    fallbackKey: "publication_topic_fallback",
    usageKey: "publication_topics",
    listElement: "publication-topic-list",
    fallbackElement: "publication-topic-fallback",
    itemName: "주제",
  },
};

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
const saveButton = document.querySelector("#save-button");
const discardButton = document.querySelector("#discard-button");
const saveStatus = document.querySelector("#save-status");
const loadError = document.querySelector("#load-error");
const loadErrorMessage = document.querySelector("#load-error-message");
const saveError = document.querySelector("#save-error");
const saveErrorMessage = document.querySelector("#save-error-message");
const retryButton = document.querySelector("#retry-button");
const moveAnnouncer = document.querySelector("#move-announcer");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function errorMessage(error) {
  return String(error?.message || error || "알 수 없는 오류").replace(/^Error:\s*/, "");
}

function setStatus(text, tone = "") {
  state.statusText = text;
  state.statusTone = tone;
  saveStatus.textContent = text;
  saveStatus.dataset.tone = tone;
}

function announce(message) {
  moveAnnouncer.textContent = "";
  requestAnimationFrame(() => {
    moveAnnouncer.textContent = message;
  });
}

async function waitForBridge() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bridge = window.go?.main?.App;
    if (
      bridge?.LoadEditorData
      && bridge?.SaveEditorData
      && bridge?.StageBoardMedia
      && bridge?.DiscardBoardMedia
      && bridge?.SetDirty
    ) return bridge;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Profile-Editor 백엔드에 연결할 수 없습니다.");
}

function addClientKeys(settings) {
  const result = clone(settings);
  Object.values(taxonomyConfig).forEach((config) => {
    result[config.listKey] = (result[config.listKey] || []).map((item) => ({
      ...item,
      _clientKey: item.id ? `id:${item.id}` : `new:${state.nextClientKey++}`,
    }));
  });
  return result;
}

function toSettingsPayload(settings) {
  return {
    schema_version: 4,
    main_page_sections: [...settings.main_page_sections],
    hidden_main_page_sections: [...settings.hidden_main_page_sections],
    project_themes: settings.project_themes.map(({ id = "", label_en, label_ko }) => ({ id, label_en, label_ko })),
    project_theme_fallback: {
      label_en: settings.project_theme_fallback.label_en,
      label_ko: settings.project_theme_fallback.label_ko,
    },
    publication_topics: settings.publication_topics.map(({ id = "", label_en, label_ko }) => ({ id, label_en, label_ko })),
    publication_topic_fallback: {
      label_en: settings.publication_topic_fallback.label_en,
      label_ko: settings.publication_topic_fallback.label_ko,
    },
  };
}

function comparable(settings) {
  return JSON.stringify(toSettingsPayload(settings));
}

function hydrateBoard(items) {
  return (items || []).map((item) => {
    const hydrated = clone(item);
    return {
      ...hydrated,
      content_en: hydrated.content_en || "",
      content_ko: hydrated.content_ko || "",
      media: (hydrated.media || []).map((media, index) => ({
        ...media,
        _clientKey: media.editor_key
          ? `existing-media:${media.editor_key}`
          : `existing-media:${item.editor_key}:${index}`,
        _isNew: false,
        caption_en: media.caption_en || "",
        caption_ko: media.caption_ko || "",
      })),
      _clientKey: `existing:${item.editor_key}`,
      _isNew: false,
    };
  });
}

function compareBoardItems(left, right) {
  return String(right.start_date || "").localeCompare(String(left.start_date || ""))
    || String(right.end_date || "").localeCompare(String(left.end_date || ""))
    || Number(left._sortOrder || 0) - Number(right._sortOrder || 0);
}

function sortedBoardItems(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareBoardItems(
      { ...left.item, _sortOrder: left.index },
      { ...right.item, _sortOrder: right.index },
    ))
    .map(({ item }) => item);
}

function toBoardMediaPayload(media) {
  const reference = media.stage_token
    ? { stage_token: media.stage_token }
    : { editor_key: media.editor_key };
  return {
    ...reference,
    caption_en: media.caption_en || "",
    caption_ko: media.caption_ko || "",
  };
}

function toBoardPostPayload(item) {
  return {
    start_date: item.start_date || "",
    end_date: item.end_date || "",
    title_en: item.title_en || "",
    title_ko: item.title_ko || "",
    content_en: item.content_en || "",
    content_ko: item.content_ko || "",
    media: (item.media || []).map(toBoardMediaPayload),
  };
}

function toBoardPayload(items) {
  return sortedBoardItems(items).map((item) => {
    const post = toBoardPostPayload(item);
    return item._isNew
      ? { new_post: post }
      : { editor_key: item.editor_key, post };
  });
}

function toBoardSavePayload(items, baselineItems) {
  const baselinePosts = new Map(
    (baselineItems || [])
      .filter((item) => !item._isNew && item.editor_key)
      .map((item) => [item.editor_key, JSON.stringify(toBoardPostPayload(item))]),
  );
  return sortedBoardItems(items).map((item) => {
    const post = toBoardPostPayload(item);
    if (item._isNew) return { new_post: post };
    if (baselinePosts.get(item.editor_key) === JSON.stringify(post)) {
      return { editor_key: item.editor_key };
    }
    return { editor_key: item.editor_key, post };
  });
}

function boardComparable(items) {
  return JSON.stringify(toBoardPayload(items));
}

function hydrateContentMedia(media, ownerKey, prefix) {
  return (media || []).map((item, index) => ({
    ...clone(item),
    _clientKey: item.editor_key
      ? `existing-${prefix}-media:${item.editor_key}`
      : `existing-${prefix}-media:${ownerKey}:${index}`,
    _isNew: false,
    caption_en: item.caption_en || "",
    caption_ko: item.caption_ko || "",
  }));
}

function hydrateNotePairs(item, ownerKey, prefix) {
  const english = Array.isArray(item.notes_en) ? item.notes_en : [];
  const korean = Array.isArray(item.notes_kr) ? item.notes_kr : [];
  return Array.from({ length: Math.max(english.length, korean.length) }, (_, index) => ({
    _clientKey: `${prefix}-note:${ownerKey}:${index}:${state.nextContentRowKey++}`,
    en: english[index] || "",
    kr: korean[index] || "",
  }));
}

function hydrateProjects(items) {
  return (items || []).map((item, index) => {
    const hydrated = clone(item);
    const ownerKey = item.editor_key || `project:${index}`;
    return {
      ...hydrated,
      _clientKey: item.editor_key ? `existing-project:${item.editor_key}` : `existing-project:${index}`,
      _isNew: false,
      start_date: hydrated.start_date || "",
      end_date: hydrated.end_date || "",
      title_en: hydrated.title_en || "",
      title_ko: hydrated.title_ko || "",
      theme: hydrated.theme || "",
      funder_en: hydrated.funder_en || "",
      funder_ko: hydrated.funder_ko || "",
      note_pairs: hydrateNotePairs(hydrated, ownerKey, "project"),
      media: hydrateContentMedia(hydrated.media, ownerKey, "project"),
    };
  });
}

function hydrateSoftware(items) {
  return (items || []).map((item, index) => {
    const hydrated = clone(item);
    const ownerKey = item.editor_key || item.id || `software:${index}`;
    return {
      ...hydrated,
      _clientKey: item.editor_key ? `existing-software:${item.editor_key}` : `existing-software:${index}`,
      _isNew: false,
      id: hydrated.id || "",
      name: hydrated.name || "",
      stage: hydrated.stage || "development",
      note_pairs: hydrateNotePairs(hydrated, ownerKey, "software"),
      links: (hydrated.links || []).map((link, linkIndex) => {
        const isString = typeof link === "string";
        return {
          ...(isString ? {} : clone(link)),
          _clientKey: `software-link:${ownerKey}:${linkIndex}:${state.nextContentRowKey++}`,
          url: isString ? link : link?.url || "",
          label: isString ? "" : link?.label || "",
          label_en: isString ? "" : link?.label_en || "",
          label_ko: isString ? "" : link?.label_ko || "",
        };
      }),
      technologies: (hydrated.technologies || []).map((technology, technologyIndex) => ({
        _clientKey: `software-technology:${ownerKey}:${technologyIndex}:${state.nextContentRowKey++}`,
        value: technology || "",
      })),
      media: hydrateContentMedia(hydrated.media, ownerKey, "software"),
    };
  });
}

function toContentMediaPayload(media) {
  const reference = media.stage_token
    ? { stage_token: media.stage_token }
    : { editor_key: media.editor_key };
  return {
    ...reference,
    caption_en: media.caption_en || "",
    caption_ko: media.caption_ko || "",
  };
}

function toProjectPayload(item) {
  return {
    start_date: item.start_date || "",
    end_date: item.end_date || "",
    title_en: item.title_en || "",
    title_ko: item.title_ko || "",
    theme: item.theme || "",
    funder_en: item.funder_en || "",
    funder_ko: item.funder_ko || "",
    notes_en: (item.note_pairs || []).map((note) => note.en || ""),
    notes_kr: (item.note_pairs || []).map((note) => note.kr || ""),
    media: (item.media || []).map(toContentMediaPayload),
  };
}

function toSoftwareLinkPayload(link) {
  return {
    ...(link.editor_key ? { editor_key: link.editor_key } : {}),
    url: link.url || "",
    label: link.label || "",
    label_en: link.label_en || "",
    label_ko: link.label_ko || "",
  };
}

function toSoftwarePayload(item) {
  return {
    name: item.name || "",
    stage: item.stage || "development",
    links: (item.links || []).map(toSoftwareLinkPayload),
    notes_en: (item.note_pairs || []).map((note) => note.en || ""),
    notes_kr: (item.note_pairs || []).map((note) => note.kr || ""),
    media: (item.media || []).map(toContentMediaPayload),
    technologies: (item.technologies || []).map((technology) => technology.value || ""),
  };
}

function toProjectsSavePayload(items, baselineItems) {
  const baseline = new Map(
    (baselineItems || [])
      .filter((item) => !item._isNew && item.editor_key)
      .map((item) => [item.editor_key, JSON.stringify(toProjectPayload(item))]),
  );
  return (items || []).map((item) => {
    const project = toProjectPayload(item);
    if (item._isNew) return { project };
    if (baseline.get(item.editor_key) === JSON.stringify(project)) return { editor_key: item.editor_key };
    return { editor_key: item.editor_key, project };
  });
}

function toSoftwareSavePayload(items, baselineItems) {
  const baseline = new Map(
    (baselineItems || [])
      .filter((item) => !item._isNew && item.editor_key)
      .map((item) => [item.editor_key, JSON.stringify(toSoftwarePayload(item))]),
  );
  return (items || []).map((item) => {
    const software = toSoftwarePayload(item);
    if (item._isNew) return { software };
    if (baseline.get(item.editor_key) === JSON.stringify(software)) return { editor_key: item.editor_key };
    return { editor_key: item.editor_key, software };
  });
}

function projectsComparable(items) {
  return JSON.stringify((items || []).map((item) => ({
    identity: item._isNew ? `new:${item._clientKey}` : `existing:${item.editor_key}`,
    project: toProjectPayload(item),
  })));
}

function softwareComparable(items) {
  return JSON.stringify((items || []).map((item) => ({
    identity: item._isNew ? `new:${item._clientKey}` : `existing:${item.editor_key}`,
    software: toSoftwarePayload(item),
  })));
}

function syncNativeDirty(dirty) {
  if (!state.bridge) return;
  state.dirtySync = state.dirtySync
    .catch(() => {})
    .then(() => state.bridge.SetDirty(dirty))
    .catch(() => {});
}

function updateDirtyState() {
  if (
    !state.draft
    || !state.baseline
    || !state.boardDraft
    || !state.boardBaseline
    || !state.projectsDraft
    || !state.projectsBaseline
    || !state.softwareDraft
    || !state.softwareBaseline
  ) return;
  const nextDirty = comparable(state.draft) !== comparable(state.baseline)
    || boardComparable(state.boardDraft) !== boardComparable(state.boardBaseline)
    || projectsComparable(state.projectsDraft) !== projectsComparable(state.projectsBaseline)
    || softwareComparable(state.softwareDraft) !== softwareComparable(state.softwareBaseline);
  if (state.dirty !== nextDirty) {
    state.dirty = nextDirty;
    syncNativeDirty(nextDirty);
  }
  saveError.hidden = true;
  validateDraft();
  updateToolbar();
}

function updateToolbar() {
  const invalid = state.validationErrors.size > 0;
  const locked = state.loading || state.saving || state.discarding || state.boardDropBusy;
  saveButton.disabled = locked || !state.dirty || invalid;
  discardButton.disabled = locked || !state.dirty;
  document.querySelectorAll("[data-editor-control]").forEach((control) => {
    control.disabled = locked;
  });
  const addProjectButton = document.querySelector("#add-project-button");
  const addSoftwareButton = document.querySelector("#add-software-button");
  if (addProjectButton) addProjectButton.disabled = locked || (state.projectsDraft?.length || 0) >= 500;
  if (addSoftwareButton) addSoftwareButton.disabled = locked || (state.softwareDraft?.length || 0) >= 500;

  if (state.loading) {
    setStatus("데이터를 불러오는 중…");
  } else if (state.saving) {
    setStatus("저장 중…");
  } else if (state.discarding) {
    setStatus("변경을 취소하는 중…");
  } else if (state.boardDropBusy) {
    setStatus("사진을 준비하는 중…");
  } else if (state.dirty && invalid) {
    setStatus("입력 내용을 확인하세요", "error");
  } else if (state.dirty) {
    setStatus("저장되지 않은 변경", "dirty");
  } else if (!state.statusText || state.statusTone === "dirty") {
    setStatus("불러옴");
  }
}

function validationKey(kind, clientKey, field) {
  return `${kind}|${clientKey}|${field}`;
}

function fallbackValidationKey(kind, field) {
  return `${kind}|fallback|${field}`;
}

function validateLabelValue(value, key, context) {
  const trimmed = value.trim();
  if (!trimmed) {
    state.validationErrors.set(key, `${context}을(를) 입력해 주세요.`);
  } else if ([...trimmed].length > 100) {
    state.validationErrors.set(key, `${context}은(는) 100자 이하여야 합니다.`);
  }
}

function validateTaxonomy(kind) {
  const config = taxonomyConfig[kind];
  const items = state.draft[config.listKey];
  const fields = [
    ["label_en", "영문 이름"],
    ["label_ko", "국문 이름"],
  ];

  fields.forEach(([field, fieldLabel]) => {
    const values = new Map();
    items.forEach((item) => {
      const key = validationKey(kind, item._clientKey, field);
      validateLabelValue(item[field] || "", key, fieldLabel);
      const normalised = (item[field] || "").trim().toLocaleLowerCase();
      if (!normalised) return;
      const matches = values.get(normalised) || [];
      matches.push(item);
      values.set(normalised, matches);
    });
    values.forEach((matches) => {
      if (matches.length < 2) return;
      matches.forEach((item) => {
        state.validationErrors.set(
          validationKey(kind, item._clientKey, field),
          `${fieldLabel}은(는) 중복될 수 없습니다.`,
        );
      });
    });
  });

  const fallback = state.draft[config.fallbackKey];
  validateLabelValue(fallback.label_en || "", fallbackValidationKey(kind, "label_en"), "기타 분류 영문 이름");
  validateLabelValue(fallback.label_ko || "", fallbackValidationKey(kind, "label_ko"), "기타 분류 국문 이름");
}

function boardValidationKey(clientKey, field) {
  return `board|${clientKey}|${field}`;
}

function isCanonicalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateBoardText(value, key, label, maximum, required = false) {
  const trimmed = String(value || "").trim();
  if (required && !trimmed) {
    state.validationErrors.set(key, `${label}을(를) 입력해 주세요.`);
  } else if ([...trimmed].length > maximum) {
    state.validationErrors.set(key, `${label}은(는) ${maximum}자 이하여야 합니다.`);
  }
}

function validateBoard() {
  state.boardDraft.forEach((item) => {
    const startKey = boardValidationKey(item._clientKey, "start_date");
    const endKey = boardValidationKey(item._clientKey, "end_date");
    const startDate = String(item.start_date || "").trim();
    const endDate = String(item.end_date || "").trim();
    if (!isCanonicalDate(startDate)) {
      state.validationErrors.set(startKey, "시작일을 입력해 주세요.");
    }
    if (endDate && !isCanonicalDate(endDate)) {
      state.validationErrors.set(endKey, "종료일 형식을 확인해 주세요.");
    } else if (isCanonicalDate(startDate) && endDate && startDate > endDate) {
      state.validationErrors.set(endKey, "종료일은 시작일보다 빠를 수 없습니다.");
    }
    const titleENKey = boardValidationKey(item._clientKey, "title_en");
    const titleKOKey = boardValidationKey(item._clientKey, "title_ko");
    validateBoardText(item.title_en, titleENKey, "영문 제목", 300);
    validateBoardText(item.title_ko, titleKOKey, "국문 제목", 300);
    if (!String(item.title_en || "").trim() && !String(item.title_ko || "").trim()) {
      const message = "영문 또는 국문 제목을 입력해 주세요.";
      state.validationErrors.set(titleENKey, message);
      state.validationErrors.set(titleKOKey, message);
    }
    validateBoardText(item.content_en, boardValidationKey(item._clientKey, "content_en"), "영문 본문", 20000);
    validateBoardText(item.content_ko, boardValidationKey(item._clientKey, "content_ko"), "국문 본문", 20000);
    item.media.forEach((media) => {
      validateBoardText(
        media.caption_en,
        boardValidationKey(item._clientKey, `media:${media._clientKey}:caption_en`),
        "영문 사진 설명",
        500,
      );
      validateBoardText(
        media.caption_ko,
        boardValidationKey(item._clientKey, `media:${media._clientKey}:caption_ko`),
        "국문 사진 설명",
        500,
      );
    });
  });
}

function contentValidationKey(collection, clientKey, field) {
  return `${collection}|${clientKey}|${field}`;
}

function validateContentText(collection, item, field, label, maximum, required = false) {
  validateBoardText(
    item[field],
    contentValidationKey(collection, item._clientKey, field),
    label,
    maximum,
    required,
  );
}

function validateNotePairs(collection, item) {
  const pairs = item.note_pairs || [];
  if (!pairs.length) {
    state.validationErrors.set(
      contentValidationKey(collection, item._clientKey, "notes"),
      "설명을 하나 이상 입력해 주세요.",
    );
    return;
  }
  pairs.forEach((note) => {
    validateBoardText(
      note.en,
      contentValidationKey(collection, item._clientKey, `note:${note._clientKey}:en`),
      "English description",
      5000,
      true,
    );
    validateBoardText(
      note.kr,
      contentValidationKey(collection, item._clientKey, `note:${note._clientKey}:kr`),
      "국문 설명",
      5000,
      true,
    );
  });
}

function validateProjects() {
  const knownThemes = new Set(
    (state.draft?.project_themes || []).map((item) => item.id).filter(Boolean),
  );
  (state.projectsDraft || []).forEach((item) => {
    const startKey = contentValidationKey("projects", item._clientKey, "start_date");
    const endKey = contentValidationKey("projects", item._clientKey, "end_date");
    const startDate = String(item.start_date || "").trim();
    const endDate = String(item.end_date || "").trim();
    if (!isCanonicalDate(startDate)) state.validationErrors.set(startKey, "시작일을 입력해 주세요.");
    if (!isCanonicalDate(endDate)) {
      state.validationErrors.set(endKey, "종료일을 입력해 주세요.");
    } else if (isCanonicalDate(startDate) && startDate > endDate) {
      state.validationErrors.set(endKey, "종료일은 시작일보다 빠를 수 없습니다.");
    }

    validateContentText("projects", item, "title_en", "English title", 500);
    validateContentText("projects", item, "title_ko", "국문 제목", 500);
    validateContentText("projects", item, "funder_en", "English funder", 500);
    validateContentText("projects", item, "funder_ko", "국문 지원기관", 500);
    if (!item.theme || !knownThemes.has(item.theme)) {
      state.validationErrors.set(
        contentValidationKey("projects", item._clientKey, "theme"),
        "저장된 프로젝트 테마를 선택해 주세요.",
      );
    }
    validateNotePairs("projects", item);
    (item.media || []).forEach((media) => {
      const englishKey = contentValidationKey("projects", item._clientKey, `media:${media._clientKey}:caption_en`);
      const koreanKey = contentValidationKey("projects", item._clientKey, `media:${media._clientKey}:caption_ko`);
      validateBoardText(media.caption_en, englishKey, "English caption", 500);
      validateBoardText(media.caption_ko, koreanKey, "국문 사진 설명", 500);
      if (Boolean(String(media.caption_en || "").trim()) !== Boolean(String(media.caption_ko || "").trim())) {
        const message = "English와 국문 사진 설명을 모두 입력하거나 모두 비워 주세요.";
        state.validationErrors.set(englishKey, message);
        state.validationErrors.set(koreanKey, message);
      }
    });
  });
}

function isHTTPURL(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.host);
  } catch (_) {
    return false;
  }
}

function validateSoftware() {
  const stages = new Set(["release", "preview", "development"]);
  (state.softwareDraft || []).forEach((item) => {
    validateContentText("software", item, "name", "이름", 300, true);
    if (!stages.has(item.stage)) {
      state.validationErrors.set(
        contentValidationKey("software", item._clientKey, "stage"),
        "단계를 선택해 주세요.",
      );
    }
    validateNotePairs("software", item);
    (item.links || []).forEach((link) => {
      const key = contentValidationKey("software", item._clientKey, `link:${link._clientKey}:url`);
      if (!isHTTPURL(link.url)) state.validationErrors.set(key, "http 또는 https 주소를 입력해 주세요.");
      [["label", "링크 이름"], ["label_en", "English link label"], ["label_ko", "국문 링크 이름"]]
        .forEach(([field, label]) => validateBoardText(
          link[field],
          contentValidationKey("software", item._clientKey, `link:${link._clientKey}:${field}`),
          label,
          300,
        ));
    });
    if (!(item.technologies || []).length) {
      state.validationErrors.set(
        contentValidationKey("software", item._clientKey, "technologies"),
        "기술을 하나 이상 입력해 주세요.",
      );
    }
    (item.technologies || []).forEach((technology) => {
      validateBoardText(
        technology.value,
        contentValidationKey("software", item._clientKey, `technology:${technology._clientKey}`),
        "기술",
        200,
        true,
      );
    });
    (item.media || []).forEach((media) => {
      validateBoardText(
        media.caption_en,
        contentValidationKey("software", item._clientKey, `media:${media._clientKey}:caption_en`),
        "English caption",
        500,
        true,
      );
      validateBoardText(
        media.caption_ko,
        contentValidationKey("software", item._clientKey, `media:${media._clientKey}:caption_ko`),
        "국문 사진 설명",
        500,
        true,
      );
    });
  });
}

function validateDraft() {
  state.validationErrors = new Map();
  if (!state.draft) return;
  validateTaxonomy("projectThemes");
  validateTaxonomy("publicationTopics");
  validateBoard();
  validateProjects();
  validateSoftware();
  applyValidationErrors();
}

function applyValidationErrors() {
  document.querySelectorAll("[data-validation-key]").forEach((input) => {
    const message = state.validationErrors.get(input.dataset.validationKey) || "";
    input.setAttribute("aria-invalid", String(Boolean(message)));
    input.setCustomValidity(message);
  });
  document.querySelectorAll("[data-error-scope]").forEach((element) => {
    const prefix = element.dataset.errorScope;
    const messages = [];
    state.validationErrors.forEach((message, key) => {
      if (key.startsWith(prefix) && !messages.includes(message)) messages.push(message);
    });
    element.textContent = messages.join(" ");
  });
  document.querySelectorAll(".board-item-row[data-board-key]").forEach((row) => {
    const prefix = `board|${row.dataset.boardKey}|`;
    const invalid = Array.from(state.validationErrors.keys()).some((key) => key.startsWith(prefix));
    row.setAttribute("aria-invalid", String(invalid));
    const badge = row.querySelector("[data-board-error-badge]");
    if (badge) badge.hidden = !invalid;
  });
  document.querySelectorAll(".board-item-row[data-content-collection][data-content-key]").forEach((row) => {
    const prefix = `${row.dataset.contentCollection}|${row.dataset.contentKey}|`;
    const invalid = Array.from(state.validationErrors.keys()).some((key) => key.startsWith(prefix));
    row.setAttribute("aria-invalid", String(invalid));
    const badge = row.querySelector("[data-content-error-badge]");
    if (badge) badge.hidden = !invalid;
  });
}

function activateTab(nextTab, focus = true) {
  tabs.forEach((tab) => {
    const active = tab === nextTab;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panelName !== nextTab.dataset.panel;
  });
  if (focus) nextTab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    activateTab(tabs[(index + direction + tabs.length) % tabs.length]);
  });
});

function makeButton(label, className, action, title = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.title = title;
  if (title !== label) button.setAttribute("aria-label", title);
  button.dataset.action = action;
  button.disabled = state.loading || state.saving || state.discarding || state.boardDropBusy;
  return button;
}

function renderSectionList(zone) {
  const key = zone === "visible" ? "main_page_sections" : "hidden_main_page_sections";
  const list = document.querySelector(`#${zone}-section-list`);
  list.replaceChildren();

  state.draft[key].forEach((section, index, sections) => {
    const row = document.createElement("li");
    row.className = "section-row";
    row.dataset.section = section;
    row.dataset.zone = zone;

    const handle = makeButton("", "drag-handle", "drag-section", `${SECTION_LABELS[section]} 순서 이동`);
    handle.draggable = !state.saving;
    handle.setAttribute("aria-label", `${SECTION_LABELS[section]} 드래그하여 이동`);

    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = SECTION_LABELS[section] || section;

    const actions = document.createElement("span");
    actions.className = "row-actions";
    const up = makeButton("↑", "icon-button", "section-up", "위로");
    const down = makeButton("↓", "icon-button", "section-down", "아래로");
    const toggle = makeButton(zone === "visible" ? "숨기기" : "노출하기", "text-button", "section-toggle");
    up.disabled = state.saving || index === 0;
    down.disabled = state.saving || index === sections.length - 1;
    actions.append(up, down, toggle);
    row.append(handle, label, actions);
    list.append(row);
  });

  document.querySelector(`#${zone}-section-count`).textContent = String(state.draft[key].length);
}

function createLabelInput(value, key, placeholder) {
  const input = document.createElement("input");
  input.className = "label-input";
  input.type = "text";
  input.maxLength = 100;
  input.value = value || "";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.disabled = state.saving || state.discarding;
  input.dataset.validationKey = key;
  return input;
}

function taxonomyUsage(kind, item) {
  if (!item.id) return 0;
  if (kind === "projectThemes" && state.projectsDraft) {
    return state.projectsDraft.filter((project) => project.theme === item.id).length;
  }
  const config = taxonomyConfig[kind];
  return state.usage[config.usageKey]?.[item.id] || 0;
}

function renderTaxonomy(kind) {
  const config = taxonomyConfig[kind];
  const list = document.querySelector(`#${config.listElement}`);
  const items = state.draft[config.listKey];
  list.replaceChildren();

  items.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = "taxonomy-row";
    row.dataset.kind = kind;
    row.dataset.clientKey = item._clientKey;

    const handle = makeButton("", "drag-handle", "drag-taxonomy", `${config.itemName} 순서 이동`);
    handle.draggable = !state.saving;
    handle.setAttribute("aria-label", `${config.itemName} 드래그하여 순서 이동`);

    const englishKey = validationKey(kind, item._clientKey, "label_en");
    const koreanKey = validationKey(kind, item._clientKey, "label_ko");
    const english = createLabelInput(item.label_en, englishKey, "English label");
    const korean = createLabelInput(item.label_ko, koreanKey, "국문 이름");
    english.dataset.kind = kind;
    english.dataset.clientKey = item._clientKey;
    english.dataset.field = "label_en";
    korean.dataset.kind = kind;
    korean.dataset.clientKey = item._clientKey;
    korean.dataset.field = "label_ko";

    const count = taxonomyUsage(kind, item);
    const usage = document.createElement("span");
    usage.className = "usage-chip";
    usage.textContent = count ? `${count}개 사용` : "미사용";

    const actions = document.createElement("span");
    actions.className = "taxonomy-actions";
    const up = makeButton("↑", "icon-button", "taxonomy-up", "위로");
    const down = makeButton("↓", "icon-button", "taxonomy-down", "아래로");
    const remove = makeButton("삭제", "text-button delete-button", "taxonomy-delete", `${config.itemName} 삭제`);
    up.disabled = state.saving || index === 0;
    down.disabled = state.saving || index === items.length - 1;
    remove.disabled = state.saving || count > 0;
    if (count > 0) remove.title = `${count}개 데이터에서 사용 중입니다. 먼저 해당 데이터를 재분류해 주세요.`;
    actions.append(up, down, remove);

    const error = document.createElement("div");
    error.className = "row-error";
    error.dataset.errorScope = `${kind}|${item._clientKey}|`;

    row.append(handle, english, korean, usage, actions, error);
    list.append(row);
  });

  renderFallback(kind);
}

function renderFallback(kind) {
  const config = taxonomyConfig[kind];
  const fallback = state.draft[config.fallbackKey];
  const container = document.querySelector(`#${config.fallbackElement}`);
  container.replaceChildren();

  const label = document.createElement("span");
  label.className = "fallback-label";
  label.textContent = "기타";
  const englishKey = fallbackValidationKey(kind, "label_en");
  const koreanKey = fallbackValidationKey(kind, "label_ko");
  const english = createLabelInput(fallback.label_en, englishKey, "Other");
  const korean = createLabelInput(fallback.label_ko, koreanKey, "기타");
  english.dataset.fallbackKind = kind;
  english.dataset.field = "label_en";
  korean.dataset.fallbackKind = kind;
  korean.dataset.field = "label_ko";

  const error = document.createElement("div");
  error.className = "row-error";
  error.dataset.errorScope = `${kind}|fallback|`;
  container.append(label, english, korean, error);
}

function boardItem(clientKey) {
  const index = state.boardDraft.findIndex((item) => item._clientKey === clientKey);
  return { index, item: index >= 0 ? state.boardDraft[index] : null };
}

function boardDateLabel(item) {
  if (!item.start_date) return "날짜 미입력";
  return item.end_date ? `${item.start_date} – ${item.end_date}` : item.start_date;
}

function renderBoardList() {
  const list = document.querySelector("#board-item-list");
  const items = sortedBoardItems(state.boardDraft);
  if (state.selectedBoardKey && !state.boardDraft.some((item) => item._clientKey === state.selectedBoardKey)) {
    state.selectedBoardKey = "";
  }
  list.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = `board-item-row${item._clientKey === state.selectedBoardKey ? " is-selected" : ""}`;
    row.dataset.boardKey = item._clientKey;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "board-item-select";
    select.dataset.action = "board-select";
    select.disabled = state.saving;
    select.setAttribute("aria-label", `${item.title_ko || item.title_en || "새 게시글"} 선택`);
    if (item._clientKey === state.selectedBoardKey) select.setAttribute("aria-current", "true");

    const date = document.createElement("span");
    date.className = "board-item-date";
    date.textContent = boardDateLabel(item);
    const title = document.createElement("span");
    title.className = "board-item-title";
    title.textContent = item.title_ko || item.title_en || "(제목 미입력)";
    const subtitle = document.createElement("span");
    subtitle.className = "board-item-subtitle";
    subtitle.textContent = item.title_en || item.title_ko || "새 게시글 내용을 입력하세요";
    const badges = document.createElement("span");
    badges.className = "board-item-badges";
    if (item._isNew) {
      const newBadge = document.createElement("span");
      newBadge.className = "board-badge board-badge-new";
      newBadge.textContent = "신규";
      badges.append(newBadge);
    }
    const mediaBadge = document.createElement("span");
    mediaBadge.className = "board-badge";
    mediaBadge.textContent = `사진 ${(item.media || []).length}개`;
    badges.append(mediaBadge);
    const errorBadge = document.createElement("span");
    errorBadge.className = "board-badge board-badge-error";
    errorBadge.dataset.boardErrorBadge = "";
    errorBadge.textContent = "입력 확인";
    errorBadge.hidden = true;
    badges.append(errorBadge);
    select.append(date, title, subtitle, badges);

    const remove = makeButton("삭제", "text-button delete-button board-item-delete", "board-delete", "게시글 삭제");
    remove.setAttribute("aria-label", `${item.title_ko || item.title_en || "새 게시글"} 삭제`);
    row.append(select, remove);
    list.append(row);
  });
  document.querySelector("#board-item-count").textContent = String(items.length);
}

function makeBoardField(item, labelText, field, options = {}) {
  const label = document.createElement("label");
  label.className = `board-field${options.full ? " board-field-full" : ""}`;
  const title = document.createElement("span");
  title.textContent = labelText;
  const control = options.textarea ? document.createElement("textarea") : document.createElement("input");
  control.className = options.textarea ? "board-textarea" : "board-input";
  if (!options.textarea) control.type = options.type || "text";
  control.value = item[field] || "";
  control.maxLength = options.maxLength || (options.textarea ? 20000 : 300);
  control.disabled = state.saving || state.discarding;
  control.autocomplete = "off";
  control.dataset.boardKey = item._clientKey;
  control.dataset.boardField = field;
  control.dataset.validationKey = boardValidationKey(item._clientKey, field);
  const error = document.createElement("span");
  error.className = "board-field-error";
  error.dataset.errorScope = boardValidationKey(item._clientKey, field);
  error.id = `board-error-${item._clientKey.replace(/[^a-z0-9-]/gi, "-")}-${field}`;
  control.setAttribute("aria-describedby", error.id);
  label.append(title, control, error);
  return label;
}

function formatBytes(size) {
  if (!Number.isFinite(Number(size)) || Number(size) < 0) return "";
  size = Number(size);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function boardMediaName(media, index) {
  if (media.original_name) return media.original_name;
  const source = String(media.src || "").split(/[\\/]/).pop();
  if (source) return source;
  return media.type === "video" ? `동영상 ${index + 1}` : `사진 ${index + 1}`;
}

function renderBoardEditor() {
  const placeholder = document.querySelector("#board-editor-placeholder");
  const form = document.querySelector("#board-form");
  const found = boardItem(state.selectedBoardKey);
  form.replaceChildren();

  if (!found.item) {
    placeholder.hidden = false;
    form.hidden = true;
    return;
  }
  placeholder.hidden = true;
  form.hidden = false;

  const heading = document.createElement("div");
  heading.className = "board-form-heading";
  const headingTitle = document.createElement("h3");
  headingTitle.textContent = found.item._isNew ? "새 게시글" : "게시글";
  heading.append(headingTitle);

  const grid = document.createElement("div");
  grid.className = "board-form-grid";
  grid.append(
    makeBoardField(found.item, "시작일", "start_date", { type: "date" }),
    makeBoardField(found.item, "종료일 (하루짜리는 비움)", "end_date", { type: "date" }),
    makeBoardField(found.item, "English title", "title_en", { full: true }),
    makeBoardField(found.item, "국문 제목", "title_ko", { full: true }),
    makeBoardField(found.item, "English content (선택)", "content_en", { textarea: true, full: true }),
    makeBoardField(found.item, "국문 본문 (선택)", "content_ko", { textarea: true, full: true }),
  );

  const mediaSection = document.createElement("section");
  mediaSection.className = "board-media-section";
  const mediaHeading = document.createElement("div");
  mediaHeading.className = "board-media-heading";
  const mediaTitle = document.createElement("h4");
  mediaTitle.textContent = "사진";
  const mediaCount = document.createElement("span");
  mediaCount.className = "count-chip";
  mediaCount.textContent = String(found.item.media.length);
  mediaHeading.append(mediaTitle, mediaCount);

  const dropzone = document.createElement("div");
  dropzone.className = `board-dropzone${state.boardDropBusy ? " is-receiving" : ""}`;
  dropzone.dataset.boardMediaDropzone = "";
  dropzone.setAttribute("aria-label", "Explorer에서 사진을 드롭하는 영역");
  dropzone.setAttribute("aria-busy", String(state.boardDropBusy));
  const dropTitle = document.createElement("strong");
  dropTitle.textContent = state.boardDropBusy ? "사진을 준비하는 중…" : "Explorer에서 사진을 이곳으로 드래그";
  dropzone.append(dropTitle);
  if (state.boardDropMessage) {
    const feedback = document.createElement("p");
    feedback.className = "board-drop-feedback";
    feedback.setAttribute("role", "status");
    feedback.textContent = state.boardDropMessage;
    dropzone.append(feedback);
  }

  const mediaList = document.createElement("ol");
  mediaList.className = "board-media-list";
  found.item.media.forEach((media, index) => {
    const row = document.createElement("li");
    row.className = "board-media-row";
    row.dataset.mediaKey = media._clientKey;
    const preview = document.createElement("div");
    preview.className = "board-media-preview";
    if (media.preview_url) {
      const image = document.createElement("img");
      image.src = media.preview_url;
      image.alt = "";
      preview.append(image);
    } else {
      preview.textContent = media.type === "video" ? "동영상" : "사진";
    }
    const fields = document.createElement("div");
    fields.className = "board-media-fields";
    const name = document.createElement("span");
    name.className = "board-media-name";
    const sizeLabel = formatBytes(media.size);
    name.textContent = `${boardMediaName(media, index)}${sizeLabel ? ` · ${sizeLabel}` : ""}`;
    const english = document.createElement("input");
    english.type = "text";
    english.className = "board-caption-input";
    english.placeholder = "English caption (선택)";
    english.maxLength = 500;
    english.value = media.caption_en || "";
    english.disabled = state.saving || state.discarding;
    english.dataset.boardKey = found.item._clientKey;
    english.dataset.mediaKey = media._clientKey;
    english.dataset.boardMediaField = "caption_en";
    english.dataset.validationKey = boardValidationKey(found.item._clientKey, `media:${media._clientKey}:caption_en`);
    english.setAttribute("aria-label", `${boardMediaName(media, index)} English caption`);
    const korean = document.createElement("input");
    korean.type = "text";
    korean.className = "board-caption-input";
    korean.placeholder = "국문 사진 설명 (선택)";
    korean.maxLength = 500;
    korean.value = media.caption_ko || "";
    korean.disabled = state.saving || state.discarding;
    korean.dataset.boardKey = found.item._clientKey;
    korean.dataset.mediaKey = media._clientKey;
    korean.dataset.boardMediaField = "caption_ko";
    korean.dataset.validationKey = boardValidationKey(found.item._clientKey, `media:${media._clientKey}:caption_ko`);
    korean.setAttribute("aria-label", `${boardMediaName(media, index)} 국문 사진 설명`);
    const error = document.createElement("span");
    error.className = "board-caption-error";
    error.dataset.errorScope = boardValidationKey(found.item._clientKey, `media:${media._clientKey}:`);
    error.id = `board-media-error-${found.item._clientKey.replace(/[^a-z0-9-]/gi, "-")}-${media._clientKey.replace(/[^a-z0-9-]/gi, "-")}`;
    english.setAttribute("aria-describedby", error.id);
    korean.setAttribute("aria-describedby", error.id);
    fields.append(name, english, korean, error);
    const remove = makeButton("제거", "text-button delete-button", "board-media-delete", "사진 제거");
    row.append(preview, fields, remove);
    mediaList.append(row);
  });
  if (!found.item.media.length) {
    const empty = document.createElement("p");
    empty.className = "board-media-empty";
    empty.textContent = "추가된 사진이 없습니다.";
    mediaSection.append(mediaHeading, dropzone, empty);
  } else {
    mediaSection.append(mediaHeading, dropzone, mediaList);
  }
  form.append(heading, grid, mediaSection);
}

function contentDraft(collection) {
  return collection === "projects" ? state.projectsDraft : state.softwareDraft;
}

function selectedContentKey(collection) {
  return collection === "projects" ? state.selectedProjectKey : state.selectedSoftwareKey;
}

function setSelectedContentKey(collection, clientKey) {
  if (collection === "projects") state.selectedProjectKey = clientKey;
  else state.selectedSoftwareKey = clientKey;
}

function contentItem(collection, clientKey) {
  const items = contentDraft(collection) || [];
  const index = items.findIndex((item) => item._clientKey === clientKey);
  return { items, index, item: index >= 0 ? items[index] : null };
}

function contentSingular(collection) {
  return collection === "projects" ? "프로젝트" : "소프트웨어";
}

function projectThemeLabel(themeID) {
  const theme = (state.draft?.project_themes || []).find((item) => item.id === themeID);
  return theme?.label_ko || theme?.label_en || themeID || "테마 미선택";
}

function softwareStageLabel(stage) {
  return ({ release: "출시", preview: "미리보기", development: "개발 중" })[stage] || stage || "단계 미선택";
}

function renderContentList(collection) {
  const items = contentDraft(collection) || [];
  let selectedKey = selectedContentKey(collection);
  if (selectedKey && !items.some((item) => item._clientKey === selectedKey)) {
    selectedKey = "";
    setSelectedContentKey(collection, "");
  }
  const list = document.querySelector(`#${collection === "projects" ? "project" : "software"}-item-list`);
  list.replaceChildren();
  items.forEach((item, index) => {
    const singular = contentSingular(collection);
    const titleText = collection === "projects"
      ? item.title_ko || item.title_en || "(제목 미입력)"
      : item.name || "(이름 미입력)";
    const row = document.createElement("li");
    row.className = `board-item-row content-item-row${item._clientKey === selectedKey ? " is-selected" : ""}`;
    row.dataset.contentCollection = collection;
    row.dataset.contentKey = item._clientKey;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "board-item-select";
    select.dataset.action = "content-select";
    select.disabled = state.saving || state.discarding;
    select.setAttribute("aria-label", `${titleText} 선택`);
    if (item._clientKey === selectedKey) select.setAttribute("aria-current", "true");

    const order = document.createElement("span");
    order.className = "board-item-date";
    order.textContent = collection === "projects"
      ? `${item.start_date || "날짜 미입력"} – ${item.end_date || "날짜 미입력"}`
      : `${index + 1}. ${softwareStageLabel(item.stage)}`;
    const title = document.createElement("span");
    title.className = "board-item-title";
    title.textContent = titleText;
    const subtitle = document.createElement("span");
    subtitle.className = "board-item-subtitle";
    subtitle.textContent = collection === "projects"
      ? projectThemeLabel(item.theme)
      : (item.technologies || []).map((technology) => technology.value).filter(Boolean).join(" · ") || "기술 미입력";
    const badges = document.createElement("span");
    badges.className = "board-item-badges";
    if (item._isNew) {
      const newBadge = document.createElement("span");
      newBadge.className = "board-badge board-badge-new";
      newBadge.textContent = "신규";
      badges.append(newBadge);
    }
    const mediaBadge = document.createElement("span");
    mediaBadge.className = "board-badge";
    mediaBadge.textContent = `미디어 ${(item.media || []).length}개`;
    const errorBadge = document.createElement("span");
    errorBadge.className = "board-badge board-badge-error";
    errorBadge.dataset.contentErrorBadge = "";
    errorBadge.textContent = "입력 확인";
    errorBadge.hidden = true;
    badges.append(mediaBadge, errorBadge);
    select.append(order, title, subtitle, badges);

    const actions = document.createElement("span");
    actions.className = "content-item-actions";
    const up = makeButton("↑", "icon-button", "content-up", "위로");
    const down = makeButton("↓", "icon-button", "content-down", "아래로");
    const remove = makeButton("삭제", "text-button delete-button", "content-delete", `${singular} 삭제`);
    up.disabled = state.saving || state.discarding || index === 0;
    down.disabled = state.saving || state.discarding || index === items.length - 1;
    remove.setAttribute("aria-label", `${titleText} 삭제`);
    actions.append(up, down, remove);
    row.append(select, actions);
    list.append(row);
  });
  document.querySelector(`#${collection === "projects" ? "project" : "software"}-item-count`).textContent = String(items.length);
}

function makeContentField(collection, item, labelText, field, options = {}) {
  const label = document.createElement("label");
  label.className = `board-field${options.full ? " board-field-full" : ""}`;
  const title = document.createElement("span");
  title.textContent = labelText;
  let control;
  if (options.options) {
    control = document.createElement("select");
    options.options.forEach(({ value, label: optionLabel, disabled = false }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel;
      option.disabled = disabled;
      control.append(option);
    });
  } else {
    control = options.textarea ? document.createElement("textarea") : document.createElement("input");
    if (!options.textarea) control.type = options.type || "text";
    control.maxLength = options.maxLength || (options.textarea ? 20000 : 300);
    control.autocomplete = "off";
  }
  control.className = options.textarea ? "board-textarea" : "board-input";
  control.value = item[field] || "";
  control.disabled = state.saving || state.discarding;
  control.dataset.contentCollection = collection;
  control.dataset.contentKey = item._clientKey;
  control.dataset.contentField = field;
  control.dataset.validationKey = contentValidationKey(collection, item._clientKey, field);
  const error = document.createElement("span");
  error.className = "board-field-error";
  error.dataset.errorScope = contentValidationKey(collection, item._clientKey, field);
  error.id = `content-error-${collection}-${item._clientKey.replace(/[^a-z0-9-]/gi, "-")}-${field}`;
  control.setAttribute("aria-describedby", error.id);
  label.append(title, control, error);
  return label;
}

function contentSectionHeading(titleText, count, action, buttonLabel, maximum = 0) {
  const heading = document.createElement("div");
  heading.className = "content-repeat-heading";
  const title = document.createElement("h4");
  title.textContent = titleText;
  const actions = document.createElement("span");
  actions.className = "content-heading-actions";
  const countChip = document.createElement("span");
  countChip.className = "count-chip";
  countChip.textContent = String(count);
  actions.append(countChip);
  if (action) {
    const add = makeButton(buttonLabel, "button button-secondary content-add-button", action);
    if (maximum && count >= maximum) add.disabled = true;
    actions.append(add);
  }
  heading.append(title, actions);
  return heading;
}

function repeatRowActions(actionPrefix, index, total, deleteLabel) {
  const actions = document.createElement("span");
  actions.className = "content-row-actions";
  const up = makeButton("↑", "icon-button", `${actionPrefix}-up`, "위로");
  const down = makeButton("↓", "icon-button", `${actionPrefix}-down`, "아래로");
  const remove = makeButton("삭제", "text-button delete-button", `${actionPrefix}-delete`, deleteLabel);
  up.disabled = state.saving || state.discarding || index === 0;
  down.disabled = state.saving || state.discarding || index === total - 1;
  actions.append(up, down, remove);
  return actions;
}

function makeRepeatField(collection, item, row, field, labelText, validationField, options = {}) {
  const label = document.createElement("label");
  label.className = "board-field";
  const title = document.createElement("span");
  title.textContent = labelText;
  const input = options.textarea ? document.createElement("textarea") : document.createElement("input");
  input.className = options.textarea ? "board-textarea content-note-input" : "board-input";
  if (!options.textarea) input.type = options.type || "text";
  input.value = row[field] || "";
  input.maxLength = options.maxLength || (options.textarea ? 20000 : 300);
  input.disabled = state.saving || state.discarding;
  input.autocomplete = "off";
  input.dataset.contentCollection = collection;
  input.dataset.contentKey = item._clientKey;
  input.dataset.contentRowKey = row._clientKey;
  input.dataset[options.datasetField || "repeatField"] = field;
  const key = contentValidationKey(collection, item._clientKey, validationField);
  input.dataset.validationKey = key;
  const error = document.createElement("span");
  error.className = "board-field-error";
  error.dataset.errorScope = key;
  error.id = `content-repeat-error-${collection}-${item._clientKey}-${row._clientKey}-${field}`
    .replace(/[^a-z0-9-_]/gi, "-");
  input.setAttribute("aria-describedby", error.id);
  label.append(title, input, error);
  return label;
}

function renderNotesSection(collection, item) {
  const section = document.createElement("section");
  section.className = "content-repeat-section";
  section.append(contentSectionHeading("설명", item.note_pairs.length, "content-note-add", "설명 추가", 100));
  const list = document.createElement("div");
  list.className = "content-repeat-list";
  item.note_pairs.forEach((note, index) => {
    const row = document.createElement("div");
    row.className = "content-pair-row";
    row.dataset.contentRowKey = note._clientKey;
    row.append(
      makeRepeatField(collection, item, note, "en", "English description", `note:${note._clientKey}:en`, { textarea: true, datasetField: "noteField", maxLength: 5000 }),
      makeRepeatField(collection, item, note, "kr", "국문 설명", `note:${note._clientKey}:kr`, { textarea: true, datasetField: "noteField", maxLength: 5000 }),
      repeatRowActions("content-note", index, item.note_pairs.length, "설명 삭제"),
    );
    list.append(row);
  });
  if (!item.note_pairs.length) {
    const error = document.createElement("span");
    error.className = "board-field-error";
    error.dataset.errorScope = contentValidationKey(collection, item._clientKey, "notes");
    list.append(error);
  }
  section.append(list);
  return section;
}

function renderTechnologiesSection(item) {
  const collection = "software";
  const section = document.createElement("section");
  section.className = "content-repeat-section";
  section.append(contentSectionHeading("기술", item.technologies.length, "content-technology-add", "기술 추가", 100));
  const list = document.createElement("div");
  list.className = "content-repeat-list";
  item.technologies.forEach((technology, index) => {
    const row = document.createElement("div");
    row.className = "content-single-row";
    row.dataset.contentRowKey = technology._clientKey;
    row.append(
      makeRepeatField(
        collection,
        item,
        technology,
        "value",
        "기술 이름",
        `technology:${technology._clientKey}`,
        { datasetField: "technologyField", maxLength: 200 },
      ),
      repeatRowActions("content-technology", index, item.technologies.length, "기술 삭제"),
    );
    list.append(row);
  });
  if (!item.technologies.length) {
    const error = document.createElement("span");
    error.className = "board-field-error";
    error.dataset.errorScope = contentValidationKey(collection, item._clientKey, "technologies");
    list.append(error);
  }
  section.append(list);
  return section;
}

function renderLinksSection(item) {
  const collection = "software";
  const section = document.createElement("section");
  section.className = "content-repeat-section";
  section.append(contentSectionHeading("Links", item.links.length, "content-link-add", "링크 추가", 100));
  const list = document.createElement("div");
  list.className = "content-repeat-list";
  item.links.forEach((link, index) => {
    const row = document.createElement("div");
    row.className = "content-link-row";
    row.dataset.contentRowKey = link._clientKey;
    const fields = document.createElement("div");
    fields.className = "content-link-fields";
    fields.append(
      makeRepeatField(collection, item, link, "url", "URL", `link:${link._clientKey}:url`, { datasetField: "linkField", maxLength: 4096, type: "url" }),
      makeRepeatField(collection, item, link, "label", "이름", `link:${link._clientKey}:label`, { datasetField: "linkField" }),
      makeRepeatField(collection, item, link, "label_en", "English label", `link:${link._clientKey}:label_en`, { datasetField: "linkField" }),
      makeRepeatField(collection, item, link, "label_ko", "국문 이름", `link:${link._clientKey}:label_ko`, { datasetField: "linkField" }),
    );
    row.append(fields, repeatRowActions("content-link", index, item.links.length, "링크 삭제"));
    list.append(row);
  });
  section.append(list);
  return section;
}

function dropMessageKey(collection, clientKey) {
  return `${collection}:${clientKey}`;
}

function renderContentMediaSection(collection, item) {
  const section = document.createElement("section");
  section.className = "board-media-section";
  section.append(contentSectionHeading("미디어", item.media.length));
  const dropzone = document.createElement("div");
  dropzone.className = `board-dropzone${state.boardDropBusy ? " is-receiving" : ""}`;
  dropzone.dataset.contentMediaDropzone = "";
  dropzone.dataset.contentCollection = collection;
  dropzone.dataset.contentKey = item._clientKey;
  dropzone.setAttribute("aria-label", "Explorer에서 사진을 드롭하는 영역");
  dropzone.setAttribute("aria-busy", String(state.boardDropBusy));
  const dropTitle = document.createElement("strong");
  dropTitle.textContent = state.boardDropBusy ? "사진을 준비하는 중…" : "Explorer에서 사진을 이곳으로 드래그";
  dropzone.append(dropTitle);
  const message = state.contentDropMessages[dropMessageKey(collection, item._clientKey)] || "";
  if (message) {
    const feedback = document.createElement("p");
    feedback.className = "board-drop-feedback";
    feedback.setAttribute("role", "status");
    feedback.textContent = message;
    dropzone.append(feedback);
  }
  section.append(dropzone);

  if (!item.media.length) return section;
  const list = document.createElement("ol");
  list.className = "board-media-list";
  item.media.forEach((media, index) => {
    const row = document.createElement("li");
    row.className = "board-media-row content-media-row";
    row.dataset.contentMediaKey = media._clientKey;
    const preview = document.createElement("div");
    preview.className = "board-media-preview";
    if (media.preview_url) {
      const image = document.createElement("img");
      image.src = media.preview_url;
      image.alt = "";
      preview.append(image);
    } else {
      preview.textContent = media.type === "video" ? "동영상" : "사진";
    }
    const fields = document.createElement("div");
    fields.className = "board-media-fields";
    const name = document.createElement("span");
    name.className = "board-media-name";
    const sizeLabel = formatBytes(media.size);
    name.textContent = `${boardMediaName(media, index)}${sizeLabel ? ` · ${sizeLabel}` : ""}`;
    const english = document.createElement("input");
    const korean = document.createElement("input");
    [[english, "caption_en", "English caption"], [korean, "caption_ko", "국문 사진 설명"]]
      .forEach(([input, field, placeholder]) => {
        input.type = "text";
        input.className = "board-caption-input";
        input.placeholder = placeholder;
        input.maxLength = 500;
        input.value = media[field] || "";
        input.disabled = state.saving || state.discarding;
        input.dataset.contentCollection = collection;
        input.dataset.contentKey = item._clientKey;
        input.dataset.contentMediaKey = media._clientKey;
        input.dataset.contentMediaField = field;
        input.dataset.validationKey = contentValidationKey(collection, item._clientKey, `media:${media._clientKey}:${field}`);
        input.setAttribute("aria-label", `${boardMediaName(media, index)} ${placeholder}`);
      });
    const error = document.createElement("span");
    error.className = "board-caption-error";
    error.dataset.errorScope = contentValidationKey(collection, item._clientKey, `media:${media._clientKey}:`);
    error.id = `content-media-error-${collection}-${item._clientKey}-${media._clientKey}`
      .replace(/[^a-z0-9-_]/gi, "-");
    english.setAttribute("aria-describedby", error.id);
    korean.setAttribute("aria-describedby", error.id);
    fields.append(name, english, korean, error);
    const actions = repeatRowActions("content-media", index, item.media.length, "미디어 제거");
    row.append(preview, fields, actions);
    list.append(row);
  });
  section.append(list);
  return section;
}

function renderProjectEditor() {
  const placeholder = document.querySelector("#project-editor-placeholder");
  const form = document.querySelector("#project-form");
  const found = contentItem("projects", state.selectedProjectKey);
  form.replaceChildren();
  if (!found.item) {
    placeholder.hidden = false;
    form.hidden = true;
    return;
  }
  placeholder.hidden = true;
  form.hidden = false;
  form.dataset.contentCollection = "projects";
  form.dataset.contentKey = found.item._clientKey;
  const heading = document.createElement("div");
  heading.className = "board-form-heading";
  const title = document.createElement("h3");
  title.textContent = found.item._isNew ? "새 프로젝트" : "프로젝트";
  heading.append(title);
  const themeOptions = [{ value: "", label: "테마 선택" }].concat(
    (state.draft.project_themes || [])
      .filter((theme) => theme.id)
      .map((theme) => ({ value: theme.id, label: theme.label_ko || theme.label_en || theme.id })),
  );
  const grid = document.createElement("div");
  grid.className = "board-form-grid";
  grid.append(
    makeContentField("projects", found.item, "시작일", "start_date", { type: "date" }),
    makeContentField("projects", found.item, "종료일", "end_date", { type: "date" }),
    makeContentField("projects", found.item, "테마", "theme", { full: true, options: themeOptions }),
    makeContentField("projects", found.item, "English title", "title_en", { full: true, maxLength: 500 }),
    makeContentField("projects", found.item, "국문 제목", "title_ko", { full: true, maxLength: 500 }),
    makeContentField("projects", found.item, "English funder", "funder_en", { full: true, maxLength: 500 }),
    makeContentField("projects", found.item, "국문 지원기관", "funder_ko", { full: true, maxLength: 500 }),
  );
  form.append(heading, grid, renderNotesSection("projects", found.item), renderContentMediaSection("projects", found.item));
}

function renderSoftwareEditor() {
  const placeholder = document.querySelector("#software-editor-placeholder");
  const form = document.querySelector("#software-form");
  const found = contentItem("software", state.selectedSoftwareKey);
  form.replaceChildren();
  if (!found.item) {
    placeholder.hidden = false;
    form.hidden = true;
    return;
  }
  placeholder.hidden = true;
  form.hidden = false;
  form.dataset.contentCollection = "software";
  form.dataset.contentKey = found.item._clientKey;
  const heading = document.createElement("div");
  heading.className = "board-form-heading";
  const title = document.createElement("h3");
  title.textContent = found.item._isNew ? "새 소프트웨어" : "소프트웨어";
  heading.append(title);
  const grid = document.createElement("div");
  grid.className = "board-form-grid";
  grid.append(
    makeContentField("software", found.item, "이름", "name", { full: true }),
    makeContentField("software", found.item, "단계", "stage", {
      full: true,
      options: [
        { value: "release", label: "출시" },
        { value: "preview", label: "미리보기" },
        { value: "development", label: "개발 중" },
      ],
    }),
  );
  form.append(
    heading,
    grid,
    renderNotesSection("software", found.item),
    renderTechnologiesSection(found.item),
    renderLinksSection(found.item),
    renderContentMediaSection("software", found.item),
  );
}

function renderAll() {
  if (!state.draft) return;
  renderSectionList("visible");
  renderSectionList("hidden");
  renderTaxonomy("projectThemes");
  renderTaxonomy("publicationTopics");
  renderBoardList();
  renderBoardEditor();
  renderContentList("projects");
  renderProjectEditor();
  renderContentList("software");
  renderSoftwareEditor();
  validateDraft();
  updateToolbar();
}

function findSection(section, zone) {
  const key = zone === "visible" ? "main_page_sections" : "hidden_main_page_sections";
  return { key, items: state.draft[key], index: state.draft[key].indexOf(section) };
}

function moveSectionWithin(section, zone, delta) {
  const found = findSection(section, zone);
  const destination = found.index + delta;
  if (found.index < 0 || destination < 0 || destination >= found.items.length) return;
  [found.items[found.index], found.items[destination]] = [found.items[destination], found.items[found.index]];
  renderSectionList(zone);
  updateDirtyState();
  announce(`${SECTION_LABELS[section]} 섹션을 ${delta < 0 ? "위" : "아래"}로 이동했습니다.`);
}

function toggleSection(section, zone) {
  const source = findSection(section, zone);
  if (source.index < 0) return;
  source.items.splice(source.index, 1);
  const destinationZone = zone === "visible" ? "hidden" : "visible";
  const destination = findSection(section, destinationZone);
  destination.items.push(section);
  renderSectionList("visible");
  renderSectionList("hidden");
  updateDirtyState();
  announce(`${SECTION_LABELS[section]} 섹션을 ${destinationZone === "visible" ? "노출" : "숨김"} 목록으로 이동했습니다.`);
}

function moveSectionByDrop(section, sourceZone, destinationZone, beforeSection) {
  const source = findSection(section, sourceZone);
  if (source.index < 0) return;
  source.items.splice(source.index, 1);
  const destination = findSection(section, destinationZone);
  let index = beforeSection ? destination.items.indexOf(beforeSection) : destination.items.length;
  if (index < 0) index = destination.items.length;
  destination.items.splice(index, 0, section);
  renderSectionList("visible");
  renderSectionList("hidden");
  updateDirtyState();
  announce(`${SECTION_LABELS[section]} 섹션을 이동했습니다.`);
}

function taxonomyItem(kind, clientKey) {
  const config = taxonomyConfig[kind];
  const items = state.draft[config.listKey];
  return { config, items, index: items.findIndex((item) => item._clientKey === clientKey) };
}

function moveTaxonomy(kind, clientKey, delta) {
  const found = taxonomyItem(kind, clientKey);
  const destination = found.index + delta;
  if (found.index < 0 || destination < 0 || destination >= found.items.length) return;
  [found.items[found.index], found.items[destination]] = [found.items[destination], found.items[found.index]];
  renderTaxonomy(kind);
  updateDirtyState();
  announce(`${found.config.itemName} 순서를 이동했습니다.`);
}

function moveTaxonomyByDrop(kind, clientKey, beforeClientKey) {
  const found = taxonomyItem(kind, clientKey);
  if (found.index < 0) return;
  const [item] = found.items.splice(found.index, 1);
  let destination = beforeClientKey
    ? found.items.findIndex((candidate) => candidate._clientKey === beforeClientKey)
    : found.items.length;
  if (destination < 0) destination = found.items.length;
  found.items.splice(destination, 0, item);
  renderTaxonomy(kind);
  updateDirtyState();
  announce(`${found.config.itemName} 순서를 이동했습니다.`);
}

function addTaxonomy(kind) {
  const config = taxonomyConfig[kind];
  const clientKey = `new:${state.nextClientKey++}`;
  state.draft[config.listKey].push({ id: "", label_en: "", label_ko: "", _clientKey: clientKey });
  renderTaxonomy(kind);
  if (kind === "projectThemes") renderProjectEditor();
  updateDirtyState();
  requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll(`[data-kind="${kind}"]`))
      .find((element) => element.dataset.clientKey === clientKey);
    row?.querySelector('[data-field="label_en"]')?.focus();
  });
}

function deleteTaxonomy(kind, clientKey) {
  const found = taxonomyItem(kind, clientKey);
  if (found.index < 0) return;
  const item = found.items[found.index];
  if (taxonomyUsage(kind, item) > 0) return;
  found.items.splice(found.index, 1);
  renderTaxonomy(kind);
  if (kind === "projectThemes") {
    renderContentList("projects");
    renderProjectEditor();
  }
  updateDirtyState();
  announce(`${found.config.itemName}을(를) 삭제했습니다.`);
}

function localToday() {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addBoardPost() {
  const item = {
    _clientKey: `new-board:${state.nextBoardKey++}`,
    _isNew: true,
    start_date: localToday(),
    end_date: "",
    title_en: "",
    title_ko: "",
    content_en: "",
    content_ko: "",
    media: [],
  };
  state.boardDraft.push(item);
  state.selectedBoardKey = item._clientKey;
  state.boardDropMessage = "";
  renderBoardList();
  renderBoardEditor();
  updateDirtyState();
  requestAnimationFrame(() => {
    document.querySelector(`[data-board-key="${item._clientKey}"][data-board-field="title_en"]`)?.focus();
  });
}

function queueDiscardBoardMedia(tokens) {
  if (!tokens.length || !state.bridge) return;
  state.stagingOps = state.stagingOps
    .catch(() => {})
    .then(() => state.bridge.DiscardBoardMedia(tokens))
    .catch(() => {});
}

function deleteBoardPost(clientKey) {
  const found = boardItem(clientKey);
  if (!found.item) return;
  if (
    !found.item._isNew
    && !window.confirm(`'${found.item.title_ko || found.item.title_en}' 게시글을 삭제할까요?`)
  ) return;
  queueDiscardBoardMedia(found.item.media.map((media) => media.stage_token).filter(Boolean));
  state.boardDraft.splice(found.index, 1);
  const sorted = sortedBoardItems(state.boardDraft);
  if (state.selectedBoardKey === clientKey) {
    state.selectedBoardKey = sorted[0]?._clientKey || "";
  }
  state.boardDropMessage = "";
  renderBoardList();
  renderBoardEditor();
  updateDirtyState();
  announce("게시글을 삭제했습니다.");
}

function deleteBoardMedia(boardKey, mediaKey) {
  const found = boardItem(boardKey);
  if (!found.item) return;
  const mediaIndex = found.item.media.findIndex((media) => media._clientKey === mediaKey);
  if (mediaIndex < 0) return;
  const [removed] = found.item.media.splice(mediaIndex, 1);
  if (removed.stage_token) queueDiscardBoardMedia([removed.stage_token]);
  renderBoardList();
  renderBoardEditor();
  updateDirtyState();
}

function renderContentCollection(collection) {
  renderContentList(collection);
  if (collection === "projects") {
    renderProjectEditor();
    renderTaxonomy("projectThemes");
  } else {
    renderSoftwareEditor();
  }
  updateDirtyState();
}

function addContentItem(collection) {
  if ((contentDraft(collection)?.length || 0) >= 500) return;
  const today = localToday();
  let item;
  if (collection === "projects") {
    item = {
      _clientKey: `new-project:${state.nextProjectKey++}`,
      _isNew: true,
      start_date: today,
      end_date: today,
      title_en: "",
      title_ko: "",
      theme: (state.draft.project_themes || []).find((theme) => theme.id)?.id || "",
      funder_en: "",
      funder_ko: "",
      note_pairs: [{ _clientKey: `project-note:new:${state.nextContentRowKey++}`, en: "", kr: "" }],
      media: [],
    };
  } else {
    item = {
      _clientKey: `new-software:${state.nextSoftwareKey++}`,
      _isNew: true,
      id: "",
      name: "",
      stage: "development",
      links: [],
      note_pairs: [{ _clientKey: `software-note:new:${state.nextContentRowKey++}`, en: "", kr: "" }],
      technologies: [{ _clientKey: `software-technology:new:${state.nextContentRowKey++}`, value: "" }],
      media: [],
    };
  }
  contentDraft(collection).unshift(item);
  setSelectedContentKey(collection, item._clientKey);
  state.contentDropMessages[dropMessageKey(collection, item._clientKey)] = "";
  renderContentCollection(collection);
  requestAnimationFrame(() => {
    const field = collection === "projects" ? "title_en" : "name";
    document.querySelector(
      `[data-content-collection="${collection}"][data-content-key="${item._clientKey}"][data-content-field="${field}"]`,
    )?.focus();
  });
}

function moveContentItem(collection, clientKey, delta) {
  const found = contentItem(collection, clientKey);
  const destination = found.index + delta;
  if (!found.item || destination < 0 || destination >= found.items.length) return;
  [found.items[found.index], found.items[destination]] = [found.items[destination], found.items[found.index]];
  renderContentCollection(collection);
  announce(`${contentSingular(collection)} 순서를 이동했습니다.`);
}

function deleteContentItem(collection, clientKey) {
  const found = contentItem(collection, clientKey);
  if (!found.item) return;
  const title = collection === "projects"
    ? found.item.title_ko || found.item.title_en || "제목 미입력"
    : found.item.name || "이름 미입력";
  if (!found.item._isNew && !window.confirm(`'${title}' ${contentSingular(collection)}를 삭제할까요?`)) return;
  queueDiscardBoardMedia(found.item.media.map((media) => media.stage_token).filter(Boolean));
  found.items.splice(found.index, 1);
  delete state.contentDropMessages[dropMessageKey(collection, clientKey)];
  if (selectedContentKey(collection) === clientKey) {
    setSelectedContentKey(collection, found.items[Math.min(found.index, found.items.length - 1)]?._clientKey || "");
  }
  renderContentCollection(collection);
  announce(`${contentSingular(collection)}를 삭제했습니다.`);
}

function repeatCollection(item, kind) {
  if (kind === "note") return item.note_pairs;
  if (kind === "link") return item.links;
  if (kind === "technology") return item.technologies;
  if (kind === "media") return item.media;
  return null;
}

function addContentRow(collection, clientKey, kind) {
  const found = contentItem(collection, clientKey);
  const rows = found.item && repeatCollection(found.item, kind);
  if (!rows) return;
  if (rows.length >= 100) return;
  if (kind === "note") {
    rows.push({ _clientKey: `${collection}-note:new:${state.nextContentRowKey++}`, en: "", kr: "" });
  } else if (kind === "link") {
    rows.push({
      _clientKey: `software-link:new:${state.nextContentRowKey++}`,
      url: "",
      label: "",
      label_en: "",
      label_ko: "",
    });
  } else if (kind === "technology") {
    rows.push({ _clientKey: `software-technology:new:${state.nextContentRowKey++}`, value: "" });
  }
  renderContentCollection(collection);
}

function moveContentRow(collection, clientKey, kind, rowKey, delta) {
  const found = contentItem(collection, clientKey);
  const rows = found.item && repeatCollection(found.item, kind);
  const index = rows?.findIndex((row) => row._clientKey === rowKey) ?? -1;
  const destination = index + delta;
  if (!rows || index < 0 || destination < 0 || destination >= rows.length) return;
  [rows[index], rows[destination]] = [rows[destination], rows[index]];
  renderContentCollection(collection);
}

function deleteContentRow(collection, clientKey, kind, rowKey) {
  const found = contentItem(collection, clientKey);
  const rows = found.item && repeatCollection(found.item, kind);
  const index = rows?.findIndex((row) => row._clientKey === rowKey) ?? -1;
  if (!rows || index < 0) return;
  const [removed] = rows.splice(index, 1);
  if (kind === "media" && removed.stage_token) queueDiscardBoardMedia([removed.stage_token]);
  renderContentCollection(collection);
}

async function stageContentPaths(paths, collection, clientKey) {
  if (!paths?.length) return;
  const messageKey = dropMessageKey(collection, clientKey);
  const targetBeforeStage = contentItem(collection, clientKey);
  if (!targetBeforeStage.item) return;
  if (targetBeforeStage.item.media.length + paths.length > 60) {
    state.contentDropMessages[messageKey] = "미디어는 최대 60개까지 추가할 수 있습니다.";
    if (collection === "projects") renderProjectEditor();
    else renderSoftwareEditor();
    return;
  }
  state.contentDropMessages[messageKey] = "";
  if (collection === "projects") renderProjectEditor();
  else renderSoftwareEditor();
  updateToolbar();
  try {
    const response = await state.bridge.StageBoardMedia(Array.from(paths));
    const found = contentItem(collection, clientKey);
    const acceptedTokens = (response.items || []).map((item) => item.stage_token);
    if (!found.item) {
      queueDiscardBoardMedia(acceptedTokens);
      state.contentDropMessages[messageKey] = `${contentSingular(collection)}를 찾지 못해 사진을 추가하지 않았습니다.`;
    } else {
      (response.items || []).forEach((media) => {
        found.item.media.push({
          ...media,
          _clientKey: `new-content-media:${state.nextBoardMediaKey++}`,
          _isNew: true,
          caption_en: "",
          caption_ko: "",
        });
      });
      const rejected = response.rejected || [];
      state.contentDropMessages[messageKey] = rejected.length
        ? rejected.map((item) => `${item.original_name}: ${item.reason}`).join(" · ")
        : `${response.items.length}개 사진을 추가했습니다.`;
    }
  } catch (error) {
    state.contentDropMessages[messageKey] = errorMessage(error);
  } finally {
    renderContentList(collection);
    if (collection === "projects") renderProjectEditor();
    else renderSoftwareEditor();
    updateDirtyState();
  }
}

function queueContentPaths(paths, collection, clientKey) {
  state.boardDropCount += 1;
  state.boardDropBusy = true;
  if (collection === "projects") renderProjectEditor();
  else renderSoftwareEditor();
  updateToolbar();
  const operation = state.stagingOps
    .catch(() => {})
    .then(() => stageContentPaths(paths, collection, clientKey))
    .finally(() => {
      state.boardDropCount = Math.max(0, state.boardDropCount - 1);
      state.boardDropBusy = state.boardDropCount > 0;
      if (collection === "projects") renderProjectEditor();
      else renderSoftwareEditor();
      updateToolbar();
    });
  state.stagingOps = operation;
}

async function stageBoardPaths(paths, boardKey) {
  if (!paths?.length) return;
  state.boardDropMessage = "";
  renderBoardEditor();
  updateToolbar();
  try {
    const response = await state.bridge.StageBoardMedia(Array.from(paths));
    const found = boardItem(boardKey);
    const acceptedTokens = (response.items || []).map((item) => item.stage_token);
    if (!found.item) {
      queueDiscardBoardMedia(acceptedTokens);
      state.boardDropMessage = "선택한 게시글을 찾지 못해 사진을 추가하지 않았습니다.";
    } else {
      (response.items || []).forEach((media) => {
        found.item.media.push({
          ...media,
          _clientKey: `new-media:${state.nextBoardMediaKey++}`,
          _isNew: true,
          caption_en: "",
          caption_ko: "",
        });
      });
      const rejected = response.rejected || [];
      state.boardDropMessage = rejected.length
        ? rejected.map((item) => `${item.original_name}: ${item.reason}`).join(" · ")
        : `${response.items.length}개 사진을 추가했습니다.`;
    }
  } catch (error) {
    state.boardDropMessage = errorMessage(error);
  } finally {
    renderBoardList();
    renderBoardEditor();
    updateDirtyState();
  }
}

function queueBoardPaths(paths, boardKey) {
  state.boardDropCount += 1;
  state.boardDropBusy = true;
  renderBoardEditor();
  updateToolbar();
  const operation = state.stagingOps
    .catch(() => {})
    .then(() => stageBoardPaths(paths, boardKey))
    .finally(() => {
      state.boardDropCount = Math.max(0, state.boardDropCount - 1);
      state.boardDropBusy = state.boardDropCount > 0;
      renderBoardEditor();
      updateToolbar();
    });
  state.stagingOps = operation;
}

function installFileDrop() {
  if (state.fileDropBound || !window.runtime?.OnFileDrop) return;
  window.runtime.OnFileDrop((x, y, paths) => {
    const target = document.elementFromPoint(x, y)?.closest?.(
      "[data-board-media-dropzone], [data-content-media-dropzone]",
    );
    if (!target || state.saving || state.discarding || state.boardDropBusy) return;
    if (target.dataset.contentMediaDropzone !== undefined) {
      const { contentCollection, contentKey } = target.dataset;
      if (!contentItem(contentCollection, contentKey).item) return;
      queueContentPaths(paths, contentCollection, contentKey);
      return;
    }
    const found = boardItem(state.selectedBoardKey);
    if (!found.item) return;
    queueBoardPaths(paths, found.item._clientKey);
  }, true);
  state.fileDropBound = true;
}

document.addEventListener("input", (event) => {
  const input = event.target;
  if (
    !(
      input instanceof HTMLInputElement
      || input instanceof HTMLTextAreaElement
      || input instanceof HTMLSelectElement
    )
    || !state.draft
    || state.saving
    || state.discarding
  ) return;
  if (input.dataset.contentField) {
    const found = contentItem(input.dataset.contentCollection, input.dataset.contentKey);
    if (found.item) found.item[input.dataset.contentField] = input.value;
    if (input.dataset.contentCollection === "projects") {
      renderContentList("projects");
      if (input.dataset.contentField === "theme") renderTaxonomy("projectThemes");
    } else if (input.dataset.contentField === "name" || input.dataset.contentField === "stage") {
      renderContentList("software");
    }
  } else if (input.dataset.noteField) {
    const found = contentItem(input.dataset.contentCollection, input.dataset.contentKey);
    const row = found.item?.note_pairs?.find((candidate) => candidate._clientKey === input.dataset.contentRowKey);
    if (row) row[input.dataset.noteField] = input.value;
  } else if (input.dataset.linkField) {
    const found = contentItem("software", input.dataset.contentKey);
    const row = found.item?.links?.find((candidate) => candidate._clientKey === input.dataset.contentRowKey);
    if (row) row[input.dataset.linkField] = input.value;
  } else if (input.dataset.technologyField) {
    const found = contentItem("software", input.dataset.contentKey);
    const row = found.item?.technologies?.find((candidate) => candidate._clientKey === input.dataset.contentRowKey);
    if (row) row[input.dataset.technologyField] = input.value;
    renderContentList("software");
  } else if (input.dataset.contentMediaField) {
    const found = contentItem(input.dataset.contentCollection, input.dataset.contentKey);
    const media = found.item?.media?.find((candidate) => candidate._clientKey === input.dataset.contentMediaKey);
    if (media) media[input.dataset.contentMediaField] = input.value;
  } else if (input.dataset.boardField) {
    const found = boardItem(input.dataset.boardKey);
    if (found.item) found.item[input.dataset.boardField] = input.value;
    if (input.dataset.boardField.startsWith("title_") || input.dataset.boardField.endsWith("_date")) {
      renderBoardList();
    }
  } else if (input.dataset.boardMediaField) {
    const found = boardItem(input.dataset.boardKey);
    const media = found.item?.media?.find((candidate) => candidate._clientKey === input.dataset.mediaKey);
    if (media) media[input.dataset.boardMediaField] = input.value;
  } else if (input.dataset.kind) {
    const found = taxonomyItem(input.dataset.kind, input.dataset.clientKey);
    if (found.index >= 0) found.items[found.index][input.dataset.field] = input.value;
    if (input.dataset.kind === "projectThemes") renderContentList("projects");
  } else if (input.dataset.fallbackKind) {
    const config = taxonomyConfig[input.dataset.fallbackKind];
    state.draft[config.fallbackKey][input.dataset.field] = input.value;
  } else {
    return;
  }
  updateDirtyState();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled || !state.draft || state.saving || state.discarding || state.boardDropBusy) return;

  if (button.id === "add-board-button") {
    addBoardPost();
    return;
  }
  if (button.id === "add-project-button") {
    addContentItem("projects");
    return;
  }
  if (button.id === "add-software-button") {
    addContentItem("software");
    return;
  }

  const contentListRow = button.closest(".content-item-row[data-content-collection][data-content-key]");
  if (contentListRow) {
    const collection = contentListRow.dataset.contentCollection;
    const clientKey = contentListRow.dataset.contentKey;
    if (button.dataset.action === "content-select") {
      setSelectedContentKey(collection, clientKey);
      state.contentDropMessages[dropMessageKey(collection, clientKey)] = "";
      renderContentList(collection);
      if (collection === "projects") renderProjectEditor();
      else renderSoftwareEditor();
      validateDraft();
    } else if (button.dataset.action === "content-up") {
      moveContentItem(collection, clientKey, -1);
    } else if (button.dataset.action === "content-down") {
      moveContentItem(collection, clientKey, 1);
    } else if (button.dataset.action === "content-delete") {
      deleteContentItem(collection, clientKey);
    }
    return;
  }

  const contentForm = button.closest("#project-form[data-content-collection], #software-form[data-content-collection]");
  if (contentForm) {
    const collection = contentForm.dataset.contentCollection;
    const clientKey = contentForm.dataset.contentKey;
    const action = button.dataset.action || "";
    if (action === "content-note-add") addContentRow(collection, clientKey, "note");
    else if (action === "content-link-add") addContentRow(collection, clientKey, "link");
    else if (action === "content-technology-add") addContentRow(collection, clientKey, "technology");
    else {
      const mediaRow = button.closest("[data-content-media-key]");
      const repeatRow = button.closest("[data-content-row-key]");
      const rowKey = mediaRow?.dataset.contentMediaKey || repeatRow?.dataset.contentRowKey;
      const match = action.match(/^content-(note|link|technology|media)-(up|down|delete)$/);
      if (match && rowKey) {
        const [, kind, operation] = match;
        if (operation === "up") moveContentRow(collection, clientKey, kind, rowKey, -1);
        if (operation === "down") moveContentRow(collection, clientKey, kind, rowKey, 1);
        if (operation === "delete") deleteContentRow(collection, clientKey, kind, rowKey);
      }
    }
    return;
  }

  const boardRow = button.closest("[data-board-key]");
  if (boardRow && button.dataset.action === "board-select") {
    const selectedKey = boardRow.dataset.boardKey;
    state.selectedBoardKey = selectedKey;
    state.boardDropMessage = "";
    renderBoardList();
    renderBoardEditor();
    validateDraft();
    requestAnimationFrame(() => {
      document.querySelector(`[data-board-key="${selectedKey}"] [data-action="board-select"]`)?.focus();
    });
    return;
  }
  if (boardRow && button.dataset.action === "board-delete") {
    deleteBoardPost(boardRow.dataset.boardKey);
    return;
  }
  const mediaRow = button.closest("[data-media-key]");
  if (mediaRow && button.dataset.action === "board-media-delete") {
    deleteBoardMedia(state.selectedBoardKey, mediaRow.dataset.mediaKey);
    return;
  }

  if (button.dataset.addTaxonomy) {
    addTaxonomy(button.dataset.addTaxonomy);
    return;
  }

  const sectionRow = button.closest("[data-section]");
  if (sectionRow) {
    if (button.dataset.action === "section-up") moveSectionWithin(sectionRow.dataset.section, sectionRow.dataset.zone, -1);
    if (button.dataset.action === "section-down") moveSectionWithin(sectionRow.dataset.section, sectionRow.dataset.zone, 1);
    if (button.dataset.action === "section-toggle") toggleSection(sectionRow.dataset.section, sectionRow.dataset.zone);
    return;
  }

  const taxonomyRow = button.closest("[data-kind][data-client-key]");
  if (taxonomyRow) {
    const kind = taxonomyRow.dataset.kind;
    const clientKey = taxonomyRow.dataset.clientKey;
    if (button.dataset.action === "taxonomy-up") moveTaxonomy(kind, clientKey, -1);
    if (button.dataset.action === "taxonomy-down") moveTaxonomy(kind, clientKey, 1);
    if (button.dataset.action === "taxonomy-delete") deleteTaxonomy(kind, clientKey);
  }
});

document.addEventListener("dragstart", (event) => {
  const handle = event.target.closest(".drag-handle");
  if (!handle || state.saving) return;
  const sectionRow = handle.closest("[data-section]");
  if (sectionRow) {
    state.drag = { type: "section", section: sectionRow.dataset.section, zone: sectionRow.dataset.zone };
    sectionRow.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", sectionRow.dataset.section);
    return;
  }
  const taxonomyRow = handle.closest("[data-kind][data-client-key]");
  if (taxonomyRow) {
    state.drag = { type: "taxonomy", kind: taxonomyRow.dataset.kind, clientKey: taxonomyRow.dataset.clientKey };
    taxonomyRow.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taxonomyRow.dataset.clientKey);
  }
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".is-dragging").forEach((element) => element.classList.remove("is-dragging"));
  state.drag = null;
});

document.querySelectorAll("[data-section-zone]").forEach((zoneElement) => {
  zoneElement.addEventListener("dragover", (event) => {
    if (state.drag?.type !== "section") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  zoneElement.addEventListener("drop", (event) => {
    if (state.drag?.type !== "section") return;
    event.preventDefault();
    const row = event.target.closest("[data-section]");
    if (row?.dataset.section === state.drag.section) return;
    const beforeSection = row?.dataset.section || null;
    moveSectionByDrop(state.drag.section, state.drag.zone, zoneElement.dataset.sectionZone, beforeSection);
  });
});

document.querySelectorAll("[data-taxonomy-zone]").forEach((list) => {
  list.addEventListener("dragover", (event) => {
    if (state.drag?.type !== "taxonomy" || state.drag.kind !== list.dataset.taxonomyZone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  list.addEventListener("drop", (event) => {
    if (state.drag?.type !== "taxonomy" || state.drag.kind !== list.dataset.taxonomyZone) return;
    event.preventDefault();
    const row = event.target.closest("[data-kind][data-client-key]");
    if (row?.dataset.clientKey === state.drag.clientKey) return;
    const beforeClientKey = row?.dataset.clientKey || null;
    moveTaxonomyByDrop(state.drag.kind, state.drag.clientKey, beforeClientKey);
  });
});

async function loadEditorData() {
  state.loading = true;
  state.saving = false;
  loadError.hidden = true;
  updateToolbar();
  try {
    state.bridge ||= await waitForBridge();
    const response = await state.bridge.LoadEditorData();
    state.baseline = addClientKeys(response.settings);
    state.draft = clone(state.baseline);
    state.revision = response.settings_revision;
    state.usage = response.usage;
    state.boardBaseline = hydrateBoard(response.board);
    state.boardDraft = clone(state.boardBaseline);
    state.boardRevision = response.board_revision;
    state.selectedBoardKey = sortedBoardItems(state.boardDraft)[0]?._clientKey || "";
    state.projectsBaseline = hydrateProjects(response.projects);
    state.projectsDraft = clone(state.projectsBaseline);
    state.projectsRevision = response.projects_revision || "";
    state.selectedProjectKey = state.projectsDraft[0]?._clientKey || "";
    state.softwareBaseline = hydrateSoftware(response.software);
    state.softwareDraft = clone(state.softwareBaseline);
    state.softwareRevision = response.software_revision || "";
    state.selectedSoftwareKey = state.softwareDraft[0]?._clientKey || "";
    state.boardDropMessage = "";
    state.contentDropMessages = {};
    state.dirty = false;
    state.loading = false;
    installFileDrop();
    setStatus("불러옴", "");
    renderAll();
  } catch (error) {
    state.loading = false;
    state.draft = null;
    state.boardDraft = null;
    state.projectsDraft = null;
    state.softwareDraft = null;
    loadError.hidden = false;
    loadErrorMessage.textContent = errorMessage(error);
    setStatus("불러오기 실패", "error");
    updateToolbar();
  }
}

async function saveChanges() {
  if (
    !state.dirty
    || state.loading
    || state.saving
    || state.discarding
    || state.boardDropBusy
    || state.validationErrors.size
  ) return;
  state.saving = true;
  saveError.hidden = true;
  renderAll();
  updateToolbar();
  try {
    await state.stagingOps;
    await state.dirtySync;
    validateDraft();
    if (state.validationErrors.size) throw new Error("입력 내용을 확인해 주세요.");
    const settingsChanged = comparable(state.draft) !== comparable(state.baseline);
    const boardChanged = boardComparable(state.boardDraft) !== boardComparable(state.boardBaseline);
    const projectsChanged = projectsComparable(state.projectsDraft) !== projectsComparable(state.projectsBaseline);
    const softwareChanged = softwareComparable(state.softwareDraft) !== softwareComparable(state.softwareBaseline);
    const request = {
      settings: toSettingsPayload(state.draft),
      settings_revision: state.revision,
      save_settings: settingsChanged,
      board: toBoardSavePayload(state.boardDraft, state.boardBaseline),
      board_revision: state.boardRevision,
      save_board: boardChanged,
      projects: toProjectsSavePayload(state.projectsDraft, state.projectsBaseline),
      projects_revision: state.projectsRevision,
      save_projects: projectsChanged,
      software: toSoftwareSavePayload(state.softwareDraft, state.softwareBaseline),
      software_revision: state.softwareRevision,
      save_software: softwareChanged,
    };
    const response = await state.bridge.SaveEditorData(request);
    state.baseline = addClientKeys(response.settings);
    state.draft = clone(state.baseline);
    state.revision = response.settings_revision;
    state.usage = response.usage;
    state.boardBaseline = hydrateBoard(response.board);
    state.boardDraft = clone(state.boardBaseline);
    state.boardRevision = response.board_revision;
    state.selectedBoardKey = sortedBoardItems(state.boardDraft)[0]?._clientKey || "";
    state.projectsBaseline = hydrateProjects(response.projects);
    state.projectsDraft = clone(state.projectsBaseline);
    state.projectsRevision = response.projects_revision || "";
    state.selectedProjectKey = state.projectsDraft[0]?._clientKey || "";
    state.softwareBaseline = hydrateSoftware(response.software);
    state.softwareDraft = clone(state.softwareBaseline);
    state.softwareRevision = response.software_revision || "";
    state.selectedSoftwareKey = state.softwareDraft[0]?._clientKey || "";
    state.boardDropMessage = "";
    state.contentDropMessages = {};
    state.dirty = false;
    state.saving = false;
    setStatus("저장됨", "success");
    renderAll();
  } catch (error) {
    state.saving = false;
    const message = errorMessage(error);
    setStatus("저장 실패", "error");
    saveErrorMessage.textContent = message;
    saveError.hidden = false;
    renderAll();
    syncNativeDirty(true);
  }
}

async function discardChanges() {
  if (!state.dirty || state.saving || state.discarding || state.boardDropBusy) return;
  if (!window.confirm("저장하지 않은 변경을 모두 취소할까요?")) return;
  state.discarding = true;
  renderAll();
  updateToolbar();
  try {
    await state.stagingOps.catch(() => {});
    const stageTokens = [state.boardDraft, state.projectsDraft, state.softwareDraft]
      .flat()
      .flatMap((item) => item.media.map((media) => media.stage_token))
      .filter(Boolean);
    if (stageTokens.length) {
      await state.bridge.DiscardBoardMedia(stageTokens);
    }
    state.draft = clone(state.baseline);
    state.boardDraft = clone(state.boardBaseline);
    state.selectedBoardKey = sortedBoardItems(state.boardDraft)[0]?._clientKey || "";
    state.projectsDraft = clone(state.projectsBaseline);
    state.selectedProjectKey = state.projectsDraft[0]?._clientKey || "";
    state.softwareDraft = clone(state.softwareBaseline);
    state.selectedSoftwareKey = state.softwareDraft[0]?._clientKey || "";
    state.boardDropMessage = "";
    state.contentDropMessages = {};
    state.dirty = false;
    saveError.hidden = true;
    setStatus("변경 취소됨", "");
    syncNativeDirty(false);
  } catch (error) {
    const message = errorMessage(error);
    setStatus("변경 취소 실패", "error");
    saveErrorMessage.textContent = message;
    saveError.hidden = false;
  } finally {
    state.discarding = false;
    renderAll();
  }
}

saveButton.addEventListener("click", saveChanges);
discardButton.addEventListener("click", discardChanges);
retryButton.addEventListener("click", loadEditorData);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
    event.preventDefault();
    saveChanges();
  }
});

activateTab(tabs[0], false);
loadEditorData();
