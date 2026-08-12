package sitebuild

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

func TestBuildRegeneratesInitialThemeFromLocalSettings(t *testing.T) {
	root := fixtureRoot(t)
	path := filepath.Join(root, "data", "settings.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string]any
	if err := json.Unmarshal(raw, &settings); err != nil {
		t.Fatal(err)
	}
	settings["color_theme"] = "custom-2"
	settings["custom_themes"] = map[string]any{"custom-2": map[string]any{"name": "Local colors", "base_theme": "graphite", "colors": map[string]any{"bg": "#08090a", "accent": "#123456"}}}
	raw, err = json.Marshal(settings)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Build(root, false); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(initialtheme.Path)))
	if err != nil {
		t.Fatal(err)
	}
	want, err := initialtheme.Script(raw)
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("bootstrap differs from local settings: %s, %v", got, err)
	}
	if unchanged, _ := os.ReadFile(path); !bytes.Equal(raw, unchanged) {
		t.Fatal("build rewrote source settings")
	}
}
