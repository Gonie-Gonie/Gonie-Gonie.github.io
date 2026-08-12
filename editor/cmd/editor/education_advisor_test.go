package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestEducationAdvisorNamesSeparateLegacyLabels(t *testing.T) {
	for _, test := range []struct{ input, want string }{
		{"Advisor: Prof. Cheol-Soo Park", "Prof. Cheol-Soo Park"},
		{"지도교수: 박철수 교수님", "박철수 교수님"},
		{"  ADVISOR ：  Prof. Kim  ", "Prof. Kim"},
		{"지도 교수\u00a0：\u00a0김 교수", "김 교수"},
		{"Advisor: 지도교수: Advisor: Prof. Lee", "Prof. Lee"},
		{"Prof. Lee: Research Group", "Prof. Lee: Research Group"},
		{"Advisor", "Advisor"},
		{"", ""},
		{" \n ", ""},
		{"Advisor: 지도교수： ", ""},
	} {
		t.Run(test.input, func(t *testing.T) {
			if got := normaliseEducationAdvisor(test.input); got != test.want {
				t.Fatalf("advisor name = %q, want %q", got, test.want)
			}
		})
	}
}

func advisorProfileFixture(t *testing.T, root string) []byte {
	t.Helper()
	var data map[string]any
	if err := json.Unmarshal(readFixtureFile(t, filepath.Join(root, "data", "profile.json")), &data); err != nil {
		t.Fatal(err)
	}
	data["education"] = []any{map[string]any{
		"degree_en": "Ph.D.", "degree_ko": "박사", "institution_en": "University", "institution_ko": "대학교",
		"period": "2022–2026", "advisor_en": "Advisor: Prof. Cheol-Soo Park", "advisor_ko": "지도교수: 박철수 교수님",
		"thesis_en": "Thesis", "thesis_ko": "학위논문", "visible_in_CV": true,
		"future_advisor_metadata": map[string]any{"value": "Advisor: preserve verbatim"},
	}}
	data["future_root_metadata"] = []any{"Advisor: preserve verbatim", true}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(raw, '\n')
}

func TestEducationAdvisorLoadNormalisesDetachedDataWithoutWriting(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	path := filepath.Join(root, "data", "profile.json")
	raw := advisorProfileFixture(t, root)
	writeFixtureFile(t, path, raw)
	before := append([]byte(nil), raw...)
	loaded, err := readProfile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(loaded.Raw, before) || !bytes.Equal(readFixtureFile(t, path), before) || !bytes.Equal(raw, before) {
		t.Fatal("normalising detached advisor names rewrote raw profile data")
	}
	item := loaded.Data["education"].([]any)[0].(map[string]any)
	if item["advisor_en"] != "Prof. Cheol-Soo Park" || item["advisor_ko"] != "박철수 교수님" {
		t.Fatalf("loaded advisor fields = %#v / %#v", item["advisor_en"], item["advisor_ko"])
	}
	encoded, saved, err := buildProfileSave(raw)
	if err != nil {
		t.Fatal(err)
	}
	var stored map[string]any
	if err := json.Unmarshal(encoded, &stored); err != nil {
		t.Fatal(err)
	}
	education := stored["education"].([]any)[0].(map[string]any)
	if education["advisor_en"] != item["advisor_en"] || education["advisor_ko"] != item["advisor_ko"] {
		t.Fatalf("saved advisor names = %#v / %#v", education["advisor_en"], education["advisor_ko"])
	}
	if !reflect.DeepEqual(education["future_advisor_metadata"], item["future_advisor_metadata"]) ||
		!reflect.DeepEqual(saved.Data["future_root_metadata"], loaded.Data["future_root_metadata"]) {
		t.Fatal("advisor normalisation changed unknown profile metadata")
	}
	if !bytes.Equal(readFixtureFile(t, path), before) {
		t.Fatal("building a save wrote profile.json before commit")
	}
}

func TestEducationAdvisorSavePersistsOnlyNames(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	path := filepath.Join(root, "data", "profile.json")
	writeFixtureFile(t, path, advisorProfileFixture(t, root))
	app := &App{repoRoot: root, dirty: true}
	loaded, err := app.LoadEditorData()
	if err != nil {
		t.Fatal(err)
	}
	var profile map[string]any
	if err := json.Unmarshal(loaded.Profile, &profile); err != nil {
		t.Fatal(err)
	}
	item := profile["education"].([]any)[0].(map[string]any)
	if item["advisor_en"] != "Prof. Cheol-Soo Park" || item["advisor_ko"] != "박철수 교수님" || app.dirty {
		t.Fatal("editor load did not provide clean name-only advisor fields")
	}
	item["advisor_en"] = " Advisor: Advisor： Prof. New "
	item["advisor_ko"] = "지도교수: 지도 교수： 새 교수"
	input, _ := json.Marshal(profile)
	request := saveRequestRevisions(loaded)
	request.SaveProfile = true
	request.Profile = input
	saved, err := app.SaveEditorData(request)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &profile); err != nil {
		t.Fatal(err)
	}
	stored := profile["education"].([]any)[0].(map[string]any)
	if stored["advisor_en"] != "Prof. New" || stored["advisor_ko"] != "새 교수" || app.dirty {
		t.Fatalf("stored advisor fields = %#v / %#v", stored["advisor_en"], stored["advisor_ko"])
	}
	if saved.ProfileRevision != revisionOf(raw) {
		t.Fatal("saved advisor response revision does not match stored data")
	}
}

func TestEducationAdvisorNormalisationKeepsTypeValidation(t *testing.T) {
	root := newTempRepoFixture(t, fixtureSettingsJSON())
	var profile map[string]any
	if err := json.Unmarshal(advisorProfileFixture(t, root), &profile); err != nil {
		t.Fatal(err)
	}
	profile["education"].([]any)[0].(map[string]any)["advisor_en"] = 42
	raw, _ := json.Marshal(profile)
	if _, err := readProfileBytes(raw); err == nil || !strings.Contains(err.Error(), "advisor_en") {
		t.Fatalf("invalid advisor field accepted: %v", err)
	}
}
