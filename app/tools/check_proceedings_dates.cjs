"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const readJSON = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const versions = require("../assets/js/data-version.js");
const bibliography = require("../assets/js/publication-bibliography.js");
const source = fs.readFileSync(path.join(root, "app/assets/js/data.js"), "utf8");
const actualPublications = versions.decode(readJSON("data/publications.json"), "publications.json", { collection: true }).data;
const conferencePublication = actualPublications.findIndex((item) => item.publication_type.endsWith("-conference") && item.conference_id);
const journalPublication = actualPublications.findIndex((item) => item.publication_type.endsWith("-journal") && item.journal_id);
assert.ok(conferencePublication >= 0 && journalPublication >= 0, "Date checks require both conference and journal fixtures");
const conferenceId = actualPublications[conferencePublication].conference_id;

function environment(settings = readJSON("data/settings.json"), publications = actualPublications) {
  const window = { SiteDataVersion: versions, PublicationBibliography: bibliography };
  const overrides = { "data/settings.json": settings, "data/publications.json": publications };
  const fetch = async (name) => ({
    ok: true,
    json: async () => structuredClone(Object.hasOwn(overrides, name) ? overrides[name] : readJSON(name)),
  });
  vm.runInNewContext(source, { window, fetch, Intl, Date, URL });
  return window.SiteData;
}

function fixture(proceedingsDate, { missing = false } = {}) {
  const settings = readJSON("data/settings.json");
  const conference = settings.conferences.find((item) => item.id === conferenceId);
  assert.ok(conference, "The conference fixture must refer to an existing catalog item");
  conference.start_date = "2026-10-01";
  conference.end_date = "2026-10-03";
  if (missing) delete conference.proceedings_date;
  else conference.proceedings_date = proceedingsDate;
  return { settings, conference };
}

async function main() {
  for (const value of ["2024-02-29", "2026-11-25", "0001-01-01", "9999-12-31"]) {
    const { settings } = fixture(value);
    const loaded = await environment(settings).loadAll();
    assert.equal(loaded.settings.conferences.find((item) => item.id === conferenceId).proceedings_date, value);
    assert.equal(loaded.publications[conferencePublication].date, value, "Conference bibliography uses the complete proceedings date");
  }
  for (const [legacy, expected] of [["2026", "2026-01-01"], ["2024-02", "2024-02-01"]]) {
    const { settings, conference } = fixture(legacy);
    const loaded = await environment(settings).loadAll();
    assert.equal(loaded.settings.conferences.find((item) => item.id === conferenceId).proceedings_date, expected, "Legacy dates use the first day of the known period");
    assert.equal(loaded.publications[conferencePublication].date, expected, "Derived publication dates use normalized catalog data");
    assert.equal(conference.proceedings_date, legacy, "Loading does not rewrite the fetched source object");
  }
  for (const invalid of ["2023-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-02-30", "0000-01-01", "0000", "0000-02", "2026-13", "2026-2-01", "2026.02.01", "today", null, false, true, 20261125, [], {}]) {
    const { settings } = fixture(invalid);
    await assert.rejects(environment(settings).loadAll(), /proceedings_date/, `Invalid proceedings date ${JSON.stringify(invalid)} must be rejected`);
  }
  for (const missing of [false, true]) {
    const { settings } = fixture("", { missing });
    const loaded = await environment(settings).loadAll();
    const conference = loaded.settings.conferences.find((item) => item.id === conferenceId);
    assert.equal(Object.hasOwn(conference, "proceedings_date"), !missing, "Optional dates preserve their existing presence");
    if (!missing) assert.equal(conference.proceedings_date, "");
    assert.equal(loaded.publications[conferencePublication].date, "2026-10-03", "Missing or blank proceedings dates fall back to the conference end date");
  }
  for (const [issue_date, online_date, expected] of [
    ["2026", "2025-11", "2026"],
    ["2026-04", "2025-11-25", "2026-04"],
    ["", "2026", "2026"],
    ["", "2026-04", "2026-04"],
  ]) {
    const publications = structuredClone(actualPublications);
    Object.assign(publications[journalPublication], { issue_date, online_date });
    const { settings } = fixture("2026-11-25");
    const loaded = await environment(settings, publications).loadAll();
    assert.equal(loaded.publications[journalPublication].date, expected, "Journal dates retain their original precision and precedence");
  }
  for (const partial of ["2026", "2026-04"]) {
    const settings = { conferences: [{ id: "legacy", proceedings_date: partial, end_date: "2025-12-31" }] };
    const publication = { publication_type: "international-conference", conference_id: "legacy" };
    assert.equal(bibliography.publicationDate(publication, settings), partial, "The low-level bibliography API retains legacy partial-date support");
    assert.equal(bibliography.resolvePublication(publication, settings).date, partial);
  }
  const actualSettings = readJSON("data/settings.json");
  for (const conference of actualSettings.conferences) {
    if (conference.proceedings_date) assert.match(conference.proceedings_date, /^\d{4}-\d{2}-\d{2}$/, "Repository proceedings dates use complete dates");
  }
  console.log("Proceedings dates: complete date validation, legacy precision normalization, optional dates, conference publication fallback and unchanged journal precision checked.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
