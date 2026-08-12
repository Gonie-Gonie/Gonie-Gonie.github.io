package sitebuild

import (
	"reflect"
	"testing"
)

func TestLegacyProceedingsDatesNormalizeBeforePublicationExports(t *testing.T) {
	for _, test := range []struct{ input, want string }{{"2025", "2025-01-01"}, {"2026-10", "2026-10-01"}, {"2024-02-29", "2024-02-29"}} {
		t.Run(test.input, func(t *testing.T) {
			conference := record{"id": "Test 2026", "name_en": "Conference", "proceedings_date": test.input}
			settings := record{"journals": []any{}, "conferences": []any{conference}}
			v := &validator{}
			v.catalogs(settings)
			if len(v.errors) != 0 {
				t.Fatal(v.errors)
			}
			if conference["proceedings_date"] != test.want {
				t.Fatalf("catalog retained a partial proceedings date: %#v", conference)
			}
			resolved := ResolvePublication(record{"publication_type": "international-conference", "conference_id": "Test 2026"}, settings)
			if resolved["date"] != test.want || len(dateParts(resolved)) != 3 {
				t.Fatalf("export did not use a full date: %#v", resolved)
			}
		})
	}
	if !reflect.DeepEqual(dateParts(record{"date": "2026-10"}), []int{2026, 10}) {
		t.Fatal("journal partial date support changed")
	}
}
