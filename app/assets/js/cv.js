
(function () {
  "use strict";

  const D = window.SiteData;
  const state = {
    lang: "ko",
    data: null,
    template: "original",
    scholarshipRenderVersion: 0,
    layoutObserver: null
  };
  const CV_TEMPLATES = ["original", "academic", "institutional", "ledger"];
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
      continued: "(Cont'd)",
      experience: "Experience",
      education: "Education",
      advisor: "Advisor",
      projects: "PROJECT",
      publications: "Publications",
      software: "Software",
      awards: "Awards",
      patents: "Patents",
      patentFiled: "Filed",
      patentPublished: "Published",
      patentGranted: "Granted",
      academic_activities: "Academic Activities",
      academicEditorialService: "Editorial Service",
      academicProfessionalService: "Professional Service",
      academicConferenceService: "Conference Service",
      academicInvitedTalk: "Invited Talk",
      academicReview: "Review",
      present: "Present",
      teaching: "Teaching",
      scholarships: "Scholarships",
      scholarshipAmount: "Total amount",
      certifications: "Certifications",
      skills: "Technical Skills",
      loadError: "The page could not be loaded. Please refresh and try again.",
      repository: "Repository"
    },
    ko: {
      back: "돌아가기",
      downloadPdf: "PDF 다운로드",
      continued: "(계속)",
      experience: "경력",
      education: "학력",
      advisor: "지도교수",
      projects: "프로젝트",
      publications: "논문",
      software: "소프트웨어",
      awards: "수상",
      patents: "특허",
      patentFiled: "출원일",
      patentPublished: "공개일",
      patentGranted: "등록일",
      academic_activities: "학술활동",
      academicEditorialService: "편집 활동",
      academicProfessionalService: "전문 활동",
      academicConferenceService: "학술대회 활동",
      academicInvitedTalk: "초청 발표",
      academicReview: "리뷰",
      present: "현재",
      teaching: "교육",
      scholarships: "장학",
      scholarshipAmount: "총액",
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

  function section(name, content) {
    return `
      <section class="cv-section cv-section-${name}">
        <h2>${D.escapeHTML(t(name))}</h2>
        <div class="cv-section-content">${content}</div>
      </section>
    `;
  }

  function entryTime(date, stackedPeriod) {
    const multipleDates = Array.isArray(date);
    const dateText = multipleDates ? date.join(" · ") : String(date || "");
    const annotationStart = dateText.search(/[（(]/u);
    const rangeText = annotationStart < 0 ? dateText : dateText.slice(0, annotationStart);
    const annotation = annotationStart < 0 ? "" : dateText.slice(annotationStart);
    let dateLines = multipleDates ? date : [dateText];
    if (stackedPeriod) {
      dateLines = rangeText.split(/\s*[–—]\s*/).map((part) => part.trim()).filter(Boolean);
    }
    if (stackedPeriod && annotation) {
      if (dateLines.length) dateLines[dateLines.length - 1] += ` ${annotation}`;
      else dateLines.push(annotation);
    }
    return `
      <time class="cv-entry-time${stackedPeriod ? " cv-entry-time-stacked" : ""}" aria-label="${D.escapeHTML(dateText)}">
        ${dateLines.map((line, index) => `
          <span class="cv-entry-time-line">
            ${stackedPeriod ? `<span class="cv-entry-time-separator" aria-hidden="true">${index ? "–" : ""}</span>` : ""}
            <span class="cv-entry-time-value">${D.periodHTML(line)}</span>
          </span>
        `).join("")}
      </time>
    `;
  }

  function datedEntry(date, heading, details = "", stackedPeriod = false) {
    const dateText = Array.isArray(date) ? date.join("") : String(date || "");
    const institutional = state.template === "institutional";
    if (!dateText.trim() && state.template !== "original") {
      return `<article class="cv-entry">${heading}${details}</article>`;
    }
    const time = entryTime(date, stackedPeriod && !institutional);
    return `
      <article class="cv-entry cv-entry-dated">
        ${institutional
          ? `${heading}${time}${details}`
          : `${time}<div class="cv-entry-body">${heading}${details}</div>`}
      </article>
    `;
  }

  function profileEntryHeading(institution, title) {
    if (state.template === "original") {
      return `<h3>${D.escapeHTML(institution)} | ${D.escapeHTML(title)}</h3>`;
    }
    if (state.template === "institutional") {
      return `<h3>${[institution, title].filter(Boolean).map(D.escapeHTML).join(" | ")}</h3>`;
    }
    return `<h3>${D.escapeHTML(title || institution)}</h3>${title && institution ? `<p>${D.escapeHTML(institution)}</p>` : ""}`;
  }

  function renderEducation() {
    return selectedProfileItems("education").map((item) => {
      const advisor = D.educationAdvisor(item, state.lang);
      const heading = profileEntryHeading(item[`institution_${state.lang}`] || item.institution_en,
        item[`degree_${state.lang}`] || item.degree_en);
      return datedEntry(D.profilePeriod(item, state.lang, "day"), heading, `
        ${advisor ? `<p>${t("advisor")}: ${D.escapeHTML(advisor)}</p>` : ""}
        ${D.educationThesisHTML(item, state.lang)}
        ${D.formatGPA(item.gpa) ? `<p class="education-gpa">${D.escapeHTML(D.formatGPA(item.gpa))}</p>` : ""}
      `, true);
    }).join("");
  }

  function renderExperience() {
    return selectedProfileItems("experience").map((item) => datedEntry(
      D.profilePeriod(item, state.lang, "day"), profileEntryHeading(p(item, "institution"), p(item, "title")), "", true
    )).join("");
  }

  function renderProjects() {
    return selectedProjects().map((item) => datedEntry(D.projectPeriod(item), `
        <h3 class="cv-project-heading">
          ${D.escapeHTML(p(item, "title"))}
          <em class="cv-project-funder">${D.escapeHTML(p(item, "funder"))}</em>
        </h3>
    `, `
        <ul class="cv-detail-list">
          ${D.projectNotes(item, state.lang).map((note) => `<li>${D.escapeHTML(note)}</li>`).join("")}
        </ul>
    `, true)).join("");
  }

  function cvPublicationLanguage(item) {
    return item.publication_type.startsWith("international-") ? "en" : state.lang;
  }

  function cvPublicationDateHTML(item) {
    const year = D.publicationYear(item);
    const status = D.publicationStatus(item);
    const label = `(${D.escapeHTML(year || status)})`;
    return !year && status ? `<em>${label}</em>` : label;
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
                  ${D.displayAuthors(item.authors, cvPublicationLanguage(item), false)} ${cvPublicationDateHTML(item)}.
                  “${D.escapeHTML(D.publicationTitle(item, cvPublicationLanguage(item)))}.”
                  <em>${D.escapeHTML(D.publicationReference(item, cvPublicationLanguage(item)))}</em>
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
      `, `
          <p>${D.escapeHTML(p(item, "organization"))}</p>
          ${publications.map((publication) => {
            const language = cvPublicationLanguage(publication);
            return `
              <p class="cv-award-publication">
                ${D.displayAuthors(publication.authors, language, false)} ${cvPublicationDateHTML(publication)}.
                “${D.escapeHTML(D.publicationTitle(publication, language))}.”
                <em>${D.escapeHTML(D.publicationReference(publication, language))}</em>
              </p>
            `;
          }).join("")}
      `);
    }).join("");
  }

  function renderPatents() {
    const selected = selectedProfileItems("patents");
    return D.patentGroups(selected, state.lang).map((group) => {
      return `
        <section class="cv-patent-group" data-patent-type="${group.type}" data-patent-status="${group.status}">
          <h3>${D.escapeHTML(group.title)}</h3>
          ${group.items.map((item) => {
            const title = D.escapeHTML(D.patentTitle(item, state.lang));
            const url = D.patentURL(item);
            const people = D.patentPeopleHTML(item, state.lang);
            const original = state.template === "original";
            const dates = original ? D.patentDate(item) : [
              [item.application_date, "patentFiled"],
              [item.publication_date, "patentPublished"],
              [item.registration_date, "patentGranted"]
            ].filter(([date]) => date).map(([date, label]) => `${t(label)} ${date}`);
            const details = D.patentDetails(original ? item : { ...item, publication_date: "", registration_date: "" }, state.lang);
            return datedEntry(dates, `<h3>${url ? `<a href="${D.escapeHTML(url)}">${title}</a>` : title}</h3>`, `
              ${people ? `<p class="patent-people">${people}</p>` : ""}
              ${details.map((detail) => `<p class="patent-detail">${D.escapeHTML(detail)}</p>`).join("")}
            `);
          }).join("")}
        </section>
      `;
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

  function academicActivityEntry(date, title, detail, stackedPeriod = false) {
    return datedEntry(date, `<h3>${D.escapeHTML(title)}</h3>`, detail ? `<p>${D.escapeHTML(detail)}</p>` : "", stackedPeriod);
  }

  function academicReviewEntry(item) {
    const count = item.completed_dates.length;
    const reviewCount = state.lang === "ko"
      ? `${count}편`
      : `${count} paper${count === 1 ? "" : "s"}`;
    const journal = `<h3>${D.escapeHTML(p(item, "journal"))}</h3>`;
    if (state.template !== "original") {
      return `<article class="cv-entry">${journal}<p>${D.escapeHTML(reviewCount)}</p></article>`;
    }
    return `
      <article class="cv-entry cv-entry-dated">
        <div class="cv-entry-time">${D.escapeHTML(reviewCount)}</div>
        <div class="cv-entry-body">${journal}</div>
      </article>
    `;
  }

  function renderAcademicActivities() {
    const data = state.data.academicActivities;
    const groups = {
      editorial_service: {
        title: t("academicEditorialService"),
        render: (item) => academicActivityEntry(
          academicPeriod(item),
          p(item, "journal"), p(item, "role"),
          true
        )
      },
      professional_service: {
        title: t("academicProfessionalService"),
        render: (item) => academicActivityEntry(
          academicPeriod(item),
          p(item, "organization"), p(item, "role"),
          true
        )
      },
      conference_service: {
        title: t("academicConferenceService"),
        render: (item) => academicActivityEntry(
          academicDateRange(item),
          p(item, "conference"), p(item, "role"),
          Boolean(item.end_date)
        )
      },
      invited_talks: {
        title: t("academicInvitedTalk"),
        render: (item) => academicActivityEntry(
          academicDate(item.date),
          p(item, "event"), p(item, "topic")
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
    `, `
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
    `)).join("");
  }

  function renderCertifications() {
    return selectedProfileItems("certifications").map((item) => datedEntry(item.date, `
        <h3>${D.escapeHTML(item[`name_${state.lang}`] || item.name_en)}</h3>
    `, `
        <p>${D.escapeHTML(item[`issuer_${state.lang}`] || item.issuer_en)}</p>
    `)).join("");
  }

  function renderScholarships() {
    const entries = selectedProfileItems("scholarships").map((item, index) => datedEntry(p(item, "period"), `
        <h3>${D.escapeHTML(p(item, "name"))}</h3>
    `, `
        ${p(item, "summary") ? `<p>${D.escapeHTML(p(item, "summary"))}</p>` : ""}
        <ul class="cv-detail-list">
          <li>
            <strong>${D.escapeHTML(t("scholarshipAmount"))}:</strong>
            <span data-scholarship-amount="${index}" aria-live="polite">${D.escapeHTML(D.formatScholarshipAmount(item.amount, state.lang))}</span>
          </li>
        </ul>
    `)).join("");
    return entries + (state.lang === "en" && entries ? `
      <p class="scholarship-conversion-note cv-scholarship-conversion-note" hidden aria-live="polite"></p>
    ` : "");
  }

  async function updateScholarshipAmounts(items, renderVersion, language) {
    const targets = $$('[data-scholarship-amount]');
    if (!targets.length) return;
    const amounts = await Promise.all(items.map((item) => D.resolveScholarshipAmountDetails(item.amount, language)));
    if (state.scholarshipRenderVersion !== renderVersion || state.lang !== language) return;
    targets.forEach((target) => {
      const amount = amounts[Number(target.dataset.scholarshipAmount)];
      if (amount && target.isConnected) target.textContent = amount.text;
    });
    const note = $(".cv-scholarship-conversion-note");
    if (note) {
      note.textContent = D.formatScholarshipConversionNote(amounts.map((amount) => amount.conversion));
      note.hidden = !note.textContent;
    }
  }

  function renderSkills() {
    return selectedProfileItems("skills").map((item) => `
      <article class="cv-entry">
        <h3>${D.escapeHTML(item.name)}</h3>
        <p>${D.escapeHTML(item[`detail_${state.lang}`] || item.detail_en)}</p>
      </article>
    `).join("");
  }

  function updateHeaderAlignment() {
    alignHeader($(".cv-paper-header"));
  }

  function alignHeader(header) {
    if (state.template !== "original" || !header) return;
    const photo = $(".cv-portrait", header);
    const copy = $(".cv-identity-copy", header);
    const identity = $(".cv-identity", header);
    if (!copy || !identity || identity.getBoundingClientRect().width <= 0) return;
    const contact = $(".cv-contact", header);
    const name = $("h1", copy);
    const lastLine = $(".cv-subtitle > span:last-child", copy) || name;
    const context = document.createElement("canvas").getContext("2d");
    const textBounds = (element) => {
      const style = getComputedStyle(element);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText(element.textContent);
      const baselines = $$(".cv-text-baseline", element);
      return {
        top: baselines[0].getBoundingClientRect().top - metrics.actualBoundingBoxAscent,
        bottom: baselines.at(-1).getBoundingClientRect().top + metrics.actualBoundingBoxDescent
      };
    };
    const sizePhoto = (top) => {
      if (!photo?.naturalWidth) return;
      photo.hidden = false;
      const available = identity.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(identity).columnGap) || 0;
      // Keep a stable portrait size, shrinking only to fit the available width.
      const preferredHeight = parseFloat(getComputedStyle(photo).getPropertyValue("--cv-portrait-height")) || 120;
      const maximumWidth = Math.max(0, available * 0.5 - gap);
      const maximumHeight = maximumWidth * photo.naturalHeight / photo.naturalWidth;
      photo.style.height = `${Math.max(0, Math.min(preferredHeight, maximumHeight))}px`;
      photo.style.marginTop = `${top - identity.getBoundingClientRect().top}px`;
    };
    copy.style.removeProperty("height");
    copy.style.removeProperty("margin-top");
    contact?.style.removeProperty("min-height");
    const columns = getComputedStyle(header).gridTemplateColumns.split(/\s+/);
    if (!contact || columns.length === 1) {
      // Stacked headers keep the portrait beside the name and affiliation.
      for (let pass = 0; pass < 2; pass += 1) {
        sizePhoto(textBounds(name).top);
      }
      return;
    }
    const contactBounds = () => {
      const first = $(".cv-contact-link:first-child", contact);
      const last = $(".cv-contact-link:last-child", contact);
      return {
        top: Math.min(textBounds($(".cv-contact-text", first)).top, $(".cv-contact-icon", first).getBoundingClientRect().top),
        bottom: Math.max(textBounds($(".cv-contact-text", last)).bottom, $(".cv-contact-icon", last).getBoundingClientRect().bottom)
      };
    };
    if (contact.children.length === 1) {
      // One contact row cannot stretch to the identity's full text height.
      copy.style.marginTop = `${contactBounds().top - textBounds(name).top}px`;
      for (let pass = 0; pass < 2; pass += 1) {
        sizePhoto(textBounds(name).top);
      }
      return;
    }
    // Reserve enough room for unchanged text sizes when contacts are short.
    for (let pass = 0; pass < 8; pass += 1) {
      const bounds = contactBounds();
      sizePhoto(bounds.top);
      const minimum = textBounds(lastLine).bottom - textBounds(name).top;
      if (minimum <= bounds.bottom - bounds.top + 0.5) break;
      const rect = contact.getBoundingClientRect();
      const leading = bounds.top - rect.top;
      const trailing = rect.bottom - bounds.bottom;
      contact.style.minHeight = `${minimum + leading + trailing}px`;
    }
    const bounds = contactBounds();
    sizePhoto(bounds.top);
    const rect = copy.getBoundingClientRect();
    const leading = textBounds(name).top - rect.top;
    const trailing = rect.bottom - textBounds(lastLine).bottom;
    copy.style.height = `${Math.max(rect.height, bounds.bottom - bounds.top + leading + trailing)}px`;
    copy.style.marginTop = `${bounds.top - identity.getBoundingClientRect().top - leading}px`;
  }

  function bindHeaderAlignment() {
    const photo = $(".cv-portrait");
    if (photo) {
      photo.addEventListener("load", updateHeaderAlignment);
      photo.addEventListener("error", () => {
        photo.remove();
        updateHeaderAlignment();
      });
    }
    state.layoutObserver = new ResizeObserver(() => window.requestAnimationFrame(updateHeaderAlignment));
    state.layoutObserver.observe($(".cv-identity-copy"));
    const contact = $(".cv-contact");
    if (contact) state.layoutObserver.observe(contact);
    updateHeaderAlignment();
  }

  function institutionalSections(sections) {
    const first = sections.findIndex(({ name }) => name === "education" || name === "experience");
    const pair = first === -1 ? [] : sections.slice(first, first + 2);
    const canPair = pair.length === 2 && pair.every(({ name }) =>
      (name === "education" || name === "experience") && selectedProfileItems(name).length <= 3
    );
    if (canPair) {
      sections.splice(first, 2, { html: `<div class="cv-institutional-pair">${pair.map(({ html }) => html).join("")}</div>` });
    }
    return sections;
  }

  function lineCount(element) {
    return Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight));
  }

  function fitsInstitutionalColumns(candidate) {
    const width = candidate.getBoundingClientRect().width;
    if (width < 760) return false;

    const measurement = candidate.cloneNode(true);
    measurement.classList.add("cv-layout-measure", "cv-two-columns");
    measurement.style.width = `${width}px`;
    measurement.inert = true;
    candidate.after(measurement);
    const titlesFit = $$(".cv-entry h3", measurement).every((title) => lineCount(title) <= 2);
    const heights = Array.from(measurement.children, (item) => item.getBoundingClientRect().height);
    const fits = measurement.classList.contains("cv-institutional-pair")
      ? Math.max(...heights) <= 340 && Math.abs(heights[0] - heights[1]) <= 240
        && $$(".cv-entry", measurement).every((entry) => $$("p", entry).reduce((sum, detail) => sum + lineCount(detail), 0) <= 4)
      : heights.every((height) => height <= 180);
    measurement.remove();
    return titlesFit && fits;
  }

  function updateInstitutionalLayout() {
    if (state.template !== "institutional") return;
    $$(".cv-institutional-pair, .cv-institutional-software").forEach((candidate) => {
      candidate.classList.toggle("cv-two-columns", fitsInstitutionalColumns(candidate));
    });
  }

  function bindLayout(paper) {
    state.layoutObserver?.disconnect();
    if (state.template === "original") {
      bindHeaderAlignment();
    } else if (state.template === "institutional") {
      let previousWidth = 0;
      state.layoutObserver = new ResizeObserver(([entry]) => {
        if (entry.contentRect.width === previousWidth) return;
        previousWidth = entry.contentRect.width;
        window.requestAnimationFrame(updateInstitutionalLayout);
      });
      state.layoutObserver.observe(paper);
    }
  }

  function render() {
    const renderVersion = ++state.scholarshipRenderVersion;
    const renderLanguage = state.lang;
    const profile = state.data.profile;
    const identity = profile.identity;
    const name = D.personName(identity, state.lang);
    const affiliation = identity[`affiliation_${state.lang}`] || identity.affiliation_en;
    const profileTitle = p(profile.profile_card || {}, "title");
    const subtitle = [
      affiliation ? `<span class="cv-affiliation-name"><span class="cv-text-baseline" aria-hidden="true"></span>${D.escapeHTML(affiliation)}<span class="cv-text-baseline" aria-hidden="true"></span></span>` : "",
      profileTitle ? `<span class="cv-profile-title"><span class="cv-text-baseline" aria-hidden="true"></span>${D.escapeHTML(profileTitle)}<span class="cv-text-baseline" aria-hidden="true"></span></span>` : ""
    ].filter(Boolean).join("");
    const profileMedia = profile.profile_card?.media;
    const portrait = state.template === "original" && D.contentMediaType(profileMedia) === "image"
      ? D.contentMediaPath(profileMedia) : "";
    const contacts = D.profileContacts(profile, state.lang).map((item) => ({
      ...item, icon: item.icon === "orcid" ? "orcid-monochrome" : item.icon
    }));
    document.title = name;

    const sectionRenderers = {
      experience: renderExperience,
      education: renderEducation,
      projects: renderProjects,
      publications: renderPublications,
      software: renderSoftware,
      awards: renderAwards,
      academic_activities: renderAcademicActivities,
      patents: renderPatents,
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
        return content.trim() ? { name: sectionName, html: section(sectionName, content) } : null;
      })
      .filter(Boolean);

    const paper = $("#cv-paper");
    const displayedSections = state.template === "institutional" ? institutionalSections(sections) : sections;
    paper.dataset.cvTemplate = state.template;
    paper.innerHTML = `
      <header class="cv-paper-header${contacts.length ? "" : " cv-paper-header-no-contact"}">
        <div class="cv-identity">
          ${portrait ? `<img class="cv-portrait" src="${D.escapeHTML(portrait)}" alt="${D.escapeHTML(name)}" hidden>` : ""}
          <div class="cv-identity-copy">
            <h1><span class="cv-text-baseline" aria-hidden="true"></span>${D.escapeHTML(name)}<span class="cv-text-baseline" aria-hidden="true"></span></h1>
            ${subtitle ? `<p class="cv-subtitle cv-affiliation">${subtitle}</p>` : ""}
          </div>
        </div>
        ${contacts.length ? `<div class="cv-contact">
          ${contacts.map((item) => `
            <${item.url ? "a" : "div"} class="cv-contact-link"${item.url ? ` href="${D.escapeHTML(item.url)}"` : ""}>
              ${state.template === "original" ? `<span class="cv-contact-icon link-icon-mask" style="--link-icon-url: url('${D.escapeHTML(new URL(`app/assets/icons/links/${item.icon}.svg`, document.baseURI).href)}')" aria-hidden="true"></span>` : ""}
              <span class="cv-contact-text"><span class="cv-text-baseline" aria-hidden="true"></span>${D.escapeHTML(item.text)}<span class="cv-text-baseline" aria-hidden="true"></span></span>
            </${item.url ? "a" : "div"}>
          `).join("")}
        </div>` : ""}
      </header>
      ${displayedSections.map(({ html }) => html).join("")}
    `;
    if (state.template === "institutional") {
      const software = $(".cv-section-software > .cv-section-content", paper);
      const items = selectedSoftware();
      if (software && items.length >= 2 && items.length <= 4 && items.every((item) => D.softwareNotes(item, state.lang).length <= 2)) {
        software.classList.add("cv-institutional-software");
      }
    }
    bindLayout(paper);
    updateScholarshipAmounts(selectedProfileItems("scholarships"), renderVersion, renderLanguage);
  }

  function bindEvents() {
    $$("[data-lang-switch]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.langSwitch));
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "siteLanguage" && ["en", "ko"].includes(event.newValue) && event.newValue !== state.lang) setLanguage(event.newValue);
    });
    $("#download-pdf").addEventListener("click", async () => {
      const photo = $(".cv-portrait");
      await Promise.all([document.fonts.ready, photo?.decode().catch(() => {})]);
      window.print();
    });
    const paper = $("#cv-paper");
    window.addEventListener("beforeprint", () => window.SiteCVPrint.prepare(paper, t("continued"), alignHeader));
    window.addEventListener("afterprint", () => {
      window.SiteCVPrint.clear(paper);
      updateHeaderAlignment();
    });
    const updateFontLayout = () => {
      updateHeaderAlignment();
      updateInstitutionalLayout();
    };
    document.fonts.ready.then(updateFontLayout);
    document.fonts.addEventListener("loadingdone", updateFontLayout);
  }

  async function init() {
    state.lang = initialLanguage();
    setLanguage(state.lang, { skipURL: true });
    bindEvents();
    try {
      state.data = await D.loadAll();
      D.applyColorTheme(state.data.settings);
      const { cv_template: template, cv_color_mode: colorMode } = state.data.settings;
      state.template = CV_TEMPLATES.includes(template) ? template : "original";
      document.documentElement.dataset.cvColorMode = colorMode === "monotone" ? "monotone" : "color";
      render();
    } catch (error) {
      console.error(error);
      $("#cv-paper").innerHTML = `<p class="empty-state">${D.escapeHTML(t("loadError"))}</p>`;
    }
  }

  init();
}());
