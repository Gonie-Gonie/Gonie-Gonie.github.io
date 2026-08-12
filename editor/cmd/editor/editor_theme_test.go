package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

func requestEditorTheme(app *App, method, path string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	app.mediaPreviewHandler().ServeHTTP(response, httptest.NewRequest(method, path, nil))
	return response
}

func TestEditorThemeUsesSavedPresetCustomThemeAndManualEditsWithoutWrites(t *testing.T) {
	root, _ := initialThemeStartupFixture(t)
	// The theme bootstrap must remain independent from other personal data.
	writeFixtureFile(t, filepath.Join(root, "data", "profile.json"), []byte("broken private profile"))
	writeFixtureFile(t, filepath.Join(root, "data", "version.json"), []byte("broken private version"))
	app := &App{repoRoot: root, dirty: true}
	for _, raw := range []string{
		`{"color_theme":"graphite","private_email":"private@example.com"}`,
		`{"color_theme":"custom-2","custom_themes":{"custom-2":{"name":"Local custom","base_theme":"ocean","colors":{"bg":"#010203","accent":"#ABCDEF"},"private_note":"omit this"}},"private_email":"private@example.com"}`,
		`{"color_theme":"sand","private_email":"private@example.com"}`,
	} {
		writeFixtureFile(t, filepath.Join(root, "data", "settings.json"), []byte(raw))
		before := snapshotBoardRepo(t, root)
		response := requestEditorTheme(app, http.MethodGet, editorThemePath)
		if response.Code != http.StatusOK {
			t.Fatalf("theme status = %d: %s", response.Code, response.Body.String())
		}
		want, err := initialtheme.Script([]byte(raw))
		if err != nil {
			t.Fatal(err)
		}
		want = append(want, []byte("\nwindow.SiteThemes.applyEditor(window.SiteThemes.initialSettings);\n")...)
		if !bytes.Equal(response.Body.Bytes(), want) {
			t.Fatalf("bootstrap did not reflect current local settings: %s", response.Body.String())
		}
		for _, private := range []string{"private", "omit this", "private@example.com", root} {
			if strings.Contains(response.Body.String(), private) {
				t.Fatalf("theme bootstrap exposed unrelated data %q", private)
			}
		}
		if !app.dirty {
			t.Fatal("theme request cleared unsaved changes")
		}
		assertBoardRepoSnapshot(t, root, before, "editor theme bootstrap")
	}
}

func TestEditorThemeFallbackDoesNotExposeErrorsOrModifyData(t *testing.T) {
	for _, test := range []struct {
		name, raw string
		missing   bool
	}{
		{name: "missing", missing: true},
		{name: "malformed", raw: "broken private settings"},
		{name: "array", raw: "[]"},
		{name: "null", raw: "null"},
		{name: "incompatible settings", raw: `{"version":"2.0.0","color_theme":"graphite"}`},
		{name: "invalid encoding", raw: "{\"private\":\"\xff\"}"},
	} {
		t.Run(test.name, func(t *testing.T) {
			root, _ := initialThemeStartupFixture(t)
			path := filepath.Join(root, "data", "settings.json")
			if test.missing {
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			} else {
				writeFixtureFile(t, path, []byte(test.raw))
			}
			before := snapshotBoardRepo(t, root)
			response := requestEditorTheme(&App{repoRoot: root}, http.MethodGet, editorThemePath)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "window.SiteThemes.applyInitial({});") || !strings.Contains(response.Body.String(), "window.SiteThemes.applyEditor(window.SiteThemes.initialSettings);") {
				t.Fatalf("missing usable fallback: status=%d body=%q", response.Code, response.Body.String())
			}
			if strings.Contains(response.Body.String(), root) || strings.Contains(response.Body.String(), "private") || strings.Contains(response.Body.String(), "graphite") {
				t.Fatal("fallback exposed unrelated data or filesystem details")
			}
			assertBoardRepoSnapshot(t, root, before, "editor theme fallback")
		})
	}
}

func TestEditorThemeMethodsHeadersAndUnrelatedRoutes(t *testing.T) {
	root, _ := initialThemeStartupFixture(t)
	app := &App{repoRoot: root}
	get := requestEditorTheme(app, http.MethodGet, editorThemePath)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		response := requestEditorTheme(app, method, editorThemePath)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d", method, response.Code)
		}
		for header, want := range map[string]string{
			"Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Length": strconv.Itoa(get.Body.Len()),
		} {
			if got := response.Header().Get(header); got != want {
				t.Errorf("%s %s = %q, want %q", method, header, got, want)
			}
		}
		if method == http.MethodHead && response.Body.Len() != 0 {
			t.Fatal("HEAD returned a script body")
		}
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions} {
		response := requestEditorTheme(app, method, editorThemePath)
		if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("%s status = %d, allow = %q", method, response.Code, response.Header().Get("Allow"))
		}
	}
	for _, path := range []string{"/__editor_theme.js/extra", "/settings.json", "/unknown"} {
		if response := requestEditorTheme(app, http.MethodGet, path); response.Code != http.StatusNotFound {
			t.Errorf("%s status = %d, want 404", path, response.Code)
		}
	}
}
