"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const T = require("../assets/js/color-themes.js");
const source = read("app/assets/js/color-themes.js");
const parseCSS = (value) => Object.fromEntries([...value.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
const websiteCSS = read("app/assets/css/styles.css");
const websiteRoot = parseCSS(websiteCSS.match(/:root\s*\{([\s\S]*?)\}/)[1]);
const expectedIDs = ["sage", "ocean", "violet", "rose", "sand", "slate", "mint", "teal", "sky", "indigo", "amber", "graphite"];
const editorOnly = ["danger-strong", "danger-soft", "danger-line", "disabled", "info", "info-soft"];
const deepFreeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
function element() {
  const values = {}, priorities = {};
  return { dataset: {}, values, priorities, style: { setProperty: (name, value, priority = "") => {
    values[name] = value;
    priorities[name] = priority;
  } } };
}

assert.deepEqual(T.presets.map((preset) => preset.id), expectedIDs);
assert.deepEqual(T.customIDs, ["custom-1", "custom-2", "custom-3"]);
assert.equal(T.fields.length, 26);
assert.equal(new Set(T.fields.map((field) => field.key)).size, 26);
for (const preset of T.presets) {
  assert.equal(Object.keys(preset.colors).length, 26);
  assert.equal(preset.dark, ["slate", "graphite"].includes(preset.id));
  const css = { ...websiteRoot, ...parseCSS(websiteCSS.match(new RegExp(':root\\[data-color-theme="' + preset.id + '"\\]\\s*\\{([\\s\\S]*?)\\}'))[1]) };
  const target = element();
  const result = T.applyWebsite({ color_theme: preset.id }, target);
  assert.equal(result.id, preset.id);
  assert.equal(result.baseTheme, preset.id);
  assert.equal(result.custom, false);
  assert.equal(result.scheme, preset.dark ? "dark" : "light");
  for (const { key } of T.fields) {
    assert.match(preset.colors[key], /^#[0-9a-f]{6}$/);
    if (!editorOnly.includes(key)) assert.equal(preset.colors[key], css[key], `${preset.id}: ${key} differs from existing website`);
    assert.equal(target.values[`--${key}`], preset.colors[key]);
  }
  for (const key of ["shadow-rgb", "ink-shadow-rgb", "cv-shadow-rgb", "media-shadow-rgb", "lightbox-bg", "lightbox-backdrop", "lightbox-ink", "media-control-bg", "media-control-hover", "video-bg", "shadow"]) {
    assert.equal(target.values[`--${key}`], css[key], `${preset.id}: ${key} changed`);
  }
}
assert.equal(T.presets[0].colors["danger-strong"], "#6f211b");
assert.equal(T.presets[0].colors["danger-soft"], "#fbeae7");
assert.equal(T.presets[5].colors["danger-soft"], "#45282c");
assert.equal(T.presets[5].colors["danger-line"], "#865158");
assert.equal(T.presets[11].colors["danger-soft"], "#482a29");
assert.equal(T.presets[11].colors["info-soft"], "#233c4d");

for (const value of [undefined, null, "", "unknown", "__proto__", {}, 7]) assert.equal(T.normaliseThemeID(value), "sage");
for (const id of [...expectedIDs, ...T.customIDs]) assert.equal(T.normaliseThemeID(id), id);
const raw = deepFreeze({
  "custom-1": { name: "  내 테마  ", base_theme: "slate", colors: { bg: "#ABC123", accent: "#12", ink: "red; display:none", unknown_color: "keep" }, future: { nested: ["retain"] } },
  "custom-2": { name: "", base_theme: "not-a-theme", colors: { focus: "#123456" } }
});
const original = JSON.stringify(raw);
const normalized = T.normaliseCustomThemes(raw);
assert.deepEqual(Object.keys(normalized), T.customIDs);
assert.equal(normalized["custom-1"].name, "  내 테마  ");
assert.equal(normalized["custom-1"].colors.accent, "#12");
assert.equal(normalized["custom-1"].colors.ink, "red; display:none");
assert.equal(normalized["custom-1"].colors.unknown_color, "keep");
assert.equal(normalized["custom-2"].name, "");
assert.equal(normalized["custom-2"].base_theme, "not-a-theme");
assert.deepEqual(normalized["custom-3"], { name: "사용자 지정 3", base_theme: "sage", colors: {} });
normalized["custom-1"].future.nested.push("local edit");
assert.equal(JSON.stringify(raw), original);
const settings = deepFreeze({ color_theme: "custom-1", custom_themes: raw });
const custom = T.resolve(settings);
assert.equal(custom.label, "내 테마");
assert.equal(custom.id, "custom-1");
assert.equal(custom.baseTheme, "slate");
assert.equal(custom.custom, true);
assert.equal(custom.scheme, "dark");
assert.equal(custom.colors.bg, "#abc123");
assert.equal(custom.colors.accent, T.presets[5].colors.accent);
assert.equal(custom.colors.ink, T.presets[5].colors.ink);
assert.equal(Object.keys(custom.colors).length, 26);
assert.equal(JSON.stringify(raw), original);
const invalidBase = T.resolve(settings, "custom-2");
assert.equal(invalidBase.baseTheme, "sage");
assert.equal(invalidBase.scheme, "light");
assert.equal(invalidBase.label, "사용자 지정 2");
assert.equal(invalidBase.colors.focus, "#123456");
for (const slot of T.customIDs) {
  const resolved = T.resolve({ color_theme: slot });
  assert.equal(resolved.custom, true);
  assert.deepEqual(resolved.colors, T.presets[0].colors);
}

// Repeated changes must replace every managed variable, including derived values.
const finalWeb = element(), freshWeb = element(), finalEditor = element(), freshEditor = element();
const customLight = { color_theme: "custom-1", custom_themes: { "custom-1": { base_theme: "ocean", colors: { ink: "#123456", "on-ink": "#fefcfa", "accent-strong": "#234567" } } } };
const customDark = { color_theme: "custom-2", custom_themes: { "custom-2": { base_theme: "graphite", colors: { bg: "#08090a", "surface-muted": "#202122", "surface-strong": "#303132", ink: "#f8f9fa", "line-strong": "#778899" } } } };
for (const value of [{ color_theme: "slate" }, customLight, { color_theme: "graphite" }, customDark, { color_theme: "sage" }]) {
  T.applyWebsite(value, finalWeb);
  T.applyEditor(value, finalEditor);
  const scheme = T.resolve(value).scheme;
  assert.equal(finalWeb.dataset.colorScheme, scheme, `${value.color_theme}: website scheme marker is stale`);
  assert.equal(finalEditor.dataset.colorScheme, scheme, `${value.color_theme}: editor scheme marker is stale`);
}
T.applyWebsite({ color_theme: "sage" }, freshWeb);
T.applyEditor({ color_theme: "sage" }, freshEditor);
assert.deepEqual(finalWeb.values, freshWeb.values);
assert.deepEqual(finalEditor.values, freshEditor.values);
assert.equal(finalWeb.dataset.colorTheme, "sage");
assert.equal(finalEditor.dataset.colorTheme, "sage");
assert.equal(finalWeb.dataset.colorScheme, "light");
assert.equal(finalEditor.dataset.colorScheme, "light");
assert.equal(finalWeb.values["color-scheme"], "light");
assert.equal(finalEditor.values["color-scheme"], "light");
const webLight = element(), webDark = element(), editorDark = element();
T.applyWebsite(customLight, webLight);
assert.equal(webLight.values["--shadow-rgb"], "18 52 86");
assert.equal(webLight.values["--video-bg"], "#234567");
assert.equal(webLight.values["--lightbox-ink"], "#fefcfa");
T.applyWebsite(customDark, webDark);
assert.equal(webDark.dataset.colorScheme, "dark");
assert.equal(webDark.values["--lightbox-bg"], "rgb(8 9 10 / 96%)");
assert.equal(webDark.values["--media-control-bg"], "rgb(32 33 34 / 72%)");
assert.equal(webDark.values["--video-bg"], "#08090a");
// The general print palette applies to pages without a CV color preference.
const printRoot = websiteCSS.match(/@media\s+print\s*\{[\s\S]*?:root:not\(\[data-cv-color-mode\]\)\s*\{([^}]+)\}/)?.[1];
assert.ok(printRoot, "the general print palette must leave CV theme colors available");
const printValues = parseCSS(printRoot);
for (const { key } of T.fields.filter((field) => !editorOnly.includes(field.key))) {
  assert.equal(webDark.priorities[`--${key}`], "", `screen ${key} must not be inline !important`);
  assert.match(printValues[key] || "", /\s!important$/, `print ${key} must override inline screen themes`);
}
for (const key of ["bg", "surface", "cv-bg"]) assert.equal(printValues[key], "#ffffff !important", `print ${key} must stay white`);
assert.match(printRoot, /(?:^|;)\s*color-scheme\s*:\s*light\s*!important\s*;/, "print color-scheme must override inline dark mode");
const cvCSS = read("app/assets/css/cv-templates.css");
const monotone = cvCSS.match(/\[data-cv-color-mode="monotone"\]\s*\.cv-page\s*\{([^}]+)\}/)?.[1];
assert.ok(monotone, "CV Monotone must override the inherited palette");
const monotoneValues = parseCSS(monotone);
for (const key of ["ink", "ink-soft", "ink-faint", "accent", "accent-strong", "surface", "surface-muted", "line", "line-strong", "cv-bg"]) {
  assert.match(monotoneValues[key] || "", /^#([0-9a-f]{2})\1\1$/i, `CV Monotone ${key} must be neutral grayscale`);
}
assert.match(cvCSS, /@media\s+print\s*\{[\s\S]*?\.cv-page\s*\{\s*print-color-adjust\s*:\s*exact\s*;/, "CV print styles must preserve the selected colors");
assert.equal(webDark.priorities["color-scheme"], "");
T.applyEditor(customDark, editorDark);
assert.equal(editorDark.dataset.colorScheme, "dark");
assert.equal(editorDark.values["--color-text"], "#f8f9fa");
assert.equal(editorDark.values["--color-tooltip-bg"], "#303132");
assert.equal(editorDark.values["--color-tooltip-line"], "#778899");
assert.equal(editorDark.values["--color-backdrop"], "rgb(8 9 10 / 78%)");
for (const preset of T.presets) {
  const preview = element();
  T.applyEditor({ color_theme: preset.id }, preview);
  for (const { key } of T.fields) {
    const name = ({ ink: "text", "ink-soft": "text-muted", "ink-faint": "text-faint" })[key] || key;
    assert.equal(preview.values[`--color-${name}`], preset.colors[key], `${preset.id}: missing editor ${key}`);
  }
  assert.ok(!Object.hasOwn(preview.values, "--bg"));
}

// Exercise the browser UMD export and SiteData integration without a browser dependency.
const documentRoot = element(), meta = { content: "" };
const context = { window: {}, document: { documentElement: documentRoot, querySelector: (selector) => selector === 'meta[name="theme-color"]' ? meta : null } };
context.window.document = context.document;
context.window.SiteDataVersion = require("../assets/js/data-version.js");
vm.runInNewContext(source, context);
// Initial colors are applied while parsing the head, before SiteData starts.
vm.runInNewContext(read("exports/theme.js"), context);
const configuredTheme = T.resolve(JSON.parse(read("data/settings.json")));
assert.equal(documentRoot.dataset.colorTheme, configuredTheme.id);
assert.equal(documentRoot.dataset.colorScheme, configuredTheme.scheme);
assert.equal(documentRoot.values["--bg"], configuredTheme.colors.bg);
assert.equal(meta.content, configuredTheme.colors.bg);
context.window.SiteThemes.applyInitial(customDark);
assert.equal(documentRoot.values["--bg"], "#08090a");
assert.equal(documentRoot.values["color-scheme"], "dark");
assert.equal(meta.content, "#08090a");
assert.equal(context.window.SiteThemes.initialSettings, customDark);
vm.runInNewContext(read("app/assets/js/data.js"), context);
assert.equal(context.window.SiteData.applyColorTheme(customDark), "custom-2");
assert.equal(meta.content, "#08090a");
assert.equal(documentRoot.values["--bg"], "#08090a");
assert.equal(documentRoot.values["color-scheme"], "dark");
const isolatedPreview = element();
context.window.SiteThemes.applyEditor(customLight, isolatedPreview);
assert.equal(documentRoot.values["--bg"], "#08090a");
assert.equal(isolatedPreview.values["--color-text"], "#123456");
for (const name of ["index.html", "cv.html", "fork-guide.html"]) {
  const html = read(name);
  const shared = html.indexOf('src="app/assets/js/color-themes.js"');
  const initial = html.indexOf('src="exports/theme.js"');
  const stylesheet = html.indexOf('<link rel="stylesheet"');
  const data = html.indexOf('src="app/assets/js/data.js"');
  assert.ok(shared >= 0 && shared < data, `${name}: shared themes must load before SiteData`);
  assert.ok(shared < initial && initial < stylesheet, `${name}: configured colors must load before stylesheet and body`);
  assert.match(html, /<script src="app\/assets\/js\/color-themes.js"><\/script>/, `${name}: theme resolver must block parsing`);
  assert.match(html, /<script src="exports\/theme.js"><\/script>/, `${name}: initial theme must block parsing`);
}
assert.equal(read("editor/cmd/editor/frontend/dist/color-themes.js"), source);
assert.ok(read("editor/build.bat").includes('app\\assets\\js\\color-themes.js'));
console.log("Shared themes: 12 preserved presets, 26 colors, three custom slots, draft fallbacks, scoped previews, light/dark resets and print overrides passed.");
