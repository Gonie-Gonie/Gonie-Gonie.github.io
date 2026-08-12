// Package initialtheme exports the editable color settings for the first paint.
package initialtheme

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/dataversion"
)

const Path = "exports/theme.js"

// Script carries only theme settings; the shared browser resolver owns palettes.
func Script(raw []byte) ([]byte, error) {
	data, err := dataversion.Unwrap(raw, "settings.json")
	if err != nil {
		return nil, err
	}
	settings, ok := data.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("settings.json must be an object")
	}
	return FromSettings(settings)
}

func FromSettings(settings map[string]any) ([]byte, error) {
	selected := map[string]any{}
	if value, exists := settings["color_theme"]; exists {
		selected["color_theme"] = value
	}
	if themes, ok := settings["custom_themes"].(map[string]any); ok {
		custom := map[string]any{}
		for _, id := range []string{"custom-1", "custom-2", "custom-3"} {
			if source, ok := themes[id].(map[string]any); ok {
				theme := map[string]any{}
				for _, key := range []string{"name", "base_theme", "colors"} {
					if value, exists := source[key]; exists {
						theme[key] = value
					}
				}
				custom[id] = theme
			}
		}
		selected["custom_themes"] = custom
	}
	encoded, err := json.Marshal(selected)
	if err != nil {
		return nil, err
	}
	return append(append([]byte("// Generated from data/settings.json.\nwindow.SiteThemes.applyInitial("), encoded...), []byte(");\n")...), nil
}

// Write refreshes only this derived export, leaving source data untouched.
func Write(root string) error {
	raw, err := os.ReadFile(filepath.Join(root, "data", "settings.json"))
	if err != nil {
		return err
	}
	script, err := Script(raw)
	if err != nil {
		return err
	}
	path := filepath.Join(root, filepath.FromSlash(Path))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	current, err := os.ReadFile(path)
	if err == nil && string(current) == string(script) {
		return nil
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".theme-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	if err = temporary.Chmod(0o644); err == nil {
		_, err = temporary.Write(script)
	}
	if err == nil {
		err = temporary.Sync()
	}
	closeErr := temporary.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(temporary.Name(), path)
}
