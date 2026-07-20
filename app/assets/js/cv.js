
(function () {
  "use strict";

  const D = window.SiteData;
  const state = {
    lang: "en",
    data: null
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
      summary: "Profile",
      experience: "Experience",
      education: "Education",
      projects: "Projects",
      publications: "Publications",
      software: "Software",
      awards: "Awards",
      teaching: "Teaching",
      scholarships: "Scholarships",
      certifications: "Certifications",
      skills: "Technical Skills",
      loadError: "The page could not be loaded. Please refresh and try again.",
      repository: "Repository",
      updated: "Data updated"
    },
    ko: {
      back: "돌아가기",
      downloadPdf: "PDF 다운로드",
      summary: "소개",
      experience: "경력",
      education: "학력",
      projects: "연구 프로젝트",
      publications: "논문",
      software: "소프트웨어",
      awards: "수상",
      teaching: "교육",
      scholarships: "장학",
      certifications: "자격",
      skills: "기술 역량",
      loadError: "페이지를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
      repository: "저장소",
      updated: "데이터 갱신"
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
    return state.data.projects;
  }

  function selectedSoftware() {
    return state.data.software;
  }

  function selectedAwards() {
    const items = [...state.data.awards].sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }

  function selectedPublications() {
    return [...state.data.publications].sort(
      (a, b) => D.publicationStatusRank(b) - D.publicationStatusRank(a)
        || String(b.date || "").localeCompare(String(a.date || ""))
        || D.publicationTitle(a, state.lang).localeCompare(D.publicationTitle(b, state.lang))
    );
  }

  function section(title, content, className = "") {
    return `
      <section class="cv-section ${className}">
        <h2>${D.escapeHTML(title)}</h2>
        <div class="cv-section-content">${content}</div>
      </section>
    `;
  }

  function datedEntry(date, content) {
    return `
      <article class="cv-entry cv-entry-dated">
        <time class="cv-entry-time">${D.escapeHTML(date)}</time>
        <div class="cv-entry-body">${content}</div>
      </article>
    `;
  }

  function renderEducation() {
    return state.data.profile.education.map((item) => datedEntry(item.period, `
        <h3>${D.escapeHTML(item[`degree_${state.lang}`] || item.degree_en)} · ${D.escapeHTML(item[`institution_${state.lang}`] || item.institution_en)}</h3>
        ${item[`advisor_${state.lang}`] || item.advisor_en ? `<p>${D.escapeHTML(item[`advisor_${state.lang}`] || item.advisor_en)}</p>` : ""}
        ${item[`thesis_${state.lang}`] || item.thesis_en ? `<p><em>${D.escapeHTML(item[`thesis_${state.lang}`] || item.thesis_en)}</em></p>` : ""}
    `)).join("");
  }

  function renderExperience() {
    return state.data.profile.experience.map((item) => datedEntry(p(item, "period"), `
      <h3>${D.escapeHTML(p(item, "institution"))} · ${D.escapeHTML(p(item, "title"))}</h3>
    `)).join("");
  }

  function renderProjects() {
    return selectedProjects().map((item) => datedEntry(D.projectPeriod(item), `
        <h3>${D.escapeHTML(p(item, "title"))}</h3>
        <p>${D.escapeHTML(p(item, "funder"))}</p>
        <p>${D.escapeHTML(p(item, "summary"))}</p>
    `)).join("");
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
                <span class="cv-publication-number" aria-hidden="true"></span>
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
          <p>${D.escapeHTML(p(item, "summary"))}</p>
          ${links.map((link) => `<p><a href="${D.escapeHTML(link.url)}">${D.escapeHTML(link.label)}: ${D.escapeHTML(link.url)}</a></p>`).join("")}
        </article>
      `;
    }).join("");
  }

  function renderAwards() {
    return selectedAwards().map((item) => {
      const publications = state.data.publications.filter((publication) => publication.award_id === item.id);
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

  function renderTeaching() {
    return state.data.profile.teaching.map((item) => datedEntry(item.period, `
        <h3>${D.escapeHTML(item[`title_${state.lang}`] || item.title_en)}</h3>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
    `)).join("");
  }

  function renderCertifications() {
    return state.data.profile.certifications.map((item) => datedEntry(item.date, `
        <h3>${D.escapeHTML(item[`name_${state.lang}`] || item.name_en)}</h3>
        <p>${D.escapeHTML(item[`issuer_${state.lang}`] || item.issuer_en)}</p>
    `)).join("");
  }

  function renderScholarships() {
    return state.data.profile.scholarships.map((item) => datedEntry(p(item, "period"), `
        <h3>${D.escapeHTML(p(item, "name"))}</h3>
        ${p(item, "summary") ? `<p>${D.escapeHTML(p(item, "summary"))}</p>` : ""}
        <ul class="cv-detail-list">
          ${(item.details || []).map((detail) => `
            <li><strong>${D.escapeHTML(p(detail, "label"))}:</strong> ${D.escapeHTML(p(detail, "value"))}</li>
          `).join("")}
        </ul>
    `)).join("");
  }

  function renderSkills() {
    return state.data.profile.skills.map((item) => `
      <article class="cv-entry">
        <h3>${D.escapeHTML(item.name)}</h3>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
      </article>
    `).join("");
  }

  function render() {
    const profile = state.data.profile;
    const identity = profile.identity;
    const contact = profile.contact;
    const name = identity[`name_${state.lang}`] || identity.name_en;
    const role = identity[`role_${state.lang}`] || identity.role_en;
    const affiliation = identity[`affiliation_${state.lang}`] || identity.affiliation_en;
    const intro = profile.intro[`short_${state.lang}`] || profile.intro.short_en;
    document.title = `${name} · CV`;

    const sections = [
      section(t("summary"), `<p>${D.escapeHTML(intro)}</p>`),
      section(t("experience"), renderExperience()),
      section(t("education"), renderEducation()),
      section(t("projects"), renderProjects()),
      section(t("publications"), renderPublications()),
      section(t("software"), renderSoftware()),
      section(t("awards"), renderAwards()),
      section(t("teaching"), renderTeaching()),
      section(t("scholarships"), renderScholarships()),
      section(t("certifications"), renderCertifications()),
      section(t("skills"), renderSkills())
    ];

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
          <span>${D.escapeHTML(t("updated"))}: ${D.escapeHTML(profile.last_updated)}</span>
        </div>
      </header>
      ${sections.join("")}
    `;
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
