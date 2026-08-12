package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

func TestSettingsSavesRefreshInitialTheme(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "unified"
		if legacy {
			name = "legacy"
		}
		t.Run(name, func(t *testing.T) {
			root := newTempRepoFixture(t, fixtureSettingsJSON())
			app := &App{repoRoot: root}
			for _, theme := range []string{"sand", "graphite", "custom-2"} {
				loaded, err := app.LoadEditorData()
				if err != nil {
					t.Fatal(err)
				}
				draft := loaded.Settings
				draft.ColorTheme = theme
				draft.CustomThemes = map[string]CustomTheme{"custom-2": {Name: "Local", BaseTheme: "slate", Colors: map[string]string{"bg": "#010203"}}}
				if legacy {
					_, err = app.SaveSettings(SaveSettingsRequest{Settings: draft, Revision: loaded.SettingsRevision})
				} else {
					request := saveRequestRevisions(loaded)
					request.SaveSettings = true
					request.Settings = draft
					var saved EditorDataResponse
					saved, err = app.SaveEditorData(request)
					if err == nil && saved.AttachmentCleanup != nil && saved.AttachmentCleanup.Warning != "" {
						t.Fatal(saved.AttachmentCleanup.Warning)
					}
				}
				if err != nil {
					t.Fatal(err)
				}
				raw := readFixtureFile(t, filepath.Join(root, "data", "settings.json"))
				want, err := initialtheme.Script(raw)
				if err != nil {
					t.Fatal(err)
				}
				got := readFixtureFile(t, filepath.Join(root, filepath.FromSlash(initialtheme.Path)))
				if !bytes.Equal(got, want) {
					t.Fatalf("%s bootstrap does not match saved settings: %s", theme, got)
				}
			}
		})
	}
}

func TestInitialThemeWriteFailureRollsBackSettings(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(map[bool]string{false: "unified", true: "legacy"}[legacy], func(t *testing.T) {
			root := newTempRepoFixture(t, fixtureSettingsJSON())
			app := &App{repoRoot: root}
			loaded, err := app.LoadEditorData()
			if err != nil {
				t.Fatal(err)
			}
			draft := loaded.Settings
			draft.ColorTheme = "graphite"
			before := readFixtureFile(t, filepath.Join(root, "data", "settings.json"))
			original := commitEditorFiles
			commitEditorFiles = func(writes []editorFileWrite) (bool, error) {
				// Simulate an artifact conflict after settings preparation.
				path := filepath.Join(root, filepath.FromSlash(initialtheme.Path))
				if err := os.MkdirAll(path, 0o755); err != nil {
					t.Fatal(err)
				}
				return commitEditorFilesImpl(writes)
			}
			t.Cleanup(func() { commitEditorFiles = original })
			if legacy {
				_, err = app.SaveSettings(SaveSettingsRequest{Settings: draft, Revision: loaded.SettingsRevision})
			} else {
				request := saveRequestRevisions(loaded)
				request.SaveSettings = true
				request.Settings = draft
				_, err = app.SaveEditorData(request)
			}
			if err == nil {
				t.Fatal("artifact conflict was accepted")
			}
			if after := readFixtureFile(t, filepath.Join(root, "data", "settings.json")); !bytes.Equal(before, after) {
				t.Fatal("failed theme export left settings committed")
			}
			commitEditorFiles = original
		})
	}
}

func TestInitialThemeNewFileIsRemovedOnRollback(t *testing.T) {
	root := t.TempDir()
	write, err := prepareInitialThemeWrite(root, []byte(`{"color_theme":"sand"}`))
	if err != nil {
		t.Fatal(err)
	}
	complete, err := commitEditorFilesImpl([]editorFileWrite{write, {Name: "missing.json", Path: filepath.Join(root, "missing.json"), Revision: "stale", Next: []byte("changed"), Enabled: true}})
	if err == nil || !complete {
		t.Fatal("expected complete rollback", complete, err)
	}
	if _, err := os.Stat(write.Path); !os.IsNotExist(err) {
		t.Fatal("rollback left a newly created theme export", err)
	}
}
