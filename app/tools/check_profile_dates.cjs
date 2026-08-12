"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const readJSON = (name) => JSON.parse(read(name));
const versions = require("../assets/js/data-version.js");
const legacyFields = ["period", "period_en", "period_ko", "period_kr"];

function environment(profile = readJSON("data/profile.json")) {
  const window = {
    SiteDataVersion: versions,
    PublicationBibliography: require("../assets/js/publication-bibliography.js"),
  };
  const fetch = async (name) => ({
    ok: true,
    json: async () => structuredClone(name === "data/profile.json" ? profile : readJSON(name)),
  });
  vm.runInNewContext(read("app/assets/js/data.js"), { window, fetch, Intl, Date, URL });
  return window.SiteData;
}

function loadItem(section, item) {
  const profile = readJSON("data/profile.json");
  profile[section] = [item];
  return environment(profile).loadAll();
}

function renderers(D, name) {
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "" });
      return nodes.get(selector);
    },
  };
  const window = { SiteData: D, PublicationCitations: { createClient: () => ({}) } };
  const result = name === "app"
    ? 'renderEducation(); renderExperience(); return [document.querySelector("#education-list").innerHTML, document.querySelector("#experience-list").innerHTML];'
    : "return [renderEducation(), renderExperience()];";
  const source = read(`app/assets/js/${name}.js`);
  const instrumented = source.replace(/  init\(\);\s*\}\(\)\);\s*$/, `
  window.renderProfileDatesForTest = (data, lang) => {
    state.data = data;
    state.lang = lang;
    ${result}
  };
}());`);
  assert.notEqual(instrumented, source, `${name}: replace startup with a renderer test entry point`);
  vm.runInNewContext(instrumented, { window, document, URL, URLSearchParams, Intl, Date });
  return window.renderProfileDatesForTest;
}

async function main() {
  const D = environment();
  const actual = await D.loadAll();
  const closed = { start_date: "2020-03-31", end_date: "2026-02-28" };
  const open = { start_date: "2026-05-17", end_date: "" };
  for (const lang of ["ko", "en"]) {
    assert.equal(D.profilePeriod(closed, lang), "2020.03.–2026.02.");
    assert.equal(D.profilePeriod(open, lang), `2026.05.–${lang === "ko" ? "현재" : "present"}`);
    assert.equal(D.profilePeriod(closed, lang, "day"), "2020.03.31.–2026.02.28.");
    assert.equal(D.profilePeriod(open, lang, "day"), `2026.05.17.–${lang === "ko" ? "현재" : "present"}`);
  }
  assert.equal(D.profilePeriod(open), "2026.05.–present");

  for (const section of ["education", "experience"]) {
    for (const [start_date, end_date] of [
      ["2024-02-29", "2024-03-31"],
      ["2026-05-17", "2026-05-17"],
      ["2026-05-17", ""],
    ]) {
      const loaded = await loadItem(section, { start_date, end_date });
      assert.equal(loaded.profile[section][0].start_date, start_date, "Loading retains the full start date");
      assert.equal(loaded.profile[section][0].end_date, end_date, "Loading retains the full end date");
    }
    await assert.rejects(loadItem(section, { start_date: open.start_date }), /end_date/, "An ongoing item must explicitly store an empty end_date");
    for (const invalid of ["", "2023-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-05", "0000-01-01", " 2026-05-01", "2026-05-01 ", null, false, 20260501]) {
      await assert.rejects(loadItem(section, { start_date: invalid, end_date: "" }), /start_date/);
      if (invalid !== "") {
        await assert.rejects(loadItem(section, { start_date: "0001-01-01", end_date: invalid }), /end_date/);
      }
    }
    await assert.rejects(loadItem(section, { end_date: "2026-05-17" }), /start_date/);
    await assert.rejects(loadItem(section, { start_date: "2026-05-17", end_date: "2026-05-16" }), /end_date/);
    for (const [field, period, expectedEnd] of [
      ["period", "2022.03.–2026.02.", "2026-02-01"],
      ["period_en", "2022.03–Present", ""],
      ["period_ko", "2022.03–현재", ""],
      ["period_kr", "2022.03–현재", ""],
    ]) {
      const loaded = await loadItem(section, { [field]: period });
      const item = loaded.profile[section][0];
      assert.equal(item.start_date, "2022-03-01", "Legacy months become first-of-month dates");
      assert.equal(item.end_date, expectedEnd);
      assert.ok(legacyFields.every((key) => !Object.hasOwn(item, key)), "Loaded records only expose date fields");
    }
    const mixed = await loadItem(section, {
      ...closed,
      period: "1990.01.–1995.01.", period_en: "1990.01–Present", period_ko: "1990.01–현재", period_kr: "1990.01–현재",
    });
    assert.equal(mixed.profile[section][0].start_date, closed.start_date);
    assert.equal(mixed.profile[section][0].end_date, closed.end_date);
    assert.ok(legacyFields.every((key) => !Object.hasOwn(mixed.profile[section][0], key)));
    const markedInvalid = { start_date: "", end_date: "", period: "2022.03.–2026.02." };
    await assert.rejects(loadItem(section, markedInvalid), /start_date/, "Legacy text cannot override explicitly supplied dates");
    for (const item of actual.profile[section]) {
      assert.match(item.start_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof item.end_date, "string");
      assert.ok(legacyFields.every((key) => !Object.hasOwn(item, key)), "Current data stores date fields only");
    }
  }

  const closedItem = {
    ...closed, degree_en: "Degree", degree_ko: "학위", institution_en: "University", institution_ko: "대학교",
    title_en: "Researcher", title_ko: "연구원",
  };
  const openItem = { ...closedItem, ...open };
  const hiddenItem = { ...closedItem, start_date: "1991-09-13", end_date: "1999-12-29", visible_in_CV: false };
  const fixture = { ...actual, profile: { ...actual.profile, education: [closedItem, openItem, hiddenItem], experience: [closedItem, openItem, hiddenItem] } };
  for (const name of ["app", "cv"]) {
    const render = renderers(D, name);
    for (const lang of ["ko", "en"]) {
      for (const html of render(fixture, lang)) {
        const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
        assert.ok(text.includes("2020.03.") && text.includes("2026.02."), `${name}: closed periods show dates`);
        assert.ok(text.includes("2026.05.") && text.includes(lang === "ko" ? "현재" : "present"), `${name}: blank end dates use the selected language`);
        assert.ok(!text.includes("Present"), `${name}: the English current-date label is lowercase`);
        assert.ok(!text.includes("2020-03-31") && !text.includes("2026-02-28"), `${name}: dates use the display format`);
        assert.equal(text.includes("2020.03.31."), name === "cv", `${name}: start days appear in the CV only`);
        assert.equal(text.includes("2026.02.28."), name === "cv", `${name}: end days appear in the CV only`);
        assert.equal(text.includes("2026.05.17."), name === "cv", `${name}: ongoing start days appear in the CV only`);
        assert.equal(text.includes("1991.09."), name === "app", `${name}: CV visibility is preserved`);
      }
    }
  }
  console.log("Profile dates: education/experience date validation, website month/CV day display, localized open periods and legacy migration checked.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
