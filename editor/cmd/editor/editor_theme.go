package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

const editorThemePath = "/__editor_theme.js"

// Read the fork's saved theme before frontend CSS loads. Invalid personal data
// must not prevent the normal editor load/error interface from starting.
func (a *App) serveEditorTheme(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "허용되지 않는 요청입니다.", http.StatusMethodNotAllowed)
		return
	}
	a.mu.Lock()
	root, err := a.updateMetadataRootLocked()
	a.mu.Unlock()
	var raw []byte
	if err == nil {
		raw, _ = os.ReadFile(filepath.Join(root, "data", "settings.json"))
	}
	script, err := initialtheme.Script(raw)
	if err != nil {
		// The fixed empty settings object cannot fail JSON encoding.
		script, _ = initialtheme.FromSettings(nil)
	}
	script = append(script, []byte("\nwindow.SiteThemes.applyEditor(window.SiteThemes.initialSettings);\n")...)
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(script)))
	if r.Method == http.MethodGet {
		_, _ = w.Write(script)
	}
}
