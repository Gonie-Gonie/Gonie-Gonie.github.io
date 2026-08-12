package sitebuild

import (
	"reflect"
	"strings"
	"testing"
)

func TestHiddenWebPagesValidation(t *testing.T) {
	for _, test := range []struct {
		name    string
		setting record
		valid   bool
	}{
		{"omitted", record{}, true},
		{"empty", record{"hidden_web_pages": []any{}}, true},
		{"all", record{"hidden_web_pages": []any{"publications", "projects", "software", "board"}}, true},
		{"one", record{"hidden_web_pages": []any{"software"}}, true},
		{"null", record{"hidden_web_pages": nil}, false},
		{"string", record{"hidden_web_pages": "software"}, false},
		{"object", record{"hidden_web_pages": record{"software": false}}, false},
		{"unknown", record{"hidden_web_pages": []any{"home"}}, false},
		{"duplicate", record{"hidden_web_pages": []any{"board", "board"}}, false},
		{"boolean item", record{"hidden_web_pages": []any{false}}, false},
		{"null item", record{"hidden_web_pages": []any{nil}}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			v := &validator{}
			v.webVisibilitySettings(test.setting)
			if (len(v.errors) == 0) != test.valid {
				t.Fatalf("validation errors = %#v, valid %v", v.errors, test.valid)
			}
			if test.name == "omitted" && !reflect.DeepEqual(test.setting["hidden_web_pages"], []any{}) {
				t.Fatalf("legacy default = %#v", test.setting["hidden_web_pages"])
			}
		})
	}
}

func TestHiddenWebSectionsValidation(t *testing.T) {
	for _, test := range []struct {
		name    string
		setting record
		valid   bool
	}{
		{"omitted", record{}, true},
		{"empty", record{"hidden_web_sections": []any{}}, true},
		{"all", record{"hidden_web_sections": []any{"publication_timeline", "publication_collaborators", "project_timeline"}}, true},
		{"null", record{"hidden_web_sections": nil}, false},
		{"string", record{"hidden_web_sections": "project_timeline"}, false},
		{"unknown", record{"hidden_web_sections": []any{"projects"}}, false},
		{"duplicate", record{"hidden_web_sections": []any{"project_timeline", "project_timeline"}}, false},
		{"null item", record{"hidden_web_sections": []any{nil}}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			v := &validator{}
			v.webVisibilitySettings(test.setting)
			if (len(v.errors) == 0) != test.valid {
				t.Fatalf("validation errors = %#v, valid %v", v.errors, test.valid)
			}
			if test.name == "omitted" && !reflect.DeepEqual(test.setting["hidden_web_sections"], []any{}) {
				t.Fatalf("legacy default = %#v", test.setting["hidden_web_sections"])
			}
		})
	}
}

func TestHiddenWebPagesDoNotSkipRawDataValidation(t *testing.T) {
	root, data := repositoryData(t)
	obj(data["settings"])["hidden_web_pages"] = []any{"publications", "projects", "software", "board"}
	first(data, "software")["stage"] = "invalid"
	errors := strings.Join(validateData(root, data), "\n")
	if !strings.Contains(errors, "stage must be release, preview, or development") {
		t.Fatalf("hidden Web software skipped content validation: %s", errors)
	}
}
