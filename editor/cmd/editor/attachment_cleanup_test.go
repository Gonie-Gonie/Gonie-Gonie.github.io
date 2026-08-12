package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func cleanupTestRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, directory := range []string{"data/media", "data/document"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(directory)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func cleanupTestWrite(t *testing.T, root, name string, contents []byte) {
	t.Helper()
	filename := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, contents, 0o644); err != nil {
		t.Fatal(err)
	}
}

func cleanupTestExists(t *testing.T, root, name string, exists bool) {
	t.Helper()
	_, err := os.Stat(filepath.Join(root, filepath.FromSlash(name)))
	if exists && err != nil {
		t.Fatalf("referenced/control file %s was removed: %v", name, err)
	}
	if !exists && !os.IsNotExist(err) {
		t.Fatalf("unused file %s remains: %v", name, err)
	}
}

func TestAttachmentCleanupPreservesEveryReferenceAndRemovesOnlyOrphans(t *testing.T) {
	root := cleanupTestRoot(t)
	data := map[string]any{
		"hidden_web_pages": []string{"projects", "software", "board"},
		"profile":          map[string]any{"visible_in_CV": false, "media": map[string]any{"src": "PROFILE.JPG", "poster": "nested/poster.png"}},
		"unknown":          []any{"shared.jpg", "data/document/proof.pdf#page=2", "proof#1.pdf", "./nested/자료.png", `https://example.org/data/media/quoted%20file.png?v=1`},
		"inline":           `<img src="data/media/inline.png">`,
	}
	raw, _ := json.Marshal(data)
	cleanupTestWrite(t, root, "data/profile.json", raw)
	cleanupTestWrite(t, root, "data/future/references.json", []byte(`{"future_asset":"new.json.jpg","duplicate":"old-key.jpg","duplicate":"new-key.jpg"}`))
	cleanupTestWrite(t, root, "index.html", []byte(`<img src="data/media/in-html.png"><a href="data/document/in-html.pdf">PDF</a>`))
	cleanupTestWrite(t, root, "app/assets/custom.css", []byte(`.photo {width:100%; background:url("/data/media/css%20image.png");}`))
	cleanupTestWrite(t, root, "README.md", []byte("media/unused-doc-example.jpg is only a bare documentation name"))
	for _, name := range []string{"profile.jpg", "nested/poster.png", "shared.jpg", "nested/자료.png", "quoted file.png", "inline.png", "new.json.jpg", "old-key.jpg", "new-key.jpg", "in-html.png", "css image.png", ".gitkeep", ".notes/keep.jpg", "unused.jpg", "nested/unused.png", "unused-doc-example.jpg"} {
		cleanupTestWrite(t, root, "data/media/"+name, []byte(name))
	}
	for _, name := range []string{"proof.pdf", "proof#1.pdf", "in-html.pdf", ".gitkeep", "unused.pdf"} {
		cleanupTestWrite(t, root, "data/document/"+name, []byte(name))
	}
	result, err := cleanupUnusedAttachments(root, map[string][]byte{"profile.json": raw})
	if err != nil {
		t.Fatal(err)
	}
	if result.MediaRemoved != 3 || result.DocumentsRemoved != 1 {
		t.Fatalf("cleanup counts = %#v", result)
	}
	for _, name := range []string{"profile.jpg", "nested/poster.png", "shared.jpg", "nested/자료.png", "quoted file.png", "inline.png", "new.json.jpg", "old-key.jpg", "new-key.jpg", "in-html.png", "css image.png", ".gitkeep", ".notes/keep.jpg"} {
		cleanupTestExists(t, root, "data/media/"+name, true)
	}
	for _, name := range []string{"unused.jpg", "nested/unused.png", "unused-doc-example.jpg"} {
		cleanupTestExists(t, root, "data/media/"+name, false)
	}
	cleanupTestExists(t, root, "data/document/proof.pdf", true)
	cleanupTestExists(t, root, "data/document/proof#1.pdf", true)
	cleanupTestExists(t, root, "data/document/in-html.pdf", true)
	cleanupTestExists(t, root, "data/document/unused.pdf", false)
	stored, err := os.ReadFile(filepath.Join(root, "data", "profile.json"))
	if err != nil || string(stored) != string(raw) {
		t.Fatal("cleanup changed raw JSON")
	}
}

func TestAttachmentCleanupAbortsBeforeDeletingOnInvalidOrChangedSources(t *testing.T) {
	for _, mode := range []string{"invalid", "expected-mismatch", "changed-json", "new-json", "changed-static", "changed-candidate"} {
		t.Run(mode, func(t *testing.T) {
			root := cleanupTestRoot(t)
			raw := []byte(`{"media":[]}`)
			cleanupTestWrite(t, root, "data/profile.json", raw)
			cleanupTestWrite(t, root, "index.html", []byte("Initial page"))
			cleanupTestWrite(t, root, "data/media/orphan.jpg", []byte("original"))
			cleanupTestWrite(t, root, "data/document/orphan.pdf", []byte("original"))
			if mode == "invalid" {
				cleanupTestWrite(t, root, "data/future.json", []byte(`{"broken":`))
				if _, err := cleanupUnusedAttachments(root, nil); err == nil {
					t.Fatal("invalid reference JSON accepted")
				}
			} else if mode == "expected-mismatch" {
				if _, err := cleanupUnusedAttachments(root, map[string][]byte{"profile.json": []byte(`{}`)}); err == nil {
					t.Fatal("committed snapshot mismatch accepted")
				}
			} else {
				plan, err := planAttachmentCleanup(root, map[string][]byte{"profile.json": raw})
				if err != nil {
					t.Fatal(err)
				}
				defer plan.close()
				switch mode {
				case "changed-json":
					cleanupTestWrite(t, root, "data/profile.json", []byte(`{"media":"orphan.jpg"}`))
				case "new-json":
					cleanupTestWrite(t, root, "data/new.json", []byte(`{"media":"orphan.jpg"}`))
				case "changed-static":
					cleanupTestWrite(t, root, "index.html", []byte(`<img src="data/media/orphan.jpg">`))
				case "changed-candidate":
					if err := os.Rename(filepath.Join(root, "data", "media", "orphan.jpg"), filepath.Join(root, "original.jpg")); err != nil {
						t.Fatal(err)
					}
					cleanupTestWrite(t, root, "data/media/orphan.jpg", []byte("replacement"))
				}
				if _, err := plan.remove(); err == nil {
					t.Fatal("stale cleanup plan accepted")
				}
			}
			cleanupTestExists(t, root, "data/media/orphan.jpg", true)
			cleanupTestExists(t, root, "data/document/orphan.pdf", true)
		})
	}
}

func TestAttachmentCleanupDoesNotFollowLinksOutsideManagedDirectories(t *testing.T) {
	for _, mode := range []string{"managed-root", "nested-directory", "file-alias", "data-json"} {
		t.Run(mode, func(t *testing.T) {
			root := cleanupTestRoot(t)
			outside := t.TempDir()
			cleanupTestWrite(t, root, "data/profile.json", []byte(`{"src":"alias.jpg"}`))
			cleanupTestWrite(t, root, "data/media/orphan.jpg", []byte("local file"))
			cleanupTestWrite(t, outside, "outside.jpg", []byte("outside file"))
			cleanupTestWrite(t, outside, "outside.json", []byte(`{"src":"outside.jpg"}`))
			var target, link string
			switch mode {
			case "managed-root":
				if err := os.Rename(filepath.Join(root, "data", "media"), filepath.Join(root, "original-media")); err != nil {
					t.Fatal(err)
				}
				target, link = outside, filepath.Join(root, "data", "media")
			case "nested-directory":
				target, link = outside, filepath.Join(root, "data", "media", "linked")
			case "file-alias":
				target, link = filepath.Join(outside, "outside.jpg"), filepath.Join(root, "data", "media", "alias.jpg")
			case "data-json":
				target, link = filepath.Join(outside, "outside.json"), filepath.Join(root, "data", "linked.json")
			}
			if err := os.Symlink(target, link); err != nil {
				t.Skipf("symlinks unavailable: %v", err)
			}
			if _, err := cleanupUnusedAttachments(root, nil); err == nil {
				t.Fatal("cleanup accepted a linked reference or asset path")
			}
			cleanupTestExists(t, outside, "outside.jpg", true)
			if mode != "managed-root" {
				cleanupTestExists(t, root, "data/media/orphan.jpg", true)
			}
		})
	}
}

func TestAttachmentCleanupMissingAssetFoldersAndLiteralPercentNames(t *testing.T) {
	root := t.TempDir()
	cleanupTestWrite(t, root, "data/profile.json", []byte(`{"src":"literal%20name.jpg"}`))
	result, err := cleanupUnusedAttachments(root, nil)
	if err != nil || result.MediaRemoved != 0 || result.DocumentsRemoved != 0 {
		t.Fatalf("missing optional asset folders: %#v %v", result, err)
	}
	for _, name := range []string{"literal%20name.jpg", "literal name.jpg", "orphan.jpg"} {
		cleanupTestWrite(t, root, "data/media/"+name, []byte(name))
	}
	result, err = cleanupUnusedAttachments(root, nil)
	if err != nil || result.MediaRemoved != 1 {
		t.Fatalf("literal percent path cleanup: %#v %v", result, err)
	}
	cleanupTestExists(t, root, "data/media/literal%20name.jpg", true)
	cleanupTestExists(t, root, "data/media/literal name.jpg", true)
	if !strings.Contains(strings.Join(attachmentStringVariants("100% and a%20b"), "|"), "a b") {
		t.Fatal("a literal percent prevented escaped filename recognition")
	}
	if !attachmentReferenced("media", "literal?name.png", []string{"literal?name.png"}, nil) {
		t.Fatal("a literal query character in a bare filename lost its reference")
	}
}
