package sitebuild

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPublicationKeywordCaseSurvivesValidationAndExports(t *testing.T) {
	root := fixtureRoot(t)
	path := filepath.Join(root, "data", "publications.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var publications []map[string]any
	if err := json.Unmarshal(raw, &publications); err != nil {
		t.Fatal(err)
	}
	keywords := []string{"Archetype", "EnergyPlus", "HVAC", "LLM-based control"}
	publications[0]["keywords_en"] = keywords
	publications[0]["keywords_ko"] = []string{"HVAC 제어", "에너지 모델링"}
	raw, err = json.Marshal(publications)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Build(root, false); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(raw, after) {
		t.Fatalf("build changed source keywords: %v", err)
	}
	for _, name := range []string{"publications.bib", "publications.ris", "publications.csl.json"} {
		export, err := os.ReadFile(filepath.Join(root, "exports", name))
		if err != nil {
			t.Fatal(err)
		}
		for _, keyword := range keywords {
			if !strings.Contains(string(export), keyword) {
				t.Fatalf("%s did not preserve %q", name, keyword)
			}
		}
	}
}
