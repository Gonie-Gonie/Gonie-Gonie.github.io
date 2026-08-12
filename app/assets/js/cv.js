
(function () {
  "use strict";

  const D = window.SiteData;
  const state = {
    lang: "ko",
    data: null,
    scholarshipRenderVersion: 0
  };
  const PUBLICATION_TYPES = [
    "international-journal",
    "domestic-journal",
    "international-conference",
    "domestic-conference"
  ];

  const I18N = {
    en: {
      back: "Back",
      downloadPdf: "Download PDF",
      experience: "Experience",
      education: "Education",
      projects: "Projects",
      publications: "Publications",
      software: "Software",
      awards: "Awards",
      academic_activities: "Academic Activities",
      academicEditorialService: "Editorial Service",
      academicProfessionalService: "Professional Service",
      academicConferenceService: "Conference Service",
      academicInvitedTalk: "Invited Talk",
      academicReview: "Review",
      present: "Present",
      teaching: "Teaching",
      scholarships: "Scholarships",
      scholarshipAmount: "Amount",
      certifications: "Certifications",
      skills: "Technical Skills",
      loadError: "The page could not be loaded. Please refresh and try again.",
      repository: "Repository"
    },
    ko: {
      back: "돌아가기",
      downloadPdf: "PDF 다운로드",
      experience: "경력",
      education: "학력",
      projects: "연구 프로젝트",
      publications: "논문",
      software: "소프트웨어",
      awards: "수상",
      academic_activities: "학술활동",
      academicEditorialService: "편집 활동",
      academicProfessionalService: "전문 활동",
      academicConferenceService: "학술대회 활동",
      academicInvitedTalk: "초청 발표",
      academicReview: "리뷰",
      present: "현재",
      teaching: "교육",
      scholarships: "장학",
      scholarshipAmount: "금액",
      certifications: "자격",
      skills: "기술 역량",
      loadError: "페이지를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
      repository: "저장소"
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
    return "ko";
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
      button.setAttribute("aria-pressed", String(button.dataset.langSwitch === state.lang));
    });
    $$("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    const homeLink = $(".brand");
    homeLink.href = `index.html?lang=${state.lang}`;
    if (state.data) render();
  }

  function selectedProjects() {
    return state.data.projects.filter(D.visibleInCV);
  }

  function selectedSoftware() {
    return state.data.software.filter(D.visibleInCV);
  }

  function selectedAwards() {
    const items = state.data.awards.filter(D.visibleInCV).sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }

  function selectedPublications() {
    return state.data.publications.filter(D.visibleInCV).sort(
      (a, b) => D.publicationStatusRank(b) - D.publicationStatusRank(a)
        || String(b.date || "").localeCompare(String(a.date || ""))
        || D.publicationTitle(a, state.lang).localeCompare(D.publicationTitle(b, state.lang))
    );
  }

  function selectedProfileItems(sectionName) {
    return (state.data.profile[sectionName] || []).filter(D.visibleInCV);
  }

  function section(title, content, className = "") {
    return `
      <section class="cv-section ${className}">
        <h2>${D.escapeHTML(title)}</h2>
        <div class="cv-section-content">${content}</div>
      </section>
    `;
  }

  function datedEntry(date, content, stackedPeriod = false) {
    const dateText = String(date || "");
    const dateLines = stackedPeriod
      ? dateText.split(/\s*[–—]\s*/).map((part) => part.trim()).filter(Boolean)
      : [dateText];
    return `
      <article class="cv-entry cv-entry-dated">
        <time class="cv-entry-time${stackedPeriod ? " cv-entry-time-stacked" : ""}" aria-label="${D.escapeHTML(dateText)}">
          ${dateLines.map((line, index) => `
            <span class="cv-entry-time-line">
              ${stackedPeriod ? `<span class="cv-entry-time-separator" aria-hidden="true">${index ? "–" : ""}</span>` : ""}
              <span>${D.escapeHTML(line)}</span>
            </span>
          `).join("")}
        </time>
        <div class="cv-entry-body">${content}</div>
      </article>
    `;
  }

  function renderEducation() {
    return selectedProfileItems("education").map((item) => datedEntry(item.period, `
        <h3>${D.escapeHTML(item[`degree_${state.lang}`] || item.degree_en)} · ${D.escapeHTML(item[`institution_${state.lang}`] || item.institution_en)}</h3>
        ${item[`advisor_${state.lang}`] || item.advisor_en ? `<p>${D.escapeHTML(item[`advisor_${state.lang}`] || item.advisor_en)}</p>` : ""}
        ${item[`thesis_${state.lang}`] || item.thesis_en ? `<p><em>${D.escapeHTML(item[`thesis_${state.lang}`] || item.thesis_en)}</em></p>` : ""}
    `, true)).join("");
  }

  function renderExperience() {
    return selectedProfileItems("experience").map((item) => datedEntry(p(item, "period"), `
      <h3>${D.escapeHTML(p(item, "institution"))} · ${D.escapeHTML(p(item, "title"))}</h3>
    `, true)).join("");
  }

  function renderProjects() {
    return selectedProjects().map((item) => datedEntry(D.projectPeriod(item), `
        <h3 class="cv-project-heading">
          ${D.escapeHTML(p(item, "title"))}
          <em class="cv-project-funder">${D.escapeHTML(p(item, "funder"))}</em>
        </h3>
        <ul class="cv-detail-list">
          ${D.projectNotes(item, state.lang).map((note) => `<li>${D.escapeHTML(note)}</li>`).join("")}
        </ul>
    `, true)).join("");
  }

  function cvPublicationLanguage(item) {
    return item.publication_type.startsWith("international-") ? "en" : state.lang;
  }

  function renderPublications() {
    const items = selectedPublications();
    return PUBLICATION_TYPES.map((type) => {
      const groupedItems = items.filter((item) => item.publication_type === type);
      if (!groupedItems.length) return "";
      return `
        <section class="cv-publication-group">
          <h3>${D.escapeHTML(D.publicationTypeLabel({ publication_type: type }, state.lang))}</h3>
          <div class="cv-publications">
            ${groupedItems.map((item) => `
              <article class="cv-publication">
                <span${D.truthy(item.under_review) ? "" : ' class="cv-publication-number"'} aria-hidden="true"></span>
                <div class="cv-publication-citation">
                  ${D.displayAuthors(item.authors, cvPublicationLanguage(item), false)} (${D.escapeHTML(D.publicationYear(item) || D.publicationStatus(item))}).
                  “${D.escapeHTML(D.publicationTitle(item, cvPublicationLanguage(item)))}.”
                  <em>${D.escapeHTML(item.venue)}</em>
                  ${item.doi ? ` <a href="https://doi.org/${D.escapeHTML(item.doi)}">doi:${D.escapeHTML(item.doi)}</a>` : ""}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderSoftware() {
    return selectedSoftware().map((item) => {
      const links = D.softwareLinks(item, state.lang);
      return `
        <article class="cv-entry">
          <h3>${D.escapeHTML(item.name)}</h3>
          <ul class="cv-detail-list">
            ${D.softwareNotes(item, state.lang).map((note) => `<li>${D.escapeHTML(note)}</li>`).join("")}
          </ul>
          ${links.map((link) => `<p><a href="${D.escapeHTML(link.url)}">${D.escapeHTML(link.label)}: ${D.escapeHTML(link.url)}</a></p>`).join("")}
        </article>
      `;
    }).join("");
  }

  function renderAwards() {
    return selectedAwards().map((item) => {
      const publications = state.data.publications.filter(
        (publication) => publication.award_id === item.id && D.visibleInCV(publication)
      );
      return datedEntry(item.date, `
          <h3>${D.escapeHTML(p(item, "title"))}</h3>
          <p>${D.escapeHTML(p(item, "organization"))}</p>
          ${publications.map((publication) => {
            const language = cvPublicationLanguage(publication);
            return `
              <p class="cv-award-publication">
                ${D.displayAuthors(publication.authors, language, false)} (${D.escapeHTML(D.publicationYear(publication) || D.publicationStatus(publication))}).
                “${D.escapeHTML(D.publicationTitle(publication, language))}.”
                <em>${D.escapeHTML(publication.venue)}</em>
              </p>
            `;
          }).join("")}
      `);
    }).join("");
  }

  function academicDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}.` : String(value || "");
  }

  function academicPeriod(item) {
    return `${academicDate(item.start_date)} – ${item.end_date ? academicDate(item.end_date) : t("present")}`;
  }

  function academicDateRange(item) {
    return item.end_date
      ? `${academicDate(item.start_date)} – ${academicDate(item.end_date)}`
      : academicDate(item.start_date);
  }

  function academicActivityBody(title, detail = "") {
    return `
      <h3>${D.escapeHTML(title)}</h3>
      ${detail ? `<p>${D.escapeHTML(detail)}</p>` : ""}
    `;
  }

  function academicReviewEntry(item) {
    const count = item.completed_dates.length;
    const reviewCount = state.lang === "ko"
      ? `${count}회 리뷰`
      : `${count} review${count === 1 ? "" : "s"}`;
    return `
      <article class="cv-entry cv-entry-dated">
        <div class="cv-entry-time">${D.escapeHTML(reviewCount)}</div>
        <div class="cv-entry-body">${academicActivityBody(p(item, "journal"))}</div>
      </article>
    `;
  }

  function renderAcademicActivities() {
    const data = state.data.academicActivities;
    const groups = {
      editorial_service: {
        title: t("academicEditorialService"),
        render: (item) => datedEntry(
          academicPeriod(item),
          academicActivityBody(p(item, "journal"), p(item, "role")),
          true
        )
      },
      professional_service: {
        title: t("academicProfessionalService"),
        render: (item) => datedEntry(
          academicPeriod(item),
          academicActivityBody(p(item, "organization"), p(item, "role")),
          true
        )
      },
      conference_service: {
        title: t("academicConferenceService"),
        render: (item) => datedEntry(
          academicDateRange(item),
          academicActivityBody(p(item, "conference"), p(item, "role")),
          Boolean(item.end_date)
        )
      },
      invited_talks: {
        title: t("academicInvitedTalk"),
        render: (item) => datedEntry(
          academicDate(item.date),
          academicActivityBody(p(item, "event"), p(item, "topic"))
        )
      },
      reviews: {
        title: t("academicReview"),
        render: academicReviewEntry
      }
    };

    return D.ACADEMIC_ACTIVITY_CATEGORIES.map((category) => {
      const items = (data[category] || []).filter(D.visibleInCV);
      if (!items.length) return "";
      const group = groups[category];
      return `
        <section class="cv-academic-activity-group">
          <h3>${D.escapeHTML(group.title)}</h3>
          <div class="cv-academic-activity-items">
            ${items.map(group.render).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderTeaching() {
    return selectedProfileItems("teaching").map((item) => datedEntry(item.period, `
        <h3>${D.escapeHTML(item[`title_${state.lang}`] || item.title_en)}</h3>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
    `)).join("");
  }

  function renderCertifications() {
    return selectedProfileItems("certifications").map((item) => datedEntry(item.date, `
        <h3>${D.escapeHTML(item[`name_${state.lang}`] || item.name_en)}</h3>
        <p>${D.escapeHTML(item[`issuer_${state.lang}`] || item.issuer_en)}</p>
    `)).join("");
  }

  function renderScholarships() {
    return selectedProfileItems("scholarships").map((item, index) => datedEntry(p(item, "period"), `
        <h3>${D.escapeHTML(p(item, "name"))}</h3>
        ${p(item, "summary") ? `<p>${D.escapeHTML(p(item, "summary"))}</p>` : ""}
        <ul class="cv-detail-list">
          <li>
            <strong>${D.escapeHTML(t("scholarshipAmount"))}:</strong>
            <span data-scholarship-amount="${index}" aria-live="polite">${D.escapeHTML(D.formatScholarshipAmount(item.amount, state.lang))}</span>
          </li>
        </ul>
    `)).join("");
  }

  function updateScholarshipAmounts(items, renderVersion, language) {
    $$('[data-scholarship-amount]').forEach(async (target) => {
      const item = items[Number(target.dataset.scholarshipAmount)];
      if (!item) return;
      const amount = await D.resolveScholarshipAmount(item.amount, language);
      if (state.scholarshipRenderVersion !== renderVersion || state.lang !== language) return;
      if (target.isConnected) target.textContent = amount;
    });
  }

  function renderSkills() {
    return selectedProfileItems("skills").map((item) => `
      <article class="cv-entry">
        <h3>${D.escapeHTML(item.name)}</h3>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
      </article>
    `).join("");
  }

  function render() {
    const renderVersion = ++state.scholarshipRenderVersion;
    const renderLanguage = state.lang;
    const profile = state.data.profile;
    const identity = profile.identity;
    const contact = profile.contact;
    const name = D.personName(identity, state.lang);
    const role = identity[`role_${state.lang}`] || identity.role_en;
    const affiliation = identity[`affiliation_${state.lang}`] || identity.affiliation_en;
    document.title = name;

    const sectionRenderers = {
      experience: renderExperience,
      education: renderEducation,
      projects: renderProjects,
      publications: renderPublications,
      software: renderSoftware,
      awards: renderAwards,
      academic_activities: renderAcademicActivities,
      teaching: renderTeaching,
      scholarships: renderScholarships,
      certifications: renderCertifications,
      skills: renderSkills
    };
    const hiddenSections = new Set(state.data.settings.hidden_cv_sections || []);
    const sections = (state.data.settings.cv_sections || [])
      .filter((sectionName) => !hiddenSections.has(sectionName))
      .map((sectionName) => {
        const content = sectionRenderers[sectionName]();
        return content.trim() ? section(t(sectionName), content) : "";
      })
      .filter(Boolean);

    $("#cv-paper").innerHTML = `
      <header class="cv-paper-header">
        <div>
          <h1>${D.escapeHTML(name)}</h1>
          <p class="cv-subtitle">${D.escapeHTML(role)}</p>
          <p class="cv-subtitle">${D.escapeHTML(affiliation)}</p>
        </div>
        <div class="cv-contact">
          <a href="mailto:${D.escapeHTML(contact.email)}">${D.escapeHTML(contact.email)}</a>
          <a href="${D.escapeHTML(contact.github)}">${D.escapeHTML(contact.github.replace(/^https?:\/\//, ""))}</a>
          <a href="${D.escapeHTML(contact.orcid)}">${D.escapeHTML(contact.orcid.replace(/^https?:\/\//, ""))}</a>
          ${contact.linkedin ? `<a href="${D.escapeHTML(contact.linkedin)}">${D.escapeHTML(contact.linkedin.replace(/^https?:\/\//, ""))}</a>` : ""}
        </div>
      </header>
      ${sections.join("")}
    `;
    updateScholarshipAmounts(selectedProfileItems("scholarships"), renderVersion, renderLanguage);
  }

  function bindEvents() {
    $$("[data-lang-switch]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.langSwitch));
    });
    $("#download-pdf").addEventListener("click", () => window.print());
  }

  async function init() {
    state.lang = initialLanguage();
    setLanguage(state.lang, { skipURL: true });
    bindEvents();
    try {
      state.data = await D.loadAll();
      render();
    } catch (error) {
      console.error(error);
      $("#cv-paper").innerHTML = `<p class="empty-state">${D.escapeHTML(t("loadError"))}</p>`;
    }
  }

  init();
}());
