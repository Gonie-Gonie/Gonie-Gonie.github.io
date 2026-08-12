package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSettingsSavesCleanOrphansWithoutChangingReferencedData(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "editor save"
		if legacy {
			name = "legacy settings save"
		}
		t.Run(name, func(t *testing.T) {
			root := newTempRepoFixture(t, fixtureSettingsJSON())
			profile := attachmentCleanupProfile(t, root)
			profile["certifications"] = []any{certificationWithPDF("kept.pdf")}
			writeJSONFixture(t, filepath.Join(root, "data", "profile.json"), profile)
			keptMedia := filepath.Join(root, "data", "media", "profile.jpg")
			orphanMedia := filepath.Join(root, "data", "media", "unused.jpg")
			keptPDF := filepath.Join(root, "data", "document", "kept.pdf")
			orphanPDF := filepath.Join(root, "data", "document", "unused.pdf")
			for _, path := range []string{keptMedia, orphanMedia} {
				writeProjectTestFile(t, path, fixtureJPEGBytes())
			}
			for _, path := range []string{keptPDF, orphanPDF} {
				writeProjectTestFile(t, path, fixturePDF)
			}
			before := attachmentCleanupRawData(t, root)
			app := &App{repoRoot: root, dirty: true}
			var cleanup *AttachmentCleanupResult
			if legacy {
				loaded, err := app.LoadSettings()
				if err != nil {
					t.Fatal(err)
				}
				loaded.Settings.ColorTheme = "sand"
				loaded.Settings.HiddenWebPages = append([]string{}, supportedWebPages...)
				app.dirty = true
				saved, err := app.SaveSettings(SaveSettingsRequest{Settings: loaded.Settings, Revision: loaded.Revision})
				if err != nil {
					t.Fatal(err)
				}
				cleanup = saved.AttachmentCleanup
			} else {
				loaded, err := app.LoadEditorData()
				if err != nil {
					t.Fatal(err)
				}
				request := saveRequestRevisions(loaded)
				request.SaveSettings = true
				request.Settings.ColorTheme = "sand"
				request.Settings.HiddenWebPages = append([]string{}, supportedWebPages...)
				app.dirty = true
				saved, err := app.SaveEditorData(request)
				if err != nil {
					t.Fatal(err)
				}
				cleanup = saved.AttachmentCleanup
			}
			if cleanup == nil || cleanup.Warning != "" || cleanup.MediaRemoved != 1 || cleanup.DocumentsRemoved != 1 {
				t.Fatalf("cleanup summary = %#v; want one media file and one PDF removed", cleanup)
			}
			attachmentCleanupAssertMissing(t, orphanMedia, orphanPDF)
			for path, expected := range map[string][]byte{keptMedia: fixtureJPEGBytes(), keptPDF: fixturePDF} {
				if !bytes.Equal(readFixtureFile(t, path), expected) {
					t.Fatalf("referenced attachment changed: %s", path)
				}
			}
			for name, expected := range before {
				if !bytes.Equal(readFixtureFile(t, filepath.Join(root, "data", name)), expected) {
					t.Fatalf("attachment cleanup changed raw content: %s", name)
				}
			}
			if app.dirty {
				t.Fatal("completed save left the editor dirty")
			}
		})
	}
}

func TestSaveCleanupPreservesSharedAttachmentsAcrossHiddenCollections(t *testing.T) {
	root := newSoftwareRepoFixture(t)
	profile := attachmentCleanupProfile(t, root)
	profile["profile_card"].(map[string]any)["media"] = map[string]any{"src": "existing-board-photo.jpg", "type": "image", "poster": "existing-board-poster.jpg"}
	profile["certifications"] = []any{certificationWithPDF("shared.pdf")}
	writeJSONFixture(t, filepath.Join(root, "data", "profile.json"), profile)
	var projects []map[string]any
	if err := json.Unmarshal(readFixtureFile(t, filepath.Join(root, "data", "projects.json")), &projects); err != nil {
		t.Fatal(err)
	}
	projects[0]["media"] = []any{map[string]any{"src": "existing-board-photo.jpg", "type": "image", "poster": "existing-board-poster.jpg", "caption_en": "Shared image", "caption_ko": "공유 사진"}}
	projects[0]["visible_in_CV"] = false
	writeJSONFixture(t, filepath.Join(root, "data", "projects.json"), projects)
	var software []map[string]any
	if err := json.Unmarshal(readFixtureFile(t, filepath.Join(root, "data", "software.json")), &software); err != nil {
		t.Fatal(err)
	}
	shared := map[string]any{"src": "existing-board-photo.jpg", "type": "image", "poster": "existing-board-poster.jpg", "caption_en": "Shared image", "caption_ko": "공유 사진"}
	software[1]["media"] = append(software[1]["media"].([]any), shared)
	software[1]["visible_in_CV"] = false
	writeJSONFixture(t, filepath.Join(root, "data", "software.json"), software)
	writeJSONFixture(t, filepath.Join(root, "data", "awards.json"), []any{map[string]any{
		"id": "shared-award", "date": "2020-11-20", "title_en": "Shared award", "title_ko": "공유 수상",
		"organization_en": "Society", "organization_ko": "학회", "pdf": "shared.pdf", "visible_in_CV": false,
	}})
	sharedPDF := filepath.Join(root, "data", "document", "shared.pdf")
	orphanMedia := filepath.Join(root, "data", "media", "orphan.jpg")
	orphanPDF := filepath.Join(root, "data", "document", "orphan.pdf")
	writeProjectTestFile(t, sharedPDF, fixturePDF)
	writeProjectTestFile(t, orphanMedia, fixtureJPEGBytes())
	writeProjectTestFile(t, orphanPDF, fixturePDF)
	app := &App{repoRoot: root}
	loaded, err := app.LoadEditorData()
	if err != nil {
		t.Fatal(err)
	}
	request := saveRequestRevisions(loaded)
	request.SaveSettings = true
	request.Settings.HiddenWebPages = append([]string{}, supportedWebPages...)
	request.SaveBoard = true
	request.Board = []BoardSaveItem{}
	request.SaveAwards = true
	request.Awards = []AwardSaveItem{}
	saved, err := app.SaveEditorData(request)
	if err != nil {
		t.Fatal(err)
	}
	if saved.AttachmentCleanup == nil || saved.AttachmentCleanup.Warning != "" {
		t.Fatalf("cleanup unexpectedly failed: %#v", saved.AttachmentCleanup)
	}
	attachmentCleanupAssertMissing(t, orphanMedia, orphanPDF)
	for _, name := range []string{"existing-board-photo.jpg", "existing-board-poster.jpg", "software-stable-tool.jpg", "software-stable-poster.jpg"} {
		if _, err := os.Stat(filepath.Join(root, "data", "media", name)); err != nil {
			t.Fatalf("attachment used by another hidden collection was deleted: %s: %v", name, err)
		}
	}
	if !bytes.Equal(readFixtureFile(t, sharedPDF), fixturePDF) {
		t.Fatal("PDF still used by a certification changed after its award was removed")
	}
	var nextProfile map[string]any
	if err := json.Unmarshal(saved.Profile, &nextProfile); err != nil {
		t.Fatal(err)
	}
	delete(nextProfile["certifications"].([]any)[0].(map[string]any), "pdf")
	remove := saveRequestRevisions(saved)
	remove.SaveProfile = true
	remove.Profile, _ = json.Marshal(nextProfile)
	if _, err := app.SaveEditorData(remove); err != nil {
		t.Fatal(err)
	}
	attachmentCleanupAssertMissing(t, sharedPDF)
}

func TestRejectedAndRolledBackSavesDoNotCleanAttachments(t *testing.T) {
	for _, failure := range []string{"stale revision", "invalid data", "commit failure"} {
		t.Run(failure, func(t *testing.T) {
			root := newBoardRepoFixture(t)
			orphan := filepath.Join(root, "data", "media", "orphan.jpg")
			writeProjectTestFile(t, orphan, fixtureJPEGBytes())
			app := &App{repoRoot: root}
			loaded, err := app.LoadEditorData()
			if err != nil {
				t.Fatal(err)
			}
			before := snapshotBoardRepo(t, root)
			request := saveRequestRevisions(loaded)
			request.SaveSettings = true
			request.Settings.ColorTheme = "sand"
			switch failure {
			case "stale revision":
				request.BoardRevision = "stale"
			case "invalid data":
				request.Settings.HiddenWebPages = []string{"unknown"}
			case "commit failure":
				previous := commitEditorFiles
				commitEditorFiles = func([]editorFileWrite) (bool, error) { return true, errors.New("fixture commit failure") }
				t.Cleanup(func() { commitEditorFiles = previous })
			}
			if _, err := app.SaveEditorData(request); err == nil {
				t.Fatal("rejected save returned success")
			}
			assertBoardRepoSnapshot(t, root, before, failure)
		})
	}
}

func TestCleanupFailureDoesNotRejectCommittedSave(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	orphan := filepath.Join(root, "data", "media", "orphan.jpg")
	writeProjectTestFile(t, orphan, fixtureJPEGBytes())
	// Unknown user data is outside the editor's loaded collections. Its broken
	// JSON prevents proving that the orphan is unused, so cleanup must stop.
	writeProjectTestFile(t, filepath.Join(root, "data", "custom.json"), []byte("{ broken JSON"))
	app := &App{repoRoot: root, dirty: true}
	loaded, err := app.LoadEditorData()
	if err != nil {
		t.Fatal(err)
	}
	request := saveRequestRevisions(loaded)
	request.SaveSettings = true
	request.Settings.ColorTheme = "sand"
	app.dirty = true
	saved, err := app.SaveEditorData(request)
	if err != nil {
		t.Fatalf("a committed save must not be reported as failed because cleanup stopped: %v", err)
	}
	if saved.Settings.ColorTheme != "sand" || saved.SettingsRevision == loaded.SettingsRevision {
		t.Fatal("settings save did not commit")
	}
	if saved.AttachmentCleanup == nil || !strings.Contains(saved.AttachmentCleanup.Warning, "custom.json") {
		t.Fatalf("cleanup failure was not reported in the successful response: %#v", saved.AttachmentCleanup)
	}
	if app.dirty {
		t.Fatal("cleanup warning made the committed draft dirty")
	}
	if !bytes.Equal(readFixtureFile(t, orphan), fixtureJPEGBytes()) {
		t.Fatal("uncertain references caused an attachment to be removed")
	}
	reloaded, err := app.LoadEditorData()
	if err != nil || reloaded.SettingsRevision != saved.SettingsRevision {
		t.Fatalf("editor cannot reopen the committed save: %v", err)
	}
}

func attachmentCleanupProfile(t *testing.T, root string) map[string]any {
	t.Helper()
	var profile map[string]any
	if err := json.Unmarshal(readFixtureFile(t, filepath.Join(root, "data", "profile.json")), &profile); err != nil {
		t.Fatal(err)
	}
	return profile
}

func attachmentCleanupRawData(t *testing.T, root string) map[string][]byte {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(root, "data"))
	if err != nil {
		t.Fatal(err)
	}
	result := map[string][]byte{}
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "settings.json" || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		result[entry.Name()] = readFixtureFile(t, filepath.Join(root, "data", entry.Name()))
	}
	return result
}

func attachmentCleanupAssertMissing(t *testing.T, paths ...string) {
	t.Helper()
	for _, path := range paths {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("unused attachment remains after save: %s: %v", path, err)
		}
	}
}
