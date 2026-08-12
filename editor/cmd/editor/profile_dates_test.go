package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestProfileDateMigrationLoadsWithoutWritingAndSavesCanonicalFields(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	path := filepath.Join(root, "data", "profile.json")
	var profile map[string]any
	if err := json.Unmarshal(readFixtureFile(t, path), &profile); err != nil {
		t.Fatal(err)
	}
	experience := profile["experience"].([]any)[0].(map[string]any)
	delete(experience, "start_date")
	delete(experience, "end_date")
	experience["period_en"], experience["period_ko"], experience["period_kr"] = "2026.05–Present", "2026.05–현재", "2026.05–현재"
	experience["future_date_metadata"] = "preserve"
	profile["education"] = []any{map[string]any{
		"degree_en": "Ph.D.", "degree_ko": "박사", "institution_en": "University", "institution_ko": "대학교",
		"period": "2022.03.–2026.02.", "advisor_en": "", "advisor_ko": "", "thesis_en": "", "thesis_ko": "",
	}}
	raw, err := json.Marshal(profile)
	if err != nil {
		t.Fatal(err)
	}
	writeFixtureFile(t, path, raw)
	loaded, err := readProfile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, loaded.Raw) || !bytes.Equal(raw, readFixtureFile(t, path)) {
		t.Fatal("loading migrated dates rewrote original data")
	}
	for section, want := range map[string][2]string{"experience": {"2026-05-01", ""}, "education": {"2022-03-01", "2026-02-01"}} {
		item := loaded.Data[section].([]any)[0].(map[string]any)
		if item["start_date"] != want[0] || item["end_date"] != want[1] {
			t.Fatalf("%s dates = %#v", section, item)
		}
	}
	encoded, _, err := buildProfileSave(raw)
	if err != nil {
		t.Fatal(err)
	}
	var saved map[string]any
	if err := json.Unmarshal(encoded, &saved); err != nil {
		t.Fatal(err)
	}
	for _, section := range []string{"experience", "education"} {
		item := saved[section].([]any)[0].(map[string]any)
		for _, field := range []string{"period", "period_en", "period_ko", "period_kr"} {
			if _, exists := item[field]; exists {
				t.Fatalf("saved profile retained %s", field)
			}
		}
	}
	if saved["experience"].([]any)[0].(map[string]any)["future_date_metadata"] != "preserve" {
		t.Fatal("date migration lost unknown metadata")
	}
}
