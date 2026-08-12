package profiledates

import (
	"reflect"
	"testing"
)

func TestLegacyRangesAndCanonicalPrecedence(t *testing.T) {
	for _, test := range []struct {
		name, field, period, start, end string
	}{
		{"education months", "period", "2022.03.–2026.02.", "2022-03-01", "2026-02-01"},
		{"english ongoing", "period_en", "2026.05–Present", "2026-05-01", ""},
		{"korean ongoing", "period_ko", "2026.05–현재", "2026-05-01", ""},
		{"alternate korean key", "period_kr", "2026.05–현재", "2026-05-01", ""},
		{"legacy years", "period", "2022–2026", "2022-01-01", "2026-01-01"},
		{"hyphen range", "period_en", "2025-present", "2025-01-01", ""},
		{"actual dates", "period", "2024-02-29 – 2026-02-28", "2024-02-29", "2026-02-28"},
	} {
		t.Run(test.name, func(t *testing.T) {
			item := map[string]any{test.field: test.period, "future_metadata": "keep"}
			if err := Normalize(item); err != nil {
				t.Fatal(err)
			}
			want := map[string]any{"start_date": test.start, "end_date": test.end, "future_metadata": "keep"}
			if !reflect.DeepEqual(item, want) {
				t.Fatalf("normalized = %#v, want %#v", item, want)
			}
			if err := Validate(item); err != nil {
				t.Fatal(err)
			}
		})
	}
	item := map[string]any{"start_date": "2024-02-29", "end_date": "", "period": false, "period_en": "2022–2023", "period_ko": "old", "period_kr": "old"}
	if err := Normalize(item); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(item, map[string]any{"start_date": "2024-02-29", "end_date": ""}) {
		t.Fatalf("canonical dates did not supersede legacy fields: %#v", item)
	}
}

func TestDatesRejectMissingInvalidAndReversedValues(t *testing.T) {
	for _, test := range []struct {
		name string
		item map[string]any
	}{
		{"missing start", map[string]any{"end_date": ""}},
		{"missing end", map[string]any{"start_date": "2026-05-01"}},
		{"empty start", map[string]any{"start_date": "", "end_date": ""}},
		{"numeric start", map[string]any{"start_date": 2026, "end_date": ""}},
		{"null end", map[string]any{"start_date": "2026-05-01", "end_date": nil}},
		{"month only", map[string]any{"start_date": "2026-05", "end_date": ""}},
		{"invalid day", map[string]any{"start_date": "2026-02-29", "end_date": ""}},
		{"invalid end", map[string]any{"start_date": "2026-02-01", "end_date": "2026-02-30"}},
		{"zero year", map[string]any{"start_date": "0000-01-01", "end_date": ""}},
		{"reversed", map[string]any{"start_date": "2026-05-02", "end_date": "2026-05-01"}},
		{"partially migrated", map[string]any{"start_date": "2026-05-01", "period_en": "2025-present"}},
		{"invalid legacy month", map[string]any{"period": "2022.13.–2026.02."}},
		{"invalid legacy text", map[string]any{"period_en": "recently"}},
		{"numeric legacy", map[string]any{"period": 2022}},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := Normalize(test.item)
			if err == nil {
				err = Validate(test.item)
			}
			if err == nil {
				t.Fatalf("invalid dates accepted: %#v", test.item)
			}
		})
	}
}
