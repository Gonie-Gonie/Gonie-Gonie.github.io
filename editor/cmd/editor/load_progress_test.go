package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestEditorLoadProgressReportsScopedStagesAndPreservesLegacyResponse(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	before := snapshotBoardRepo(t, root)
	var events []EditorLoadProgress
	app := &App{repoRoot: root, loadProgressSink: func(event EditorLoadProgress) { events = append(events, event) }}
	app.progressSink = func(event OperationProgress) { t.Fatalf("load emitted a save/operation event: %#v", event) }
	legacy, err := app.LoadEditorData()
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 0 {
		t.Fatal("legacy load emitted unscoped progress")
	}
	labels := []string{"편집기", "설정", "프로필", "사람", "수상", "학술활동", "프로젝트", "소프트웨어", "논문", "게시판", "미리보기"}
	for _, id := range []string{"initial-load", "reload", ""} {
		events = nil
		loaded, err := app.LoadEditorDataWithProgress(LoadEditorDataRequest{OperationID: id})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(loaded, legacy) {
			t.Fatal("progress changed the editor data response")
		}
		if id == "" {
			if len(events) != 0 {
				t.Fatal("missing operation ID emitted progress")
			}
			continue
		}
		if len(events) != len(labels) {
			t.Fatalf("expected 11 backend stages, got %#v", events)
		}
		for index, event := range events {
			want := EditorLoadProgress{OperationID: id, Step: index + 1, Total: 12, Label: labels[index]}
			if event != want {
				t.Fatalf("event %d = %#v, want %#v", index, event, want)
			}
		}
	}
	assertBoardRepoSnapshot(t, root, before, "loading with progress")
}

func TestEditorLoadProgressStopsAtFailingStageWithoutWrites(t *testing.T) {
	for _, test := range []struct {
		name, file string
		step       int
	}{
		{"root data version", "version.json", 1},
		{"settings", "settings.json", 2},
		{"profile", "profile.json", 3},
		{"projects", "projects.json", 7},
		{"board", "board.json", 10},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := newTempRepoFixture(t, fixtureSettingsJSON())
			writeFixtureFile(t, filepath.Join(root, "data", test.file), []byte("broken"))
			before := snapshotBoardRepo(t, root)
			var events []EditorLoadProgress
			app := &App{repoRoot: root, loadProgressSink: func(event EditorLoadProgress) { events = append(events, event) }}
			if _, err := app.LoadEditorDataWithProgress(LoadEditorDataRequest{OperationID: "failed-load"}); err == nil {
				t.Fatal("malformed data did not stop loading")
			}
			if len(events) != test.step {
				t.Fatalf("events continued beyond failed stage %d: %#v", test.step, events)
			}
			for index, event := range events {
				if event.OperationID != "failed-load" || event.Step != index+1 || event.Total != 12 {
					t.Fatalf("invalid failure progress: %#v", events)
				}
			}
			assertBoardRepoSnapshot(t, root, before, "failed load with progress")
		})
	}
}
