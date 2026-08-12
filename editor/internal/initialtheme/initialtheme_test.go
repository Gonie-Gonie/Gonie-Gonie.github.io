package initialtheme

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestScriptCarriesOnlyThemeSettingsAndEscapesCode(t *testing.T) {
	raw := []byte(`{"color_theme":"custom-2","custom_themes":{"custom-2":{"name":"</script><script>alert(1)</script>","base_theme":"graphite","colors":{"bg":"#010203"},"private_note":"omit"}},"email":"private@example.com","journals":[{"name":"omit"}]}`)
	script, err := Script(raw)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(script, []byte("</script>")) || bytes.Contains(script, []byte("private")) || bytes.Contains(script, []byte("journals")) {
		t.Fatalf("export included unrelated data or unescaped markup: %s", script)
	}
	const prefix = "// Generated from data/settings.json.\nwindow.SiteThemes.applyInitial("
	if !strings.HasPrefix(string(script), prefix) || !strings.HasSuffix(string(script), ");\n") {
		t.Fatalf("unexpected bootstrap: %s", script)
	}
	var settings map[string]any
	if err := json.Unmarshal(script[len(prefix):len(script)-3], &settings); err != nil {
		t.Fatal(err)
	}
	if settings["color_theme"] != "custom-2" || len(settings) != 2 {
		t.Fatal(settings)
	}
	theme := settings["custom_themes"].(map[string]any)["custom-2"].(map[string]any)
	if theme["base_theme"] != "graphite" || theme["colors"].(map[string]any)["bg"] != "#010203" || len(theme) != 3 {
		t.Fatal(theme)
	}
}

func TestScriptRejectsInvalidSettings(t *testing.T) {
	for _, raw := range []string{"broken", "[]", "null", `{"version":"2.0.0"}`} {
		if _, err := Script([]byte(raw)); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	first, err := Script([]byte(`{"color_theme":"sand"}`))
	if err != nil {
		t.Fatal(err)
	}
	second, err := Script([]byte(`{"color_theme":"sand","unrelated":{"changed":true}}`))
	if err != nil || !bytes.Equal(first, second) {
		t.Fatal("unrelated edits changed initial theme", err)
	}
}
