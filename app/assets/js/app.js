
(function () {
  "use strict";

  const D = window.SiteData;
  const PAGE_VIEWS = new Set(["projects", "publications", "software", "notes"]);
  const PAGE_SEQUENCE = ["home", "projects", "publications", "software", "notes"];
  const SWIPE_MIN_DISTANCE = 64;
  const SWIPE_DIRECTION_RATIO = 1.35;
  const PROJECT_TIMELINE_YEAR_WIDTH = 140;
  const PROJECT_TIMELINE_LANE_HEIGHT = 30;
  const PROJECT_TIMELINE_COLORS = ["#315f49", "#3d6f86", "#80643b", "#775778", "#4f6e31", "#8a5148"];
  const PUBLICATION_TYPES = ["international-journal", "domestic-journal", "international-conference", "domestic-conference"];
  const ALL_TOPIC_FILTER = "__all_topics__";
  const FALLBACK_TOPIC_FILTER = "__fallback_topic__";
  const TECHNOLOGY_ICONS = Object.freeze({
    python: { label: "Python", icon: "app/assets/icons/technologies/python.svg" },
    go: { label: "Go", icon: "app/assets/icons/technologies/go.svg" },
    rust: { label: "Rust", icon: "app/assets/icons/technologies/rust.svg" },
    javascript: { label: "JavaScript", icon: "app/assets/icons/technologies/javascript.svg" },
    typescript: { label: "TypeScript", icon: "app/assets/icons/technologies/typescript.svg" },
    java: { label: "Java", icon: "app/assets/icons/technologies/java.svg" },
    c: { label: "C", icon: "app/assets/icons/technologies/c.svg" },
    "c++": { label: "C++", icon: "app/assets/icons/technologies/cplusplus.svg" },
    "c#": { label: "C#", icon: "app/assets/icons/technologies/csharp.svg" },
    r: { label: "R", icon: "app/assets/icons/technologies/r.svg" },
    matlab: { label: "MATLAB", icon: "app/assets/icons/technologies/matlab.svg" },
    html: { label: "HTML", icon: "app/assets/icons/technologies/html.svg" },
    css: { label: "CSS", icon: "app/assets/icons/technologies/css.svg" },
    react: { label: "React", icon: "app/assets/icons/technologies/react.svg" },
    vue: { label: "Vue", icon: "app/assets/icons/technologies/vue.svg" },
    svelte: { label: "Svelte", icon: "app/assets/icons/technologies/svelte.svg" },
    wails: { label: "Wails", icon: "app/assets/icons/technologies/wails.svg", className: "tech-icon-wails" },
    egui: { label: "egui", icon: "app/assets/icons/technologies/egui.png", className: "tech-icon-egui" },
    energyplus: { label: "EnergyPlus", icon: "app/assets/icons/technologies/energyplus.ico" },
    excel: { label: "Excel", icon: "app/assets/icons/technologies/excel.svg", className: "tech-icon-excel" },
    latex: { label: "LaTeX", icon: "app/assets/icons/technologies/latex.svg" }
  });
  const TECHNOLOGY_ALIASES = Object.freeze({
    js: "javascript",
    ts: "typescript",
    golang: "go",
    energyplus: "energyplus",
    eplus: "energyplus",
    tex: "latex",
    "microsoft excel": "excel"
  });
  const state = {
    lang: "en",
    data: null,
    publication: {
      query: "",
      publicationType: "all",
      topic: ALL_TOPIC_FILTER,
      collaboratorId: "",
      firstAuthorOnly: false,
      sort: "newest",
      expanded: new Set()
    },
    pageTransitionDirection: 0,
    lightbox: {
      collection: "notes",
      itemIndex: 0,
      index: 0
    }
  };

  const I18N = {
    en: {
      skip: "Skip to content",
      pageTitle: "Research & Software",
      brandRole: "Research · simulation · software",
      navProjects: "Projects",
      navSoftware: "Software",
      navPublications: "Publications",
      navNotes: "Notes & photos",
      statPublications: "Publications",
      statProjects: "Research projects",
      statSoftware: "Software projects",
      projectTimeline: "Project timeline",
      searchLabel: "Search",
      searchPlaceholder: "Search: title, author, journal, conference…",
      typeLabel: "Publication type",
      allTypes: "All types",
      topicLabel: "Publication topic",
      allTopics: "All topics",
      resetFilters: "Reset filters",
      collaborators: "Collaborators",
      sortNewest: "Newest first",
      sortType: "By type",
      sortTopic: "By topic",
      publicationCount: "papers",
      firstAuthorOnly: "First author",
      results: "results",
      noPublications: "No publications match the current filters.",
      experienceTitle: "Experience",
      educationTitle: "Education",
      scholarshipsTitle: "Scholarships",
      certificationsTitle: "Certifications",
      awardsTitle: "Awards",
      teachingTitle: "Teaching",
      skillsTitle: "Technical Skills",
      award: "Awarded",
      source: "Source",
      copy: "Copy",
      bib: "Bib",
      repository: "Repository ↗",
      technologies: "Technologies",
      copied: "Citation copied.",
      copyFailed: "Could not copy automatically.",
      loadError: "The page could not be loaded. Please refresh and try again.",
      mediaGallery: "Media gallery",
      previousMedia: "Previous media",
      nextMedia: "Next media",
      expandMedia: "Open full-screen media",
      closeMedia: "Close media viewer",
      email: "Email",
      address: "Address"
    },
    ko: {
      skip: "본문으로 건너뛰기",
      pageTitle: "연구와 소프트웨어",
      brandRole: "연구 · 시뮬레이션 · 소프트웨어",
      navProjects: "프로젝트",
      navSoftware: "소프트웨어",
      navPublications: "논문",
      navNotes: "기록·사진",
      statPublications: "논문",
      statProjects: "참여 연구",
      statSoftware: "개발 프로젝트",
      projectTimeline: "프로젝트 기간",
      searchLabel: "검색",
      searchPlaceholder: "검색: 제목, 저자, 학술지, 학술대회…",
      typeLabel: "유형",
      allTypes: "전체 유형",
      topicLabel: "논문 주제",
      allTopics: "전체 주제",
      resetFilters: "필터 초기화",
      collaborators: "공저자",
      sortNewest: "최신순",
      sortType: "유형별",
      sortTopic: "주제별",
      publicationCount: "건",
      firstAuthorOnly: "주저자",
      results: "건",
      noPublications: "현재 필터와 일치하는 논문이 없습니다.",
      experienceTitle: "경력",
      educationTitle: "학력",
      scholarshipsTitle: "장학",
      certificationsTitle: "자격사항",
      awardsTitle: "수상",
      teachingTitle: "교육",
      skillsTitle: "기술 역량",
      award: "수상",
      source: "원문",
      copy: "인용 복사",
      bib: "Bib",
      repository: "저장소 ↗",
      technologies: "기술",
      copied: "인용정보를 복사했습니다.",
      copyFailed: "자동 복사에 실패했습니다.",
      loadError: "페이지를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
      mediaGallery: "미디어 모음",
      previousMedia: "이전 미디어",
      nextMedia: "다음 미디어",
      expandMedia: "미디어 크게 보기",
      closeMedia: "미디어 보기 닫기",
      email: "이메일",
      address: "주소"
    }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const t = (key) => I18N[state.lang]?.[key] || I18N.en[key] || key;
  const p = (record, key) => D.pick(record, key, state.lang);

  function initialLanguage() {
    const query = new URLSearchParams(window.location.search).get("lang");
    if (query === "en" || query === "ko") return query;
    const saved = window.localStorage.getItem("siteLanguage");
    if (saved === "en" || saved === "ko") return saved;
    return navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
  }

  function setLanguage(language, options = {}) {
    state.lang = language === "ko" ? "ko" : "en";
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.lang = state.lang;
    window.localStorage.setItem("siteLanguage", state.lang);

    if (!options.skipURL) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", state.lang);
      window.history.replaceState({}, "", url);
    }

    $$("[data-lang-switch]").forEach((button) => {
      const active = button.dataset.langSwitch === state.lang;
      button.setAttribute("aria-pressed", String(active));
    });

    $$("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    $$("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    });

    $$("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });

    $$("[data-i18n-title]").forEach((element) => {
      element.setAttribute("title", t(element.dataset.i18nTitle));
    });

    if (state.data) {
      const identity = state.data.profile.identity;
      const name = identity[`name_${state.lang}`] || identity.name_en;
      document.title = `${name} · ${t("pageTitle")}`;
      renderAll();
    }
  }

  function updateProfileBindings() {
    const profile = state.data.profile;
    const identity = profile.identity;
    const intro = profile.intro;
    const profileCard = profile.profile_card || {};
    const values = {
      name: identity[`name_${state.lang}`] || identity.name_en,
      role: identity[`role_${state.lang}`] || identity.role_en,
      affiliation: identity[`affiliation_${state.lang}`] || identity.affiliation_en,
      "intro-short": intro[`short_${state.lang}`] || intro.short_en
    };

    $$("[data-profile]").forEach((element) => {
      element.textContent = values[element.dataset.profile] || "";
    });
    const profileMedia = profileCard.media;
    const profileMediaType = D.contentMediaType(profileMedia);
    const profileMediaSource = D.contentMediaPath(profileMedia);
    const profilePhoto = $("#profile-photo");
    const profileVideo = $("#profile-video");
    if (profileMediaType === "video") {
      profilePhoto.hidden = true;
      profilePhoto.removeAttribute("src");
      profileVideo.hidden = false;
      profileVideo.src = profileMediaSource;
      const poster = typeof profileMedia === "object" ? D.contentMediaPath(profileMedia.poster) : "";
      if (poster) profileVideo.poster = poster;
      else profileVideo.removeAttribute("poster");
    } else {
      profileVideo.pause();
      profileVideo.hidden = true;
      profileVideo.removeAttribute("src");
      profileVideo.removeAttribute("poster");
      profilePhoto.hidden = false;
      profilePhoto.src = profileMediaSource;
    }
    $("#profile-card-title").textContent = profileCard[`title_${state.lang}`] || profileCard.title_en || "";
    $("#profile-card-credentials").innerHTML = (profileCard.credentials || []).map((item) => `
      <li>${D.escapeHTML(item[`name_${state.lang}`] || item.name_en || "")}</li>
    `).join("");
  }

  function renderProfileStats() {
    const stats = [
      [state.data.publications.length, t("statPublications")],
      [state.data.projects.length, t("statProjects")],
      [state.data.software.length, t("statSoftware")]
    ];
    $("#profile-stats").innerHTML = stats.map(([value, label]) => `
      <div>
        <dt>${D.escapeHTML(label)}</dt>
        <dd>${D.escapeHTML(value)}</dd>
      </div>
    `).join("");
  }

  function renderProjects() {
    const items = state.data.projects;

    renderProjectTimeline(items);

    $("#projects-grid").innerHTML = items.map((item, itemIndex) => {
      const mediaItems = itemMedia(item);
      return `
        <article class="project-card" data-project-card-index="${itemIndex}" tabindex="-1">
          <div class="project-card-meta">
            <div class="project-topline">${D.escapeHTML(D.projectPeriod(item))}, ${D.escapeHTML(p(item, "funder"))}</div>
            <div class="project-theme">${D.escapeHTML(D.projectThemeLabel(item, state.data.settings, state.lang))}</div>
          </div>
          <h3>${D.escapeHTML(p(item, "title"))}</h3>
          <p class="card-summary">${D.escapeHTML(p(item, "summary"))}</p>
          ${mediaItems.length ? renderMediaGallery(item, mediaItems, "projects", "project-gallery", itemIndex) : ""}
        </article>
      `;
    }).join("");
  }

  function projectDateValue(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return NaN;
    return Date.parse(`${value}T00:00:00Z`);
  }

  function projectTimelineGroups(records) {
    const configuredThemes = state.data.settings.project_themes || [];
    const configuredIds = new Set(configuredThemes.map((theme) => theme.id));
    const groups = configuredThemes.map((theme) => ({
      id: theme.id,
      label: D.pick(theme, "label", state.lang),
      items: records.filter((record) => record.item.theme === theme.id)
    })).filter((group) => group.items.length);
    const fallbackItems = records.filter((record) => !configuredIds.has(record.item.theme));
    if (fallbackItems.length) {
      groups.push({
        id: "__fallback__",
        label: D.pick(state.data.settings.project_theme_fallback, "label", state.lang),
        items: fallbackItems
      });
    }
    return groups;
  }

  function assignProjectTimelineLanes(records) {
    const locale = state.lang === "ko" ? "ko-KR" : "en";
    const sorted = [...records].sort((a, b) => a.start - b.start
      || p(a.item, "funder").localeCompare(p(b.item, "funder"), locale, { sensitivity: "base" })
      || a.index - b.index);
    const lanes = [];
    sorted.forEach((record) => {
      const funder = p(record.item, "funder");
      const available = lanes
        .map((lane, index) => ({ lane, index }))
        .filter(({ lane }) => lane.end < record.start)
        .sort((a, b) => Number(b.lane.funder === funder) - Number(a.lane.funder === funder)
          || a.index - b.index);
      const laneIndex = available.length ? available[0].index : lanes.length;
      lanes[laneIndex] = { end: record.end, funder };
      record.lane = laneIndex;
    });
    return { records: sorted, count: Math.max(1, lanes.length) };
  }

  function projectTimelineThemeWidth(groups) {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return 190;
    context.font = `800 11px ${window.getComputedStyle(document.body).fontFamily}`;
    const textWidth = Math.max(...groups.map((group) => context.measureText(group.label).width), 0);
    return Math.ceil(textWidth + 48);
  }

  function renderProjectTimeline(items) {
    const records = items.map((item, index) => ({
      item,
      index,
      start: projectDateValue(item.start_date),
      end: projectDateValue(item.end_date)
    })).filter((record) => Number.isFinite(record.start) && Number.isFinite(record.end));
    const root = $("#projects-timeline");
    if (!records.length) {
      root.innerHTML = "";
      root.hidden = true;
      return;
    }

    root.hidden = false;
    const firstYear = Math.min(...records.map((record) => new Date(record.start).getUTCFullYear()));
    const lastYear = Math.max(...records.map((record) => new Date(record.end).getUTCFullYear()));
    const axisStart = Date.UTC(firstYear, 0, 1);
    const axisEnd = Date.UTC(lastYear + 1, 0, 1);
    const axisSpan = axisEnd - axisStart;
    const yearCount = lastYear - firstYear + 1;
    const timelineWidth = yearCount * PROJECT_TIMELINE_YEAR_WIDTH;
    const position = (time) => ((time - axisStart) / axisSpan) * timelineWidth;
    const yearTicks = Array.from({ length: yearCount }, (_, offset) => {
      const year = firstYear + offset;
      return `<span class="project-roadmap-year" style="left:${position(Date.UTC(year, 0, 1)).toFixed(3)}px">${year}</span>`;
    }).join("");

    const groups = projectTimelineGroups(records);
    const themeLabelWidth = projectTimelineThemeWidth(groups);
    const rows = groups.map((group, groupIndex) => {
      const layout = assignProjectTimelineLanes(group.items);
      const trackHeight = layout.count * PROJECT_TIMELINE_LANE_HEIGHT + 8;
      const color = PROJECT_TIMELINE_COLORS[groupIndex % PROJECT_TIMELINE_COLORS.length];
      const bars = layout.records.map((record) => {
        const start = Math.min(record.start, record.end);
        const inclusiveEnd = Math.max(record.start, record.end) + 86400000;
        const left = position(start);
        const width = Math.max(5, position(inclusiveEnd) - left);
        const funder = p(record.item, "funder");
        const title = p(record.item, "title");
        const period = D.projectPeriod(record.item);
        const accessibleLabel = `${funder} · ${title} · ${period}`;
        return `
          <button type="button" class="project-roadmap-bar" data-project-timeline-target="${record.index}"
            style="left:${left.toFixed(3)}px;top:${record.lane * PROJECT_TIMELINE_LANE_HEIGHT + 4}px;width:${width.toFixed(3)}px"
            aria-label="${D.escapeHTML(accessibleLabel)}" title="${D.escapeHTML(accessibleLabel)}">
            <span class="project-roadmap-bar-funder">${D.escapeHTML(funder)}</span>
          </button>
        `;
      }).join("");
      return `
        <div class="project-roadmap-theme" style="--project-theme-color:${color}">
          <div class="project-roadmap-theme-label"><span></span>${D.escapeHTML(group.label)}</div>
          <div class="project-roadmap-track" style="height:${trackHeight}px">${bars}</div>
        </div>
      `;
    }).join("");

    root.innerHTML = `
      <div class="project-roadmap-scroll" data-project-timeline-scroll tabindex="0" aria-label="${D.escapeHTML(t("projectTimeline"))}">
        <div class="project-roadmap-canvas" style="--project-timeline-width:${timelineWidth}px;--project-theme-label-natural-width:${themeLabelWidth}px">
          <div class="project-roadmap-header">
            <div class="project-roadmap-corner" aria-hidden="true"></div>
            <div class="project-roadmap-axis">${yearTicks}</div>
          </div>
          ${rows}
        </div>
      </div>
    `;
    window.requestAnimationFrame(() => {
      const scroller = $("[data-project-timeline-scroll]", root);
      if (scroller) scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    });
  }

  function scrollToProjectCard(index) {
    const card = $(`[data-project-card-index="${index}"]`);
    if (!card) return;
    $$("[data-project-card-index]").forEach((item) => item.classList.remove("is-timeline-target"));
    card.classList.add("is-timeline-target");
    card.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    card.focus({ preventScroll: true });
    window.clearTimeout(scrollToProjectCard.timer);
    scrollToProjectCard.timer = window.setTimeout(() => {
      card.classList.remove("is-timeline-target");
    }, 1800);
  }

  function renderSoftware() {
    const items = state.data.software;

    $("#software-grid").innerHTML = items.map((item, itemIndex) => {
      const mediaItems = itemMedia(item);
      const links = D.softwareLinks(item, state.lang);
      return `
        <article class="software-card">
          <h3>${D.escapeHTML(item.name)}</h3>
          <div class="software-stack" aria-label="${t("technologies")}">${softwareTechnologiesHTML(item.technologies)}</div>
          <p class="card-summary">${D.escapeHTML(p(item, "summary"))}</p>
          ${mediaItems.length ? renderMediaGallery(item, mediaItems, "software", "software-gallery", itemIndex) : ""}
          ${links.length ? `<div class="software-actions">${softwareLinksHTML(links)}</div>` : ""}
        </article>
      `;
    }).join("");
  }

  function softwareTechnologiesHTML(value) {
    return D.splitList(value).map((name) => {
      const normalized = name.trim().toLowerCase();
      const key = TECHNOLOGY_ALIASES[normalized] || normalized;
      const preset = TECHNOLOGY_ICONS[key];
      const fallbackLabel = name.trim();
      const label = D.escapeHTML(preset?.label || fallbackLabel);
      const className = preset?.className ? ` ${preset.className}` : "";
      const content = preset
        ? `<span class="software-tech-image"><img src="${D.escapeHTML(preset.icon)}" alt="" aria-hidden="true"></span>`
        : `<span aria-hidden="true">${D.escapeHTML(fallbackLabel.slice(0, 2))}</span>`;
      return `
        <span class="software-tech-icon${className}${preset ? "" : " software-tech-fallback"}" role="img" tabindex="0" aria-label="${label}" data-tech-label="${label}" data-tech-key="${D.escapeHTML(key)}">
          ${content}
        </span>
      `;
    }).join("");
  }

  function softwareLinksHTML(links) {
    return links.map((link) => `
      <a class="software-link" data-link-platform="${D.escapeHTML(link.platform)}"
        href="${D.escapeHTML(link.url)}" target="_blank" rel="noreferrer"
        aria-label="${D.escapeHTML(`${link.label}: ${link.url}`)}"
        data-link-url="${D.escapeHTML(link.url)}">
        ${softwareLinkIconHTML(link.icon)}
        <span>${D.escapeHTML(link.label)}</span>
      </a>
    `).join("");
  }

  function softwareLinkIconHTML(icon) {
    if (icon === "github") {
      return `<svg class="software-link-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.49-2.7-1.08-2.7-1.08-.37-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82A7.65 7.65 0 0 1 8 3.73c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.5l-.01 2.31c0 .21.14.46.55.38A8 8 0 0 0 8 0Z"/></svg>`;
    }
    if (icon === "repository") {
      return `<svg class="software-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v12m0-12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 2V9m0 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 5h4a6 6 0 0 1 6 6"/></svg>`;
    }
    if (icon === "package") {
      return `<svg class="software-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/></svg>`;
    }
    if (icon === "container") {
      return `<svg class="software-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v10H4zM8 8V5h4v3m0 0V5h4v3M7 14h10"/></svg>`;
    }
    if (icon === "archive") {
      return `<svg class="software-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v14H4zM3 3h18v4H3zm7 8h4"/></svg>`;
    }
    return `<svg class="software-link-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`;
  }

  function renderPublicationControls() {
    const types = ["international-journal", "domestic-journal", "international-conference", "domestic-conference"];
    $("#pub-type").innerHTML = [
      `<option value="all">${t("allTypes")}</option>`,
      ...types.map((type) => `<option value="${type}">${D.escapeHTML(D.publicationTypeLabel({ publication_type: type }, state.lang))}</option>`)
    ].join("");
    $("#pub-type").value = state.publication.publicationType;

    $("#pub-topic").innerHTML = [
      `<option value="${ALL_TOPIC_FILTER}">${t("allTopics")}</option>`,
      ...publicationTopics().map((topic) => (
        `<option value="${D.escapeHTML(topic.id)}">${D.escapeHTML(D.publicationTopicLabel({ topic: topic.id }, state.data.settings, state.lang))}</option>`
      )),
      `<option value="${FALLBACK_TOPIC_FILTER}">${D.escapeHTML(D.publicationTopicLabel({ topic: FALLBACK_TOPIC_FILTER }, state.data.settings, state.lang))}</option>`
    ].join("");
    $("#pub-topic").value = state.publication.topic;

    $$("[data-pub-sort]").forEach((button) => {
      const isActive = button.dataset.pubSort === state.publication.sort;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    $("#pub-first-author").checked = state.publication.firstAuthorOnly;
    $("#pub-search").value = state.publication.query;
  }

  function publicationTopics() {
    return state.data.settings.publication_topics;
  }

  function renderPublicationCollaborators() {
    const counts = new Map();
    state.data.publications.forEach((publication) => {
      const collaborators = new Set(
        publication.authors.filter((person) => !person.is_self).map((person) => person.id)
      );
      collaborators.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });

    const locale = state.lang === "ko" ? "ko-KR" : "en";
    const collaborators = state.data.people
      .filter((person) => !person.is_self && counts.has(person.id))
      .sort((a, b) => D.personName(a, state.lang).localeCompare(
        D.personName(b, state.lang),
        locale,
        { sensitivity: "base" }
      ));

    $("#publication-collaborators").innerHTML = `
      <span class="publication-collaborators-label">Thanks to…</span>
      <div class="publication-collaborator-list">
        ${collaborators.map((person) => {
          const isActive = state.publication.collaboratorId === person.id;
          return `
            <button type="button" class="publication-collaborator${isActive ? " is-active" : ""}"
              data-collaborator-id="${D.escapeHTML(person.id)}" aria-pressed="${isActive}">
              ${D.escapeHTML(D.personName(person, state.lang))} <span class="publication-collaborator-count">(${counts.get(person.id)})</span>
              ${D.personNotesHTML(person, state.lang)}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function comparePublicationRecency(a, b) {
    return D.publicationStatusRank(b) - D.publicationStatusRank(a)
      || String(b.date || "").localeCompare(String(a.date || ""))
      || D.publicationTitle(a, state.lang).localeCompare(D.publicationTitle(b, state.lang));
  }

  function filteredPublications() {
    const query = D.normalizeText(state.publication.query);
    const topicOrder = new Map(publicationTopics().map((topic, index) => [topic.id, index]));
    const configuredTopicIds = new Set(topicOrder.keys());
    const fallbackTopicOrder = publicationTopics().length;
    return state.data.publications
      .filter((item) => state.publication.publicationType === "all"
        || item.publication_type === state.publication.publicationType)
      .filter((item) => {
        if (state.publication.topic === ALL_TOPIC_FILTER) return true;
        if (state.publication.topic === FALLBACK_TOPIC_FILTER) return !configuredTopicIds.has(item.topic);
        return item.topic === state.publication.topic;
      })
      .filter((item) => !state.publication.collaboratorId
        || item.authors.some((person) => person.id === state.publication.collaboratorId))
      .filter((item) => !state.publication.firstAuthorOnly || D.isFirstAuthor(item))
      .filter((item) => {
        if (!query) return true;
        return D.normalizeText([
          item.title_en,
          item.title_ko,
          item.abstract_en,
          item.abstract_ko,
          item.keywords_en,
          item.keywords_ko,
          item.authors.flatMap((person) => [person.name_en, person.name_ko]).join(" "),
          item.venue,
          item.date
        ].join(" ")).includes(query);
      })
      .sort((a, b) => {
        if (state.publication.sort === "type") {
          return PUBLICATION_TYPES.indexOf(a.publication_type) - PUBLICATION_TYPES.indexOf(b.publication_type)
            || comparePublicationRecency(a, b);
        }
        if (state.publication.sort === "topic") {
          return (topicOrder.get(a.topic) ?? fallbackTopicOrder) - (topicOrder.get(b.topic) ?? fallbackTopicOrder)
            || comparePublicationRecency(a, b);
        }
        return comparePublicationRecency(a, b);
      });
  }

  function publicationItemHTML(item) {
    const sourceURL = item.doi ? `https://doi.org/${item.doi}` : item.url;
    const title = D.publicationTitle(item, state.lang);
    const publicationStatus = D.publicationStatus(item);
    const abstract = p(item, "abstract");
    const keywords = D.splitList(p(item, "keywords"));
    const hasDetails = Boolean(abstract || keywords.length);
    const itemIndex = item.publicationIndex;
    const isExpanded = hasDetails && state.publication.expanded.has(itemIndex);
    const detailsId = `publication-details-${itemIndex}`;
    const awardLabel = item.award_id?.trim()
      ? `<div class="publication-labels"><span class="badge badge-award">${t("award")}</span></div>`
      : "";
    const summaryAttributes = hasDetails
      ? `class="publication-summary" type="button" data-publication-toggle="${itemIndex}" aria-expanded="${isExpanded}" aria-controls="${D.escapeHTML(detailsId)}"`
      : `class="publication-summary publication-summary-static"`;

    return `
      <article class="publication-item${isExpanded ? " is-expanded" : ""}" data-publication-index="${itemIndex}">
        <${hasDetails ? "button" : "div"} ${summaryAttributes}>
          <div class="publication-main">
            <div class="publication-type"><span class="badge">${D.escapeHTML(D.publicationTypeLabel(item, state.lang))}</span></div>
            <h3>${D.escapeHTML(title)}</h3>
            <p class="publication-authors">${D.displayAuthors(item.authors, state.lang)}</p>
            <p class="publication-venue">${publicationStatus
              ? `<em>(${D.escapeHTML(publicationStatus)})</em>`
              : D.escapeHTML(item.venue)}</p>
            ${item.note?.trim() ? `<p class="publication-note">${D.escapeHTML(item.note.trim())}</p>` : ""}
            ${awardLabel}
          </div>
        </${hasDetails ? "button" : "div"}>
        <div class="publication-buttons">
          ${sourceURL ? `<a class="publication-action" href="${D.escapeHTML(sourceURL)}" target="_blank" rel="noreferrer">${t("source")}</a>` : ""}
          <button type="button" class="publication-action" data-copy-citation="${itemIndex}">${t("copy")}</button>
          <button type="button" class="publication-action" data-export-one="${itemIndex}">${t("bib")}</button>
        </div>
        ${hasDetails ? `
          <div class="publication-details" id="${D.escapeHTML(detailsId)}" aria-hidden="${!isExpanded}">
            <div class="publication-details-inner">
              ${abstract ? `
                <section class="publication-abstract">
                  <h4>${state.lang === "ko" ? "초록" : "Abstract"}</h4>
                  <p>${D.escapeHTML(abstract)}</p>
                </section>
              ` : ""}
              ${keywords.length ? `
                <section class="publication-keywords">
                  <h4>${state.lang === "ko" ? "주제어" : "Keywords"}</h4>
                  <ul>${keywords.map((keyword) => `<li>${D.escapeHTML(keyword)}</li>`).join("")}</ul>
                </section>
              ` : ""}
            </div>
          </div>
        ` : ""}
      </article>
    `;
  }

  function publicationYearGroupsHTML(items) {
    const groups = [];
    items.forEach((item) => {
      const year = D.publicationYear(item);
      const current = groups.at(-1);
      if (!current || current.year !== year) {
        groups.push({ year, items: [item] });
      } else {
        current.items.push(item);
      }
    });

    return groups.map((group) => `
      <section class="publication-year-group" aria-label="${D.escapeHTML(group.year)}">
        <div class="publication-year">${D.escapeHTML(group.year)}</div>
        <div class="publication-year-items">
          ${group.items.map(publicationItemHTML).join("")}
        </div>
      </section>
    `).join("");
  }

  function renderPublications() {
    renderPublicationControls();
    renderPublicationCollaborators();
    const items = filteredPublications();
    $("#pub-result-count").textContent = String(items.length);
    $("#publications-empty").hidden = items.length > 0;
    $("#publication-list").className = "publication-list";

    if (!items.length) {
      $("#publication-list").innerHTML = "";
      return;
    }

    if (state.publication.sort === "type") {
      $("#publication-list").innerHTML = PUBLICATION_TYPES.map((type) => {
        const typeItems = items.filter((item) => item.publication_type === type);
        if (!typeItems.length) return "";
        return `
          <section class="publication-type-group">
            <div class="publication-type-heading" role="heading" aria-level="3">
              <span>${D.escapeHTML(D.publicationTypeLabel({ publication_type: type }, state.lang))}</span>
              <span class="publication-type-count">${typeItems.length}${state.lang === "ko" ? "" : " "}${t("publicationCount")}</span>
            </div>
            ${publicationYearGroupsHTML(typeItems)}
          </section>
        `;
      }).join("");
      return;
    }

    if (state.publication.sort === "topic") {
      const configuredTopicIds = new Set(publicationTopics().map((topic) => topic.id));
      const groups = [
        ...publicationTopics().map((topic) => ({
          id: topic.id,
          items: items.filter((item) => item.topic === topic.id)
        })),
        {
          id: "",
          items: items.filter((item) => !configuredTopicIds.has(item.topic))
        }
      ];

      $("#publication-list").innerHTML = groups.map((group) => {
        if (!group.items.length) return "";
        return `
          <section class="publication-type-group">
            <div class="publication-type-heading" role="heading" aria-level="3">
              <span>${D.escapeHTML(D.publicationTopicLabel({ topic: group.id }, state.data.settings, state.lang))}</span>
              <span class="publication-type-count">${group.items.length}${state.lang === "ko" ? "" : " "}${t("publicationCount")}</span>
            </div>
            ${publicationYearGroupsHTML(group.items)}
          </section>
        `;
      }).join("");
      return;
    }

    $("#publication-list").innerHTML = publicationYearGroupsHTML(items);
  }

  function itemMedia(item) {
    if (Array.isArray(item.media)) {
      return item.media.map((mediaItem) => ({
        src: D.contentMediaPath(mediaItem),
        type: D.contentMediaType(mediaItem),
        poster: mediaItem.poster ? D.contentMediaPath(mediaItem.poster) : "",
        caption: mediaItem[`caption_${state.lang}`] || mediaItem.caption_en || mediaItem.caption_ko || p(item, "title") || item.name || ""
      })).filter((mediaItem) => mediaItem.src);
    }
    return [];
  }

  function noteContent(item) {
    const localized = item[`content_${state.lang}`] || item.content_en || item.content_ko || [];
    return Array.isArray(localized) ? localized : [localized];
  }

  function renderMediaGallery(item, mediaItems, collection, modifier = "", itemIndex = 0) {
    const isMultiple = mediaItems.length > 1;
    const galleryTitle = p(item, "title") || item.name || "";
    const slides = mediaItems.map((mediaItem, index) => {
      const mediaElement = mediaItem.type === "video"
        ? `<video src="${D.escapeHTML(mediaItem.src)}"${mediaItem.poster ? ` poster="${D.escapeHTML(mediaItem.poster)}"` : ""} preload="metadata" muted playsinline aria-hidden="true"></video><span class="media-play-indicator" aria-hidden="true">▶</span>`
        : `<img src="${D.escapeHTML(mediaItem.src)}" alt="${D.escapeHTML(mediaItem.caption)}" width="1200" height="760" loading="lazy">`;
      return `
      <figure class="note-gallery-slide" data-gallery-slide aria-hidden="${index === 0 ? "false" : "true"}">
        <button type="button" class="note-media-button" data-open-lightbox data-lightbox-collection="${D.escapeHTML(collection)}" data-lightbox-item-index="${itemIndex}" data-media-index="${index}" aria-label="${D.escapeHTML(`${t("expandMedia")} ${index + 1}`)}" tabindex="${index === 0 ? "0" : "-1"}">
          ${mediaElement}
        </button>
        <figcaption>${D.escapeHTML(mediaItem.caption)}</figcaption>
      </figure>
    `;
    }).join("");

    return `
      <div class="note-gallery${modifier ? ` ${modifier}` : ""}" data-media-gallery data-gallery-index="0">
        <div class="note-gallery-viewport" data-gallery-viewport ${isMultiple ? 'tabindex="0"' : ""} aria-label="${D.escapeHTML(`${galleryTitle} · ${t("mediaGallery")}`)}">
          <div class="note-gallery-track">${slides}</div>
        </div>
        ${isMultiple ? `
          <button type="button" class="note-gallery-arrow note-gallery-prev" data-gallery-step="-1" aria-label="${D.escapeHTML(t("previousMedia"))}" disabled>←</button>
          <button type="button" class="note-gallery-arrow note-gallery-next" data-gallery-step="1" aria-label="${D.escapeHTML(t("nextMedia"))}">→</button>
          <div class="note-gallery-footer">
            <div class="note-gallery-dots" aria-hidden="true">
              ${mediaItems.map((_, index) => `<span class="note-gallery-dot${index === 0 ? " is-active" : ""}" data-gallery-dot="${index}"></span>`).join("")}
            </div>
            <span class="note-gallery-count" data-gallery-count>1 / ${mediaItems.length}</span>
          </div>
        ` : ""}
      </div>
    `;
  }

  function updateGalleryControls(gallery, index) {
    const slides = $$('[data-gallery-slide]', gallery);
    if (!slides.length) return;
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    gallery.dataset.galleryIndex = String(nextIndex);
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== nextIndex));
      const mediaButton = $("[data-open-lightbox]", slide);
      if (mediaButton) mediaButton.tabIndex = slideIndex === nextIndex ? 0 : -1;
    });
    $$('[data-gallery-dot]', gallery).forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === nextIndex);
    });
    const previous = $('[data-gallery-step="-1"]', gallery);
    const next = $('[data-gallery-step="1"]', gallery);
    if (previous) previous.disabled = nextIndex === 0;
    if (next) next.disabled = nextIndex === slides.length - 1;
    const count = $("[data-gallery-count]", gallery);
    if (count) count.textContent = `${nextIndex + 1} / ${slides.length}`;
  }

  function setGalleryIndex(gallery, index, options = {}) {
    const viewport = $("[data-gallery-viewport]", gallery);
    const slides = $$('[data-gallery-slide]', gallery);
    if (!viewport || !slides.length) return;
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    updateGalleryControls(gallery, nextIndex);
    viewport.scrollTo({
      left: nextIndex * viewport.clientWidth,
      behavior: options.instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }

  function bindMediaGalleryScroll() {
    $$('[data-gallery-viewport]').forEach((viewport) => {
      let frame = 0;
      viewport.addEventListener("scroll", () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const gallery = viewport.closest("[data-media-gallery]");
          if (!gallery || !viewport.clientWidth) return;
          updateGalleryControls(gallery, Math.round(viewport.scrollLeft / viewport.clientWidth));
        });
      }, { passive: true });
    });
  }

  function renderNotes() {
    const items = state.data.notes
      .sort((a, b) => b.date.localeCompare(a.date));

    $("#notes-grid").innerHTML = items.map((item, itemIndex) => {
      const mediaItems = itemMedia(item);
      return `
        <article class="note-entry">
          <header class="note-header">
            <div class="note-meta">
              <time datetime="${D.escapeHTML(item.date)}">${D.escapeHTML(item.date)}</time>
            </div>
            <h2>${D.escapeHTML(p(item, "title"))}</h2>
          </header>
          <div class="note-content">
            ${noteContent(item).filter(Boolean).map((paragraph) => `<p>${D.escapeHTML(paragraph)}</p>`).join("")}
          </div>
          ${mediaItems.length ? renderMediaGallery(item, mediaItems, "notes", "", itemIndex) : ""}
        </article>
      `;
    }).join("");
    bindMediaGalleryScroll();
    if ($("#media-lightbox").open) updateLightbox();
  }

  function updateLightbox() {
    const items = state.data?.[state.lightbox.collection] || [];
    const item = items[state.lightbox.itemIndex];
    const mediaItems = item ? itemMedia(item) : [];
    if (!mediaItems.length) return;
    state.lightbox.index = (state.lightbox.index + mediaItems.length) % mediaItems.length;
    const mediaItem = mediaItems[state.lightbox.index];
    const image = $("#lightbox-image");
    const video = $("#lightbox-video");
    image.classList.remove("is-entering");
    video.classList.remove("is-entering");
    let activeMedia = image;
    if (mediaItem.type === "video") {
      image.hidden = true;
      image.removeAttribute("src");
      video.pause();
      video.hidden = false;
      video.src = mediaItem.src;
      if (mediaItem.poster) video.poster = mediaItem.poster;
      else video.removeAttribute("poster");
      video.load();
      activeMedia = video;
    } else {
      video.pause();
      video.hidden = true;
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
      image.hidden = false;
      image.src = mediaItem.src;
      image.alt = mediaItem.caption || item.name || p(item, "title");
    }
    const caption = $("#lightbox-caption");
    caption.textContent = mediaItem.caption;
    caption.hidden = !mediaItem.caption;
    $("#lightbox-count").textContent = `${state.lightbox.index + 1} / ${mediaItems.length}`;
    $("[data-lightbox-prev]").hidden = mediaItems.length < 2;
    $("[data-lightbox-next]").hidden = mediaItems.length < 2;
    $("#lightbox-count").hidden = mediaItems.length < 2;
    window.requestAnimationFrame(() => activeMedia.classList.add("is-entering"));
  }

  function openLightbox(collection, itemIndex, index) {
    const dialog = $("#media-lightbox");
    state.lightbox.collection = collection;
    state.lightbox.itemIndex = itemIndex;
    state.lightbox.index = index;
    updateLightbox();
    if (!dialog.open) dialog.showModal();
  }

  function stepLightbox(delta) {
    state.lightbox.index += delta;
    updateLightbox();
  }

  function renderContact() {
    const identity = state.data.profile.identity;
    const contact = state.data.profile.contact;
    const githubName = contact.github.replace(/\/+$/, "").split("/").pop();
    const orcidId = contact.orcid.replace(/\/+$/, "").split("/").pop();
    const scholarName = identity[`name_${state.lang}`] || identity.name_en;
    const icons = {
      email: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      github: `<svg class="contact-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.53-.49-.33-.86-.82-1.09-.82-1.09-.67-.46.05-.45.05-.45.74.05 1.13.76 1.13.76.66 1.13 1.73.8 2.15.61.07-.48.26-.8.48-.98-1.6-.18-3.29-.8-3.29-3.56 0-.79.28-1.43.74-1.93-.07-.18-.32-.91.07-1.9 0 0 .6-.19 1.97.74A6.8 6.8 0 0 1 8 5.2a6.8 6.8 0 0 1 1.79.24c1.37-.93 1.97-.74 1.97-.74.39.99.14 1.72.07 1.9.46.5.74 1.14.74 1.93 0 2.77-1.69 3.38-3.3 3.56.27.23.5.68.5 1.36l-.01 2.02c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>`,
      orcid: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#a6ce39"/><circle cx="7.8" cy="7" r="1.2" fill="#fff"/><path fill="#fff" d="M6.7 9.4h2.2v7.8H6.7zm4 0h3.5c3 0 4.8 1.5 4.8 3.9 0 2.5-1.8 3.9-4.8 3.9h-3.5zm2.2 1.8v4.2h1.2c1.7 0 2.6-.7 2.6-2.1 0-1.4-.9-2.1-2.6-2.1z"/></svg>`,
      scholar: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M12 3 1.8 8.5 12 14l8.2-4.4V16H22V8.5z"/><path fill="#7baaf7" d="M5.2 12.2V17c1.8 2.3 4 3.4 6.8 3.4s5-1.1 6.8-3.4v-4.8L12 15.9z"/></svg>`,
      address: `<svg class="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`
    };
    const items = [
      { url: contact.github, icon: "github", label: "GitHub", value: githubName },
      { url: contact.orcid, icon: "orcid", label: "ORCID", value: orcidId },
      { url: contact.scholar, icon: "scholar", label: "Scholar", value: scholarName },
      { url: `mailto:${contact.email}`, icon: "email", label: t("email"), value: contact.email },
      { url: "", icon: "address", label: t("address"), value: identity[`location_${state.lang}`] || identity.location_en }
    ];
    $("#contact-links").innerHTML = items.map((item) => {
      const content = `
        ${icons[item.icon]}
        <span class="contact-link-label">${D.escapeHTML(item.label)}</span>
        <span class="contact-link-separator" aria-hidden="true">·</span>
        <span class="contact-link-value">${D.escapeHTML(item.value)}</span>
      `;
      if (!item.url) return `<div class="contact-link contact-link-static">${content}</div>`;
      return `<a class="contact-link" href="${D.escapeHTML(item.url)}" ${item.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${content}</a>`;
    }).join("");
  }

  function renderEducation() {
    $("#education-list").innerHTML = state.data.profile.education.map((item) => {
      const degree = item[`degree_${state.lang}`] || item.degree_en;
      const institution = item[`institution_${state.lang}`] || item.institution_en;
      const advisor = item[`advisor_${state.lang}`] || item.advisor_en;
      const thesis = item[`thesis_${state.lang}`] || item.thesis_en;
      return `
        <article class="timeline-item">
          <div class="timeline-period">${D.escapeHTML(item.period)}</div>
          <div>
            <h4>${D.escapeHTML(degree)}</h4>
            <p>${D.escapeHTML(institution)}</p>
            ${advisor ? `<p>${D.escapeHTML(advisor)}</p>` : ""}
            ${thesis ? `<p><em>${D.escapeHTML(thesis)}</em></p>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderExperience() {
    $("#experience-list").innerHTML = state.data.profile.experience.map((item) => `
      <article class="timeline-item">
        <div class="timeline-period">${D.escapeHTML(p(item, "period"))}</div>
        <div>
          <h4>${D.escapeHTML(p(item, "institution"))}</h4>
          <p>${D.escapeHTML(p(item, "title"))}</p>
        </div>
      </article>
    `).join("");
  }

  function renderAwards() {
    const items = [...state.data.awards].sort((a, b) => b.date.localeCompare(a.date));
    $("#awards-list").innerHTML = items.map((item) => {
      const publications = state.data.publications.filter((publication) => publication.award_id === item.id);
      return `
        <article class="timeline-item">
          <div class="timeline-period">${D.escapeHTML(item.date)}</div>
          <div>
            <h4>${D.escapeHTML(p(item, "title"))}</h4>
            <p>${D.escapeHTML(p(item, "organization"))}</p>
            ${publications.map((publication) => `
              <div class="award-publication">
                <p class="award-publication-title">${D.escapeHTML(D.publicationTitle(publication, state.lang))}</p>
                <p class="award-publication-authors">
                  ${D.displayAuthors(publication.authors, state.lang, false)}
                  (${D.escapeHTML(D.publicationYear(publication) || D.publicationStatus(publication))})
                </p>
                <p class="award-publication-venue">${D.escapeHTML(publication.venue)}</p>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderScholarships() {
    $("#scholarships-list").innerHTML = state.data.profile.scholarships.map((item) => `
      <article class="timeline-item scholarship-item">
        <div class="timeline-period">${D.escapeHTML(p(item, "period"))}</div>
        <div>
          <h4>${D.escapeHTML(p(item, "name"))}</h4>
          ${p(item, "summary") ? `<p>${D.escapeHTML(p(item, "summary"))}</p>` : ""}
          <dl class="scholarship-details">
            ${(item.details || []).map((detail) => `
              <div>
                <dt>${D.escapeHTML(p(detail, "label"))}</dt>
                <dd>${D.escapeHTML(p(detail, "value"))}</dd>
              </div>
            `).join("")}
          </dl>
        </div>
      </article>
    `).join("");
  }

  function renderCertifications() {
    const items = [...state.data.profile.certifications].sort((a, b) => b.date.localeCompare(a.date));
    $("#certifications-list").innerHTML = items.map((item) => `
      <article class="timeline-item">
        <div class="timeline-period">${D.escapeHTML(item.date)}</div>
        <div>
          <h4>${D.escapeHTML(p(item, "name"))}</h4>
          <p>${D.escapeHTML(p(item, "issuer"))}</p>
        </div>
      </article>
    `).join("");
  }

  function renderTeaching() {
    $("#teaching-list").innerHTML = state.data.profile.teaching.map((item) => `
      <article class="timeline-item">
        <div class="timeline-period">${D.escapeHTML(item.period)}</div>
        <div>
          <h4>${D.escapeHTML(item[`title_${state.lang}`] || item.title_en)}</h4>
          <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
        </div>
      </article>
    `).join("");
  }

  function renderSkills() {
    $("#skills-list").innerHTML = state.data.profile.skills.map((item) => `
      <article class="skill-item">
        <strong>${D.escapeHTML(item.name)}</strong>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
      </article>
    `).join("");
  }

  function renderAbout() {
    renderContact();
    renderExperience();
    renderEducation();
    renderScholarships();
    renderCertifications();
    renderAwards();
    renderTeaching();
    renderSkills();
  }

  function renderAll() {
    updateProfileBindings();
    renderProfileStats();
    renderProjects();
    renderSoftware();
    renderPublications();
    renderNotes();
    renderAbout();
  }

  function currentPageView() {
    const hash = window.location.hash.slice(1);
    return PAGE_VIEWS.has(hash) ? hash : "home";
  }

  function navigatePageBySwipe(direction) {
    const currentIndex = PAGE_SEQUENCE.indexOf(currentPageView());
    const nextIndex = Math.max(0, Math.min(currentIndex + direction, PAGE_SEQUENCE.length - 1));
    if (nextIndex === currentIndex) return;

    const nextView = PAGE_SEQUENCE[nextIndex];
    state.pageTransitionDirection = direction;
    if (nextView === "home") {
      window.location.hash = "";
    } else {
      window.location.hash = nextView;
    }
  }

  function animatePageEntry(section) {
    const direction = state.pageTransitionDirection;
    state.pageTransitionDirection = 0;
    if (!section || !direction || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const className = direction > 0 ? "page-swipe-enter-next" : "page-swipe-enter-previous";
    section.classList.add(className);
    section.addEventListener("animationend", () => section.classList.remove(className), { once: true });
  }

  function renderPageView(options = {}) {
    const view = currentPageView();
    let activeSection = null;
    $$('[data-page-section]').forEach((section) => {
      section.classList.remove("page-swipe-enter-next", "page-swipe-enter-previous");
      section.hidden = section.dataset.pageSection !== view;
      if (!section.hidden) activeSection = section;
    });
    $$('[data-page-link]').forEach((link) => {
      if (link.dataset.pageLink === view) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (options.scroll !== false) {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }
    animatePageEntry(activeSection);
  }

  function bindSwipeNavigation() {
    let gesture = null;

    document.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) {
        gesture = null;
        return;
      }

      const touch = event.touches[0];
      const target = event.target;
      const gallery = target.closest?.("[data-media-gallery]");
      const projectTimeline = target.closest?.("[data-project-timeline-scroll]");
      let mode = "page";
      if (projectTimeline) {
        mode = "ignore";
      } else if (gallery) {
        mode = "gallery";
      } else if (target.closest?.("#lightbox-video")) {
        mode = "ignore";
      } else if ($("#media-lightbox")?.open || target.closest?.("#media-lightbox")) {
        mode = "lightbox";
      } else if (target.closest?.("input, textarea, select, [contenteditable='true']")) {
        mode = "ignore";
      }

      gesture = {
        mode,
        gallery,
        galleryIndex: gallery ? Number(gallery.dataset.galleryIndex || 0) : 0,
        startX: touch.clientX,
        startY: touch.clientY
      };
    }, { passive: true });

    document.addEventListener("touchend", (event) => {
      if (!gesture || event.changedTouches.length !== 1) {
        gesture = null;
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const isHorizontalSwipe = Math.abs(deltaX) >= SWIPE_MIN_DISTANCE
        && Math.abs(deltaX) > Math.abs(deltaY) * SWIPE_DIRECTION_RATIO;
      const mode = gesture.mode;
      const gallery = gesture.gallery;
      const galleryIndex = gesture.galleryIndex;
      gesture = null;

      if (!isHorizontalSwipe || mode === "ignore") return;
      const direction = deltaX < 0 ? 1 : -1;

      if (mode === "gallery") {
        if (event.cancelable) event.preventDefault();
        setGalleryIndex(gallery, galleryIndex + direction);
        return;
      }

      if (mode === "lightbox") {
        if (event.cancelable) event.preventDefault();
        stepLightbox(direction);
        return;
      }

      if (window.matchMedia("(max-width: 900px)").matches) {
        if (event.cancelable) event.preventDefault();
        navigatePageBySwipe(direction);
      }
    }, { passive: false });

    document.addEventListener("touchmove", (event) => {
      if (!gesture || gesture.mode === "gallery" || gesture.mode === "ignore" || event.touches.length !== 1) return;
      if (gesture.mode === "page" && !window.matchMedia("(max-width: 900px)").matches) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY) * SWIPE_DIRECTION_RATIO) {
        event.preventDefault();
      }
    }, { passive: false });

    document.addEventListener("touchcancel", () => {
      gesture = null;
    }, { passive: true });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2300);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("copied"));
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      textarea.remove();
      showToast(success ? t("copied") : t("copyFailed"));
    }
  }

  function bindEvents() {
    $$("[data-lang-switch]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.langSwitch));
    });

    document.addEventListener("click", (event) => {
      const projectTarget = event.target.closest("[data-project-timeline-target]");
      if (projectTarget) {
        scrollToProjectCard(Number(projectTarget.dataset.projectTimelineTarget));
        return;
      }

      const galleryStep = event.target.closest("[data-gallery-step]");
      if (galleryStep) {
        const gallery = galleryStep.closest("[data-media-gallery]");
        const index = Number(gallery?.dataset.galleryIndex || 0) + Number(galleryStep.dataset.galleryStep);
        if (gallery) setGalleryIndex(gallery, index);
        return;
      }

      const mediaButton = event.target.closest("[data-open-lightbox]");
      if (mediaButton) {
        openLightbox(mediaButton.dataset.lightboxCollection, Number(mediaButton.dataset.lightboxItemIndex || 0), Number(mediaButton.dataset.mediaIndex || 0));
        return;
      }

      if (event.target.closest("[data-lightbox-close]")) {
        $("#media-lightbox").close();
        return;
      }

      if (event.target.closest("[data-lightbox-prev]")) {
        stepLightbox(-1);
        return;
      }

      if (event.target.closest("[data-lightbox-next]")) {
        stepLightbox(1);
        return;
      }

      const sortButton = event.target.closest("[data-pub-sort]");
      if (sortButton) {
        state.publication.sort = sortButton.dataset.pubSort;
        renderPublications();
        return;
      }

      const collaboratorButton = event.target.closest("[data-collaborator-id]");
      if (collaboratorButton) {
        const id = collaboratorButton.dataset.collaboratorId;
        state.publication.collaboratorId = state.publication.collaboratorId === id ? "" : id;
        renderPublications();
        return;
      }

      const publicationToggle = event.target.closest("[data-publication-toggle]");
      if (publicationToggle) {
        const itemIndex = Number(publicationToggle.dataset.publicationToggle);
        const article = publicationToggle.closest("[data-publication-index]");
        const details = article?.querySelector(".publication-details");
        const expanded = !state.publication.expanded.has(itemIndex);
        if (expanded) state.publication.expanded.add(itemIndex);
        else state.publication.expanded.delete(itemIndex);
        article?.classList.toggle("is-expanded", expanded);
        publicationToggle.setAttribute("aria-expanded", String(expanded));
        details?.setAttribute("aria-hidden", String(!expanded));
        return;
      }

      const copyButton = event.target.closest("[data-copy-citation]");
      if (copyButton) {
        const item = state.data.publications[Number(copyButton.dataset.copyCitation)];
        if (item) copyText(D.publicationCitation(item, state.lang));
        return;
      }

      const oneExport = event.target.closest("[data-export-one]");
      if (oneExport) {
        const item = state.data.publications[Number(oneExport.dataset.exportOne)];
        if (item) D.downloadPublicationBib(item);
      }
    });

    $("#pub-search").addEventListener("input", (event) => {
      state.publication.query = event.target.value;
      renderPublications();
      event.target.focus();
      event.target.setSelectionRange(event.target.value.length, event.target.value.length);
    });
    $("#pub-type").addEventListener("change", (event) => {
      state.publication.publicationType = event.target.value;
      renderPublications();
    });
    $("#pub-topic").addEventListener("change", (event) => {
      state.publication.topic = event.target.value;
      renderPublications();
    });
    $("#pub-reset").addEventListener("click", () => {
      state.publication.query = "";
      state.publication.publicationType = "all";
      state.publication.topic = ALL_TOPIC_FILTER;
      state.publication.collaboratorId = "";
      state.publication.firstAuthorOnly = false;
      renderPublications();
    });
    $("#pub-first-author").addEventListener("change", (event) => {
      state.publication.firstAuthorOnly = event.target.checked;
      renderPublications();
    });

    document.addEventListener("keydown", (event) => {
      const dialog = $("#media-lightbox");
      if (dialog.open) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          stepLightbox(event.key === "ArrowLeft" ? -1 : 1);
        }
        return;
      }

      const viewport = event.target.closest?.("[data-gallery-viewport]");
      if (viewport && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const gallery = viewport.closest("[data-media-gallery]");
        const index = Number(gallery.dataset.galleryIndex || 0) + (event.key === "ArrowLeft" ? -1 : 1);
        setGalleryIndex(gallery, index);
      }
    });

    $("#media-lightbox").addEventListener("click", (event) => {
      if (!event.target.closest(".lightbox-figure, .lightbox-nav, .lightbox-close")) {
        $("#media-lightbox").close();
      }
    });

    $("#media-lightbox").addEventListener("close", () => {
      $("#lightbox-image").removeAttribute("src");
      const video = $("#lightbox-video");
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
    });

    window.addEventListener("resize", () => {
      $$('[data-media-gallery]').forEach((gallery) => {
        setGalleryIndex(gallery, Number(gallery.dataset.galleryIndex || 0), { instant: true });
      });
    });
  }

  function renderLoadError(error) {
    console.error(error);
    const main = $("#main");
    main.innerHTML = `
      <section class="section-shell">
        <div class="container">
          <p class="empty-state">${D.escapeHTML(t("loadError"))}</p>
        </div>
      </section>
    `;
  }

  async function init() {
    state.lang = initialLanguage();
    setLanguage(state.lang, { skipURL: true });
    bindEvents();
    bindSwipeNavigation();
    window.addEventListener("hashchange", () => renderPageView());
    renderPageView({ scroll: false });

    try {
      state.data = await D.loadAll();
      setLanguage(state.lang, { skipURL: true });
      renderPageView({ scroll: false });
    } catch (error) {
      renderLoadError(error);
    }
  }

  init();
}());
