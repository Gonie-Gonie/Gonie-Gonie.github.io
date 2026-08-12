package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

func initialThemeStartupFixture(t *testing.T) (string, map[string][]byte) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		t.Fatal(err)
	}
	raw := map[string][]byte{
		"version.json":             []byte(`{"version":"1.0.0"}`),
		"settings.json":            []byte(`{"color_theme":"custom-1","custom_themes":{"custom-1":{"name":"Fork palette","base_theme":"graphite","colors":{"bg":"#121314"}}},"private_metadata":"keep raw bytes"}`),
		"profile.json":             []byte(`{"private_profile":"keep"}`),
		"people.json":              []byte(`[]`),
		"projects.json":            []byte(`[]`),
		"software.json":            []byte(`[]`),
		"publications.json":        []byte(`[]`),
		"awards.json":              []byte(`[]`),
		"board.json":               []byte(`[]`),
		"academic_activities.json": []byte(`{}`),
	}
	for name, value := range raw {
		if err := os.WriteFile(filepath.Join(root, "data", name), value, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	return root, raw
}

func TestInitialThemeStartupCreatesForkExportWithoutChangingRawData(t *testing.T) {
	root, raw := initialThemeStartupFixture(t)
	if err := prepareInitialTheme(root); err != nil {
		t.Fatal(err)
	}
	exported, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(initialtheme.Path)))
	if err != nil {
		t.Fatal(err)
	}
	want, err := initialtheme.Script(raw["settings.json"])
	if err != nil || !bytes.Equal(exported, want) {
		t.Fatalf("initial export does not use the fork's settings: %q, %v", exported, err)
	}
	if bytes.Contains(exported, []byte("private_metadata")) || bytes.Contains(exported, []byte("private_profile")) {
		t.Fatal("theme export includes unrelated personal data")
	}
	for name, before := range raw {
		after, err := os.ReadFile(filepath.Join(root, "data", name))
		if err != nil || !bytes.Equal(after, before) {
			t.Fatalf("startup changed raw data/%s: %v", name, err)
		}
	}
}

func TestInitialThemeStartupRefreshesManualEditsAndLeavesMatchingExportUntouched(t *testing.T) {
	root, _ := initialThemeStartupFixture(t)
	if err := prepareInitialTheme(root); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, filepath.FromSlash(initialtheme.Path))
	oldTime := time.Date(2001, time.January, 2, 3, 4, 5, 0, time.UTC)
	if err := os.Chtimes(path, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := prepareInitialTheme(root); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(path)
	if err != nil || !after.ModTime().Equal(before.ModTime()) {
		t.Fatalf("matching export was rewritten: %v", err)
	}
	next := []byte(`{"color_theme":"sand","private_metadata":"still raw"}`)
	if err := os.WriteFile(filepath.Join(root, "data", "settings.json"), next, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := prepareInitialTheme(root); err != nil {
		t.Fatal(err)
	}
	exported, err := os.ReadFile(path)
	if err != nil || !bytes.Contains(exported, []byte(`"color_theme":"sand"`)) || bytes.Contains(exported, []byte("Fork palette")) {
		t.Fatalf("manual settings change was not reflected: %q, %v", exported, err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "data", "settings.json"))
	if err != nil || !bytes.Equal(raw, next) {
		t.Fatalf("manual settings change was rewritten: %q, %v", raw, err)
	}
}

func TestInitialThemeStartupRejectsIncompatibleDataWithoutTouchingExport(t *testing.T) {
	root, _ := initialThemeStartupFixture(t)
	if err := prepareInitialTheme(root); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, filepath.FromSlash(initialtheme.Path))
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "data", "version.json"), []byte(`{"version":"2.0.0"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := prepareInitialTheme(root); err == nil {
		t.Fatal("incompatible data version was accepted")
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(after, before) {
		t.Fatalf("incompatible data changed the existing export: %v", err)
	}
}
