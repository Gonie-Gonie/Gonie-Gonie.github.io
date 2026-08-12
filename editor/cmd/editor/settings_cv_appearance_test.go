package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestCVAppearanceRoundTrip(t *testing.T) {
	original := fixtureSettingsJSON()
	root := newTempRepoFixture(t, original)
	path := filepath.Join(root, "data", "settings.json")
	app := &App{repoRoot: root}
	loaded, err := app.LoadEditorData()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Settings.CVTemplate != "original" || loaded.Settings.CVColorMode != "color" {
		t.Fatalf("legacy settings gave %q / %q, want original / color", loaded.Settings.CVTemplate, loaded.Settings.CVColorMode)
	}
	if raw := readFixtureFile(t, path); !bytes.Equal(raw, original) {
		t.Fatal("loading defaults changed settings.json")
	}
	for _, choice := range []struct{ template, colorMode string }{
		{"academic", "color"}, {"institutional", "monotone"}, {"original", "monotone"}, {"ledger", "monotone"},
	} {
		request := saveRequestRevisions(loaded)
		request.Settings = loaded.Settings
		request.Settings.CVTemplate = choice.template
		request.Settings.CVColorMode = choice.colorMode
		request.SaveSettings = true
		if _, err := app.SaveEditorData(request); err != nil {
			t.Fatal(err)
		}
		var stored map[string]any
		if err := json.Unmarshal(readFixtureFile(t, path), &stored); err != nil {
			t.Fatal(err)
		}
		if stored["cv_template"] != choice.template || stored["cv_color_mode"] != choice.colorMode {
			t.Fatalf("stored settings = %v / %v, want %q / %q", stored["cv_template"], stored["cv_color_mode"], choice.template, choice.colorMode)
		}
		loaded, err = app.LoadEditorData()
		if err != nil {
			t.Fatal(err)
		}
		if loaded.Settings.CVTemplate != choice.template || loaded.Settings.CVColorMode != choice.colorMode || loaded.Settings.ColorTheme != "sage" {
			t.Fatalf("reopened settings = %q / %q / %q, want %q / %q / sage", loaded.Settings.CVTemplate, loaded.Settings.CVColorMode, loaded.Settings.ColorTheme, choice.template, choice.colorMode)
		}
	}
	input := loaded.Settings
	input.CVTemplate, input.CVColorMode = "", ""
	input.TopicFallback.LabelEN = "Uncategorized"
	saved, err := app.SaveSettings(SaveSettingsRequest{Settings: input, Revision: loaded.SettingsRevision})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Settings.CVTemplate != "ledger" || saved.Settings.CVColorMode != "monotone" {
		t.Fatalf("older client reset the selections to %q / %q", saved.Settings.CVTemplate, saved.Settings.CVColorMode)
	}
}

func TestInvalidCVAppearanceSaveDoesNotWrite(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	path := filepath.Join(root, "data", "settings.json")
	app := &App{repoRoot: root}
	loaded, err := app.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	before := readFixtureFile(t, path)
	for _, invalid := range []struct{ field, template, colorMode string }{
		{"cv_template", "unknown", "color"}, {"cv_color_mode", "original", "unknown"},
	} {
		input := loaded.Settings
		input.CVTemplate, input.CVColorMode = invalid.template, invalid.colorMode
		if _, err := app.SaveSettings(SaveSettingsRequest{Settings: input, Revision: loaded.Revision}); err == nil || !strings.Contains(err.Error(), invalid.field) {
			t.Fatalf("saving invalid %s returned %v", invalid.field, err)
		}
		if raw := readFixtureFile(t, path); !bytes.Equal(raw, before) {
			t.Fatalf("rejected %s changed settings.json", invalid.field)
		}
	}
}
