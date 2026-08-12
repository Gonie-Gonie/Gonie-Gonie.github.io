package main

import (
	"encoding/json"
	"testing"
)

func TestPublicationKoreanVenueOptionalAndPreservedOnUnrelatedEdits(t *testing.T) {
	for _, test := range []struct {
		name    string
		present bool
		value   string
	}{
		{name: "legacy omitted"},
		{name: "explicit empty", present: true},
		{name: "Korean venue", present: true, value: "  대한설비공학회 학술발표대회  "},
	} {
		t.Run(test.name, func(t *testing.T) {
			row := publicationFixtureItem("Domestic paper", "2026-10", false, false)
			row["publication_type"] = "domestic-conference"
			if test.present {
				row["venue_kr"] = test.value
			}
			raw, err := json.Marshal([]any{row})
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := readPublicationsBytes(raw, publicationPersonIDs(), publicationAwardIDs(), publicationTopicIDs())
			if err != nil {
				t.Fatal(err)
			}
			summary := publicationItemSummaries(snapshot)[0]
			if summary.VenueKR != test.value || summary.VenueEN != "Fixture venue" {
				t.Fatalf("venue summary = (%q, %q), want (%q, %q)", summary.VenueEN, summary.VenueKR, "Fixture venue", test.value)
			}
			input := publicationInputFromSummary(summary)
			for _, editNote := range []bool{false, true} {
				if editNote {
					input.Note = "Updated note"
				}
				encoded, err := buildPublicationSaveLocked(snapshot, []PublicationSaveItem{{
					EditorKey: summary.EditorKey, Publication: input,
				}}, publicationPersonIDs(), publicationAwardIDs(), publicationTopicIDs())
				if err != nil {
					t.Fatal(err)
				}
				fields := publicationRawItemByTitle(t, encoded, "Domestic paper")
				if _, present := fields["venue_kr"]; present != test.present {
					t.Errorf("note edited %t: venue_kr presence = %t, want %t", editNote, present, test.present)
				}
				if test.present {
					assertPublicationRawField(t, fields, "venue_kr", test.value)
				}
				assertPublicationRawField(t, fields, "venue_en", "Fixture venue")
			}
		})
	}
}

func TestPublicationKoreanVenueCanBeAddedUpdatedAndCleared(t *testing.T) {
	path, _ := newPublicationFixture(t)
	snapshot := mustReadPublicationSnapshot(t, path)
	summary := publicationItemSummaries(snapshot)[0]
	for _, test := range []struct{ input, want string }{
		{input: "  대한설비공학회 논문집  ", want: "대한설비공학회 논문집"},
		{input: "한국건축친환경설비학회 논문집", want: "한국건축친환경설비학회 논문집"},
		{input: "", want: ""},
	} {
		input := publicationInputFromSummary(summary)
		input.VenueKR = test.input
		encoded, err := buildPublicationSaveLocked(snapshot, []PublicationSaveItem{{
			EditorKey: summary.EditorKey, Publication: input,
		}}, publicationPersonIDs(), publicationAwardIDs(), publicationTopicIDs())
		if err != nil {
			t.Fatal(err)
		}
		fields := publicationRawItemByTitle(t, encoded, summary.TitleEN)
		assertPublicationRawField(t, fields, "venue_kr", test.want)
		assertPublicationRawField(t, fields, "venue_en", summary.VenueEN)
		assertPublicationRawField(t, fields, "future_row_field", map[string]any{
			"flags": []any{true, float64(7)}, "mode": "preserve",
		})
		snapshot, err = readPublicationsBytes(encoded, publicationPersonIDs(), publicationAwardIDs(), publicationTopicIDs())
		if err != nil {
			t.Fatal(err)
		}
		summary = publicationItemSummaries(snapshot)[0]
		if summary.VenueKR != test.want {
			t.Errorf("reloaded Korean venue = %q, want %q", summary.VenueKR, test.want)
		}
	}
}
