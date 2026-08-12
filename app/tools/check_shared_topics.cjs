"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "app/assets/js/data.js"), "utf8");

function environment(overrides = {}) {
  const window = { PublicationBibliography: require("../assets/js/publication-bibliography.js") };
  const fetch = async (name) => ({ ok: true, json: async () => structuredClone(overrides[name]
    ?? JSON.parse(fs.readFileSync(path.join(root, name), "utf8"))) });
  vm.runInNewContext(source, { window, fetch, Intl, Date, URL });
  return window.SiteData;
}

function contrastRatio(first, second) {
  const luminance = (color) => {
    const channels = color.match(/[0-9a-f]{2}/gi).map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

async function main() {
  const D = environment();
  const expectedForegrounds = [
    ["#ffffff", "#000000"], ["#000000", "#ffffff"],
    ["#B8DFF4", "#000000"], ["#f4c7d9", "#000000"], ["#315f49", "#ffffff"],
    ["#757575", "#ffffff"], ["#767676", "#000000"],
    ["#ff0000", "#000000"], ["#00ff00", "#000000"], ["#0000ff", "#ffffff"],
  ];
  expectedForegrounds.forEach(([background, expected]) => {
    assert.equal(D.topicForegroundColor(background), expected, `${background}: wrong foreground`);
  });
  // Cover dark, pastel, saturated and near-threshold RGB combinations.
  const channels = [0, 32, 64, 96, 128, 160, 192, 224, 255];
  for (const red of channels) for (const green of channels) for (const blue of channels) {
    const background = `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    const foreground = D.topicForegroundColor(background);
    assert.ok(["#000000", "#ffffff"].includes(foreground));
    const contrast = contrastRatio(background, foreground);
    assert.ok(contrast >= 4.5, `${background}: foreground contrast ${contrast.toFixed(3)} is below 4.5`);
    const alternative = foreground === "#000000" ? "#ffffff" : "#000000";
    assert.ok(contrast >= contrastRatio(background, alternative), `${background}: foreground does not maximize contrast`);
  }
  for (const value of [undefined, null, 0, {}, "", "#fff", "#fffffff", "#gg0000", " #ffffff", "red", "hsl(150 44% 38%)"]) {
    assert.equal(D.topicForegroundColor(value), "#ffffff", "invalid and automatic HSL colors retain white foreground");
  }
  const first = { id: "shared", label_en: "Shared", label_ko: "Shared KO", project_extra: true };
  const legacy = {
    project_themes: [first],
    publication_topics: [{ ...first, color: "#123aBc", paper_extra: true }, { id: "paper-only", label_en: "Paper only", label_ko: "Paper only KO" }],
    project_theme_fallback: { label_en: "Other", label_ko: "Other KO" },
    publication_topic_fallback: { label_en: "Other", label_ko: "Other KO" }
  };
  D.normalizeTopicSettings(legacy);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.topics.map((item) => item.id))), ["shared", "paper-only"]);
  assert.equal(legacy.topics[0].color, "#123aBc");
  assert.equal(legacy.topics[0].project_extra, true);
  assert.equal(legacy.topics[0].paper_extra, true);
  assert.ok(!Object.hasOwn(legacy, "project_themes") && !Object.hasOwn(legacy, "publication_topics"));
  assert.equal(D.publicationTopicLabel({ topic: "shared" }, legacy, "en"), D.projectThemeLabel({ theme: "shared" }, legacy, "en"));
  assert.equal(D.topicColor(legacy.topics[0], 0), "#123aBc");
  assert.throws(() => D.normalizeTopicSettings({ topics: null, topic_fallback: {} }), /topics/);
  assert.throws(() => D.normalizeTopicSettings({ project_themes: [first, first], publication_topics: [], project_theme_fallback: {} }), /Duplicate|duplicate/);
  const data = await D.loadAll();
  const ids = new Set(data.settings.topics.map((item) => item.id));
  assert.ok(data.projects.every((item) => ids.has(item.theme)));
  assert.ok(data.publications.every((item) => !item.topic || ids.has(item.topic)));
  const settings = structuredClone(data.settings);
  settings.topics.push({ id: "cross-content", label_en: "Cross content", label_ko: "Cross content KO" });
  const projects = structuredClone(data.projects);
  projects[0].theme = "cross-content";
  const publications = structuredClone(JSON.parse(fs.readFileSync(path.join(root, "data/publications.json"), "utf8")));
  publications[0].topic = "cross-content";
  const crossContent = environment({ "data/settings.json": settings, "data/projects.json": projects, "data/publications.json": publications });
  await crossContent.loadAll();
  projects[0].theme = "missing-shared-topic";
  await assert.rejects(environment({ "data/settings.json": settings, "data/projects.json": projects }).loadAll(), /theme|topic/i);
  console.log("Shared topics: legacy merge, colors, readable timeline labels, names, cross-content references and current data checked.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
