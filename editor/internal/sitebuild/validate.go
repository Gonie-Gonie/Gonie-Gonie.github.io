package sitebuild

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

type validator struct {
	root   string
	errors []string
}

func (v *validator) fail(context, format string, args ...any) {
	v.errors = append(v.errors, context+": "+fmt.Sprintf(format, args...))
}
func (v *validator) rows(value any, label string) []record {
	values, ok := value.([]any)
	if !ok {
		v.fail(label, "top-level value must be an array.")
		return nil
	}
	out := []record{}
	for i, x := range values {
		r := obj(x)
		if r == nil {
			v.fail(fmt.Sprintf("%s item %d", label, i+1), "must be an object.")
		} else {
			out = append(out, r)
		}
	}
	return out
}
func (v *validator) fields(value any, expected, optional []string, label string) []record {
	rows := v.rows(value, label)
	for i, r := range rows {
		context := fmt.Sprintf("%s item %d", label, i+1)
		missing, unexpected := []string{}, []string{}
		for _, key := range expected {
			if !has(r, key) {
				missing = append(missing, key)
			}
		}
		for key := range r {
			if !contains(expected, key) && !contains(optional, key) {
				unexpected = append(unexpected, key)
			}
		}
		sort.Strings(unexpected)
		if len(missing) > 0 {
			v.fail(context, "missing field(s): %s.", strings.Join(missing, ", "))
		}
		if len(unexpected) > 0 {
			v.fail(context, "unexpected field(s): %s.", strings.Join(unexpected, ", "))
		}
	}
	return rows
}
func (v *validator) ids(rows []record, label string) map[string]bool {
	ids, duplicates := map[string]bool{}, map[string]bool{}
	for i, r := range rows {
		if !validID(r["id"]) {
			v.fail(fmt.Sprintf("%s item %d", label, i+1), "id must be a JSON string matching ^[a-z0-9]+(?:-[a-z0-9]+)*$ exactly.")
			continue
		}
		s := str(r["id"])
		if ids[s] {
			duplicates[s] = true
		}
		ids[s] = true
	}
	if len(duplicates) > 0 {
		keys := []string{}
		for k := range duplicates {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		v.fail(label, "duplicate id(s): %s.", strings.Join(keys, ", "))
	}
	return ids
}
func (v *validator) visibility(r record, context string) {
	if has(r, "visible_in_CV") {
		if _, ok := r["visible_in_CV"].(bool); !ok {
			v.fail(context, "visible_in_CV must be a boolean when present.")
		}
	}
}
func (v *validator) stringFields(r record, fields []string, context string) {
	for _, key := range fields {
		if !isString(r[key]) {
			v.fail(context, "%s must be a string.", key)
		}
	}
}
func (v *validator) localizedPair(r record, a, b, context string) {
	if !(isString(r[a]) && strings.TrimSpace(str(r[a])) != "") && !(isString(r[b]) && strings.TrimSpace(str(r[b])) != "") {
		v.fail(context, "at least one localized value is required for %s/%s.", a, b)
	}
}
func stringList(value any, nonempty bool) bool {
	values, ok := value.([]any)
	if !ok || (nonempty && len(values) == 0) {
		return false
	}
	for _, x := range values {
		if !isString(x) || strings.TrimSpace(str(x)) == "" {
			return false
		}
	}
	return true
}
func (v *validator) notes(r record, context string) {
	for _, field := range []string{"summary", "summary_en", "summary_ko"} {
		if has(r, field) {
			v.fail(context, "use notes_en and notes_kr instead of summary.")
			break
		}
	}
	for _, field := range []string{"notes_en", "notes_kr"} {
		if !stringList(r[field], true) {
			v.fail(context, "%s must be a non-empty array of non-empty strings.", field)
		}
	}
	a, aok := r["notes_en"].([]any)
	b, bok := r["notes_kr"].([]any)
	if aok && bok && len(a) != len(b) {
		v.fail(context, "notes_en and notes_kr must contain the same number of items.")
	}
}
func sectionSet(visible, hidden any, supported []string) bool {
	a, aok := visible.([]any)
	b, bok := hidden.([]any)
	if !aok || !bok || len(a)+len(b) != len(supported) {
		return false
	}
	seen := map[string]bool{}
	for _, x := range append(append([]any{}, a...), b...) {
		s, ok := x.(string)
		if !ok || !contains(supported, s) || seen[s] {
			return false
		}
		seen[s] = true
	}
	return true
}
func (v *validator) sectionSettings(settings record, visible, hidden string, supported []string, legacy bool) {
	if legacy && settings[visible] == nil && settings[hidden] == nil {
		return
	}
	if !sectionSet(settings[visible], settings[hidden], supported) {
		v.fail("settings.json", "%s and %s must together contain each supported section exactly once: %s.", visible, hidden, strings.Join(supported, ", "))
	}
}
func (v *validator) normalizeTopics(settings record) {
	if !has(settings, "topics") {
		merged := []any{}
		positions := map[string]int{}
		for _, key := range []string{"project_themes", "publication_topics"} {
			rows := v.rows(settings[key], "settings.json "+key)
			v.ids(rows, "settings.json "+key)
			for _, r := range rows {
				identifier, ok := r["id"].(string)
				if !ok {
					continue
				}
				if position, found := positions[identifier]; found {
					current := obj(merged[position])
					next := copyRecord(r)
					for k, x := range current {
						next[k] = x
					}
					if !pyBool(current["color"]) && pyBool(r["color"]) {
						next["color"] = r["color"]
					}
					merged[position] = next
				} else {
					positions[identifier] = len(merged)
					merged = append(merged, copyRecord(r))
				}
			}
		}
		settings["topics"] = merged
		fallback := record{}
		for _, key := range []string{"publication_topic_fallback", "project_theme_fallback"} {
			if pyBool(settings[key]) && obj(settings[key]) == nil {
				v.fail("settings.json", "%s must be an object.", key)
			}
			for k, x := range obj(settings[key]) {
				fallback[k] = x
			}
		}
		settings["topic_fallback"] = fallback
	}
	for _, key := range []string{"project_themes", "publication_topics", "project_theme_fallback", "publication_topic_fallback"} {
		delete(settings, key)
	}
}
func normalizeMainSections(settings record) {
	version, ok := integer(settings["schema_version"])
	if ok && version <= 5 && sectionSet(settings["main_page_sections"], settings["hidden_main_page_sections"], mainSections[:len(mainSections)-1]) {
		settings["hidden_main_page_sections"] = append(array(settings["hidden_main_page_sections"]), "academic_activities")
	}
}
func httpURL(s string) bool {
	// Match urlsplit(...).hostname validation: neither a numeric port nor
	// percent-escaped path is required by the existing schema.
	s = strings.TrimLeft(s, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	s = strings.NewReplacer("\t", "", "\r", "", "\n", "").Replace(s)
	scheme, rest, ok := strings.Cut(s, "://")
	if !ok || !contains([]string{"http", "https"}, strings.ToLower(scheme)) {
		return false
	}
	netloc := strings.FieldsFunc(rest, func(r rune) bool { return r == '/' || r == '?' || r == '#' })
	authority := rest
	if n := strings.IndexAny(rest, "/?#"); n >= 0 {
		authority = rest[:n]
	}
	if len(netloc) == 0 || authority == "" {
		return false
	}
	check := strings.NewReplacer("@", "", ":", "", "#", "", "?", "").Replace(authority)
	normalized := norm.NFKC.String(check)
	if normalized != check && strings.ContainsAny(normalized, "/?#@:") {
		return false
	}
	if i := strings.LastIndex(authority, "@"); i >= 0 {
		authority = authority[i+1:]
	}
	if strings.ContainsAny(authority, "[]") {
		if !strings.HasPrefix(authority, "[") {
			return false
		}
		end := strings.IndexByte(authority, ']')
		if end < 0 || strings.Contains(authority[end+1:], "]") {
			return false
		}
		host := authority[1:end]
		if strings.HasPrefix(host, "v") {
			return regexp.MustCompile(`^v[0-9A-Fa-f]+\..+$`).MatchString(host)
		}
		return strings.Contains(host, ":") && net.ParseIP(strings.SplitN(host, "%", 2)[0]) != nil
	}
	host := strings.SplitN(authority, ":", 2)[0]
	return host != ""
}

var issnPattern = regexp.MustCompile(`^[0-9]{4}-[0-9]{3}[0-9Xx]$`)
var hangulPattern = regexp.MustCompile(`[\x{1100}-\x{11ff}\x{3130}-\x{318f}\x{a960}-\x{a97f}\x{ac00}-\x{d7ff}]`)

func (v *validator) catalogs(settings record) {
	for _, kind := range []string{"journals", "conferences"} {
		value := settings[kind]
		if !has(settings, kind) {
			value = []any{}
		}
		items, ok := value.([]any)
		if !ok || len(items) > 1000 {
			v.fail("settings.json", "%s must be an array of at most 1000 items.", kind)
			continue
		}
		seen := map[string]bool{}
		fields := []string{"id", "name_en", "name_ko", "url"}
		if kind == "journals" {
			fields = append(fields, "publisher_en", "publisher_ko", "issn")
		} else {
			fields = append(fields, "start_date", "end_date", "location_en", "location_ko", "proceedings_publisher_en", "proceedings_publisher_ko", "proceedings_title_en", "proceedings_title_ko", "proceedings_volume", "proceedings_issue", "proceedings_series_en", "proceedings_series_ko", "proceedings_series_volume", "proceedings_date", "proceedings_issn")
		}
		for i, x := range items {
			context := fmt.Sprintf("settings.json %s item %d", kind, i+1)
			raw := obj(x)
			if raw == nil {
				v.fail(context, "must be an object.")
				continue
			}
			r := copyRecord(raw)
			for _, base := range []string{"name", "publisher", "location", "proceedings_publisher", "proceedings_title", "proceedings_series"} {
				if has(r, base) && !has(r, base+"_en") && !has(r, base+"_ko") {
					if !isString(r[base]) {
						v.fail(context, "%s must be a string.", base)
						continue
					}
					lang := "_en"
					if hangulPattern.MatchString(str(r[base])) {
						lang = "_ko"
					}
					r[base+lang] = r[base]
				}
			}
			identifier := str(r["id"])
			if !validCatalogID(kind, r["id"]) {
				v.fail(context, "id must use valid %s ID characters.", kind)
			} else if seen[identifier] {
				v.fail(context, "duplicate id '%s'.", identifier)
			} else {
				seen[identifier] = true
			}
			v.localizedPair(r, "name_en", "name_ko", context)
			for _, field := range fields {
				value := ""
				if has(r, field) {
					if !isString(r[field]) {
						v.fail(context, "%s must be a string.", field)
						continue
					}
					value = str(r[field])
				}
				value = strings.TrimSpace(value)
				maximum := 500
				if field == "url" {
					maximum = 4096
				}
				if utf8.RuneCountInString(value) > maximum || controls.MatchString(value) {
					v.fail(context, "%s must be a string of at most %d characters without control characters.", field, maximum)
					continue
				}
				if strings.HasSuffix(field, "issn") && value != "" && !issnPattern.MatchString(value) {
					v.fail(context, "%s must use the 1234-567X format.", field)
				}
				if strings.HasSuffix(field, "date") && value != "" && !validDate(value, field == "proceedings_date") {
					v.fail(context, "%s must be a valid date.", field)
				}
				if field == "url" && value != "" && !httpURL(value) {
					v.fail(context, "url must be an http(s) URL.")
				}
			}
			start, sok := r["start_date"].(string)
			end, eok := r["end_date"].(string)
			if !has(r, "start_date") {
				sok = true
			}
			if !has(r, "end_date") {
				eok = true
			}
			if sok && eok && end != "" && (start == "" || start > end) {
				v.fail(context, "start_date is required with end_date and cannot be later.")
			}
			indexing := r["indexing"]
			if !has(r, "indexing") {
				indexing = []any{}
			}
			values, ok := indexing.([]any)
			valid := ok && len(values) <= 1
			for _, value := range values {
				if !isString(value) || !contains([]string{"SCIE", "SCOPUS", "KCI"}, str(value)) {
					valid = false
				}
			}
			if !valid {
				v.fail(context, "indexing must be an array with at most one of SCIE, SCOPUS or KCI.")
			}
		}
	}
}
func (v *validator) references(rows []record, field string, valid map[string]bool, label string) {
	for i, r := range rows {
		name := text(r["id"])
		if name == "" {
			name = fmt.Sprintf("item %d", i+1)
		}
		context := label + " '" + name + "'"
		refs, ok := r[field].([]any)
		if !ok || len(refs) == 0 {
			v.fail(context, "%s must be a non-empty array of canonical ID strings.", field)
			continue
		}
		seen := map[string]bool{}
		for j, x := range refs {
			if !validID(x) {
				v.fail(context, "%s reference at position %d must be a canonical ID string.", field, j+1)
				continue
			}
			s := str(x)
			if seen[s] {
				v.fail(context, "duplicate %s reference '%s' at position %d.", field, s, j+1)
			}
			seen[s] = true
			if !valid[s] {
				v.fail(context, "unknown %s reference '%s'.", field, s)
			}
		}
	}
}

var invalidPDF = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f\x7f]`)

func (v *validator) document(r record, context string) {
	if !has(r, "pdf") {
		return
	}
	name, ok := r["pdf"].(string)
	if !ok {
		v.fail(context, "pdf must be a filename string.")
		return
	}
	if name == "" {
		return
	}
	if strings.TrimSpace(name) != name || len(name) > 240 || invalidPDF.MatchString(name) || !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		v.fail(context, "pdf must be a PDF filename in data/document.")
		return
	}
	directory, e := filepath.EvalSymlinks(filepath.Join(v.root, "data", "document"))
	if e != nil {
		v.fail(context, "missing PDF 'data/document/%s'.", name)
		return
	}
	target := filepath.Join(directory, name)
	info, e := os.Lstat(target)
	if e != nil || info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		v.fail(context, "missing PDF 'data/document/%s'.", name)
		return
	}
	resolved, e := filepath.EvalSymlinks(target)
	if e != nil || filepath.Clean(filepath.Dir(resolved)) != filepath.Clean(directory) {
		v.fail(context, "missing PDF 'data/document/%s'.", name)
		return
	}
	f, e := os.Open(target)
	if e != nil {
		v.fail(context, "cannot read PDF '%s'.", name)
		return
	}
	defer f.Close()
	header := make([]byte, 5)
	n, e := f.Read(header)
	if e != nil || n != 5 || string(header) != "%PDF-" {
		v.fail(context, "'%s' is not a PDF file.", name)
	}
}
func (v *validator) education(r record, context string) {
	if has(r, "gpa") {
		gpa := obj(r["gpa"])
		if gpa == nil {
			v.fail(context, "gpa must be an object containing value and max.")
		} else {
			value, vok := number(gpa["value"])
			maximum, mok := number(gpa["max"])
			if !vok || !mok {
				v.fail(context, "gpa.value and gpa.max must be finite numbers.")
			} else if maximum.Sign() <= 0 || value.Sign() < 0 || value.Cmp(maximum) > 0 {
				v.fail(context, "GPA requires 0 <= value <= max and max > 0.")
			}
		}
	}
	if has(r, "thesis_url") {
		value, ok := r["thesis_url"].(string)
		if !ok || (value != "" && (!strings.HasPrefix(value, "http://") && !strings.HasPrefix(value, "https://") || regexp.MustCompile(`[\x00-\x1f\x7f]`).MatchString(value) || len(value) > 4096 || !httpURL(value))) {
			v.fail(context, "thesis_url must be an http(s) URL or an empty string.")
		}
	}
}
func (v *validator) scholarships(value any) {
	for i, r := range v.rows(value, "profile.json scholarships") {
		context := fmt.Sprintf("profile.json: scholarships[%d]", i+1)
		v.visibility(r, context)
		if has(r, "details") {
			v.fail(context, "details is obsolete; use amount instead.")
		}
		amount := obj(r["amount"])
		if amount == nil {
			v.fail(context, "amount must be an object.")
			continue
		}
		n, ok := number(amount["value"])
		if !ok || n.Sign() <= 0 {
			v.fail(context, "amount.value must be a positive finite number.")
		}
		currency, ok := amount["currency"].(string)
		if !ok || !regexp.MustCompile(`^[A-Z]{3}$`).MatchString(currency) {
			v.fail(context, "amount.currency must be a three-letter uppercase code.")
		}
	}
}
func (v *validator) activities(value any) {
	root := obj(value)
	if root == nil {
		v.fail("academic_activities.json", "top-level value must be an object.")
		return
	}
	version, ok := integer(root["schema_version"])
	if !ok || version != 1 {
		v.fail("academic_activities.json", "schema_version must be 1.")
	}
	for _, category := range activityOrder {
		if !has(root, category) {
			v.fail("academic_activities.json", "missing field: %s.", category)
		}
		for i, r := range v.rows(root[category], "academic_activities.json "+category) {
			context := fmt.Sprintf("academic_activities.json %s item %d", category, i+1)
			v.visibility(r, context)
			for _, field := range activityFields[category] {
				if !has(r, field) {
					v.fail(context, "missing field: %s.", field)
				}
				if field != "completed_dates" && !isString(r[field]) {
					v.fail(context, "%s must be a string.", field)
				}
			}
			pairs := [][2]string{}
			switch category {
			case "reviews":
				pairs = append(pairs, [2]string{"journal_en", "journal_ko"})
				dates, ok := r["completed_dates"].([]any)
				if !ok || len(dates) == 0 {
					v.fail(context, "completed_dates must be a non-empty array.")
				}
				seen := map[string]bool{}
				for _, x := range dates {
					if !isString(x) || !validDate(str(x), false) {
						v.fail(context, "completed_dates must contain valid YYYY-MM-DD dates.")
					}
					if isString(x) {
						s := str(x)
						if seen[s] {
							v.fail(context, "completed_dates must not contain duplicate date '%s'.", s)
						}
						seen[s] = true
					}
				}
			case "invited_talks":
				pairs = append(pairs, [2]string{"event_en", "event_ko"}, [2]string{"topic_en", "topic_ko"})
				if !isString(r["date"]) || !validDate(str(r["date"]), false) {
					v.fail(context, "date must be a valid YYYY-MM-DD date.")
				}
			default:
				base := "journal"
				if category == "conference_service" {
					base = "conference"
				}
				if category == "professional_service" {
					base = "organization"
				}
				pairs = append(pairs, [2]string{base + "_en", base + "_ko"}, [2]string{"role_en", "role_ko"})
				for _, field := range []string{"start_date", "end_date"} {
					s, ok := r[field].(string)
					if field == "end_date" && ok && s == "" {
						continue
					}
					if !ok || !validDate(s, false) {
						v.fail(context, "%s must be a valid YYYY-MM-DD date (end_date may be blank).", field)
					}
				}
				if validDate(str(r["start_date"]), false) && validDate(str(r["end_date"]), false) && str(r["start_date"]) > str(r["end_date"]) {
					v.fail(context, "start_date must not be later than end_date.")
				}
			}
			for _, pair := range pairs {
				v.localizedPair(r, pair[0], pair[1], context)
			}
		}
	}
}

func boardDate(s string) (string, bool) {
	if !regexp.MustCompile(`^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$`).MatchString(s) {
		return "", false
	}
	var year, month, day int
	if _, e := fmt.Sscanf(s, "%d-%d-%d", &year, &month, &day); e != nil {
		return "", false
	}
	canonical := fmt.Sprintf("%04d-%02d-%02d", year, month, day)
	return canonical, validDate(canonical, false)
}

func validateData(root string, data record) []string {
	v := &validator{root: root}
	settings := obj(data["settings"])
	profile := obj(data["profile"])
	if settings == nil {
		v.fail("settings.json", "top-level value must be an object.")
		return v.errors
	}
	if profile == nil {
		v.fail("profile.json", "top-level value must be an object.")
		return v.errors
	}
	v.normalizeTopics(settings)
	v.catalogs(settings)
	v.themeSettings(settings)
	people := v.rows(data["people"], "people.json")
	projects := v.rows(data["projects"], "projects.json")
	software := v.rows(data["software"], "software.json")
	board := v.rows(data["board"], "board.json")
	publications := v.fields(data["publications"], publicationFields, []string{"visible_in_CV", "journal_id", "conference_id", "volume", "issue", "pages", "elocator", "online_date", "issue_date"}, "publications.json")
	awards := v.fields(data["awards"], awardFields, []string{"visible_in_CV", "pdf"}, "awards.json")
	normalizeMainSections(settings)
	v.sectionSettings(settings, "main_page_sections", "hidden_main_page_sections", mainSections, false)
	version, versionOK := integer(settings["schema_version"])
	v.sectionSettings(settings, "cv_sections", "hidden_cv_sections", cvSections, versionOK && version <= 4)
	v.ids(software, "software.json")
	peopleIDs := v.ids(people, "people.json")
	awardIDs := v.ids(awards, "awards.json")
	v.references(publications, "author_ids", peopleIDs, "publications.json")
	v.activities(data["academic_activities"])
	for i, r := range awards {
		context := fmt.Sprintf("awards.json item %d", i+1)
		v.document(r, context)
		v.visibility(r, context)
		v.stringFields(r, awardFields, context)
		if isString(r["date"]) && !validDate(str(r["date"]), false) {
			v.fail(context, "date must be a valid YYYY-MM-DD date.")
		}
		v.localizedPair(r, "title_en", "title_ko", context)
		v.localizedPair(r, "organization_en", "organization_ko", context)
	}
	for i, r := range software {
		context := fmt.Sprintf("software.json item %d", i+1)
		v.visibility(r, context)
		if !contains([]string{"release", "preview", "development"}, str(r["stage"])) {
			v.fail(context, "stage must be release, preview, or development.")
		}
		v.notes(r, context)
	}
	for i, r := range board {
		context := fmt.Sprintf("board.json item %d", i+1)
		if has(r, "date") {
			v.fail(context, "use start_date and end_date instead of date.")
		}
		start, end := text(r["start_date"]), text(r["end_date"])
		parsedStart, startOK := boardDate(start)
		parsedEnd, endOK := boardDate(end)
		if !startOK {
			v.fail(context, "start_date must use YYYY-MM-DD.")
		}
		if end != "" && !endOK {
			v.fail(context, "end_date must be blank or use YYYY-MM-DD.")
		}
		if startOK && endOK && parsedStart > parsedEnd {
			v.fail(context, "start_date must not be later than end_date.")
		}
		v.stringFields(r, []string{"content_en", "content_ko"}, context)
	}
	selfCount := 0
	for _, r := range people {
		if b, ok := r["is_self"].(bool); ok && b {
			selfCount++
		}
		context := "people.json '" + text(r["id"]) + "'"
		if localized(r, "name", "en") == "" {
			v.fail(context, "a localized name is required.")
		}
		for _, lang := range []string{"en", "ko"} {
			if !stringList(r["notes_"+lang], false) {
				v.fail(context, "notes_%s must be a list of non-empty strings.", lang)
			}
		}
	}
	if selfCount != 1 {
		v.fail("people.json", "exactly one person must have is_self set to true.")
	}
	topics := v.rows(settings["topics"], "settings.json topics")
	topicIDs := v.ids(topics, "settings.json topics")
	for _, r := range topics {
		context := "settings.json topic '" + text(r["id"]) + "'"
		if has(r, "color") && (!isString(r["color"]) || !regexp.MustCompile(`^#[0-9a-fA-F]{6}$`).MatchString(str(r["color"]))) {
			v.fail(context, "color must use #RRGGBB when present.")
		}
		for _, lang := range []string{"en", "ko"} {
			if !isString(r["label_"+lang]) || text(r["label_"+lang]) == "" {
				v.fail(context, "label_%s is required.", lang)
			}
		}
	}
	for _, lang := range []string{"en", "ko"} {
		seen := map[string]bool{}
		duplicate := false
		for _, r := range topics {
			label := cases.Fold().String(text(r["label_"+lang]))
			if label != "" && seen[label] {
				duplicate = true
			}
			seen[label] = true
		}
		if duplicate {
			v.fail("settings.json topics", "duplicate label_%s value(s).", lang)
		}
	}
	fallback := obj(settings["topic_fallback"])
	if !has(settings, "topic_fallback") {
		fallback = record{}
	}
	if fallback == nil {
		v.fail("settings.json", "topic_fallback must be an object.")
	} else {
		for _, lang := range []string{"en", "ko"} {
			if !isString(fallback["label_"+lang]) || text(fallback["label_"+lang]) == "" {
				v.fail("settings.json", "topic_fallback.label_%s is required.", lang)
			}
		}
	}
	for i, r := range projects {
		context := fmt.Sprintf("projects.json item %d", i+1)
		v.visibility(r, context)
		if has(r, "id") {
			v.fail(context, "id is not used.")
		}
		if has(r, "period") {
			v.fail(context, "use start_date and end_date instead of period.")
		}
		v.notes(r, context)
		media := r["media"]
		if has(r, "media") {
			for j, m := range v.rows(media, context+" media") {
				mc := fmt.Sprintf("%s media %d", context, j+1)
				if has(m, "caption_kr") || has(m, "caption-en") {
					v.fail(mc, "use caption_en and caption_ko.")
				}
				if (text(m["caption_en"]) != "") != (text(m["caption_ko"]) != "") {
					v.fail(mc, "caption_en and caption_ko must both be filled or both be blank.")
				}
			}
		}
		for _, field := range []string{"start_date", "end_date"} {
			if !validDate(text(r[field]), false) {
				v.fail(context, "%s must use valid YYYY-MM-DD.", field)
			}
		}
		if validDate(text(r["start_date"]), false) && validDate(text(r["end_date"]), false) && text(r["start_date"]) > text(r["end_date"]) {
			v.fail(context, "start_date must not be later than end_date.")
		}
		if !validID(r["theme"]) {
			v.fail(context, "theme must be a canonical ID string.")
		} else if !topicIDs[str(r["theme"])] {
			v.fail(context, "unknown theme reference '%s'.", str(r["theme"]))
		}
	}
	catalogs := map[string]map[string]bool{}
	for _, kind := range []string{"journals", "conferences"} {
		catalogs[kind] = map[string]bool{}
		for _, x := range array(settings[kind]) {
			r := obj(x)
			if isString(r["id"]) {
				catalogs[kind][str(r["id"])] = true
			}
		}
	}
	for i, r := range publications {
		context := fmt.Sprintf("publications.json item %d", i+1)
		v.visibility(r, context)
		for _, field := range []string{"venue", "venue_en", "venue_kr"} {
			if has(r, field) {
				v.fail(context, "use journal_id / conference_id and bibliography fields instead of a manual venue.")
				break
			}
		}
		for _, field := range []string{"volume", "issue", "pages", "elocator", "online_date", "issue_date"} {
			value := ""
			if has(r, field) {
				if !isString(r[field]) {
					v.fail(context, "%s must be a string of at most 500 characters without control characters.", field)
					continue
				}
				value = str(r[field])
			}
			if utf8.RuneCountInString(value) > 500 || controls.MatchString(value) {
				v.fail(context, "%s must be a string of at most 500 characters without control characters.", field)
				continue
			}
			if value != "" && (field == "online_date" || field == "issue_date") && !validDate(value, true) {
				v.fail(context, "%s must be a valid YYYY, YYYY-MM or YYYY-MM-DD date.", field)
			}
		}
		for _, spec := range [][3]string{{"journal_id", "journals", "-journal"}, {"conference_id", "conferences", "-conference"}} {
			field, kind, suffix := spec[0], spec[1], spec[2]
			reference := r[field]
			if !has(r, field) {
				reference = ""
			}
			if !isString(reference) || (str(reference) != "" && !validCatalogID(kind, reference)) {
				v.fail(context, "%s must be empty or a valid %s ID string.", field, kind)
			} else if str(reference) != "" {
				if !strings.HasSuffix(str(r["publication_type"]), suffix) {
					v.fail(context, "%s does not match publication_type.", field)
				}
				if !catalogs[kind][str(reference)] {
					v.fail(context, "unknown %s reference '%s'.", field, str(reference))
				}
			}
		}
		for _, spec := range []struct {
			field string
			ids   map[string]bool
		}{{"topic", topicIDs}, {"award_id", awardIDs}} {
			value := r[spec.field]
			if isString(value) && str(value) != "" {
				if !validID(value) {
					v.fail(context, "non-empty %s must be a canonical ID string.", spec.field)
				} else if !spec.ids[str(value)] {
					v.fail(context, "unknown %s reference '%s'.", spec.field, str(value))
				}
			}
		}
		for _, field := range publicationFields {
			if !contains([]string{"keywords_en", "keywords_ko", "author_ids", "under_review", "in_press"}, field) && !isString(r[field]) {
				v.fail(context, "%s must be a string.", field)
			}
		}
		if localized(r, "title", "en") == "" {
			v.fail(context, "at least one localized title is required.")
		}
		for _, field := range []string{"keywords_en", "keywords_ko"} {
			if !stringList(r[field], false) {
				v.fail(context, "%s must be an array of non-empty strings.", field)
			} else {
				for _, x := range array(r[field]) {
					if str(x) != lower(str(x)) {
						v.fail(context, "%s must use lowercase.", field)
						break
					}
				}
			}
		}
		if !contains([]string{"international-journal", "domestic-journal", "international-conference", "domestic-conference"}, str(r["publication_type"])) {
			v.fail(context, "unsupported publication_type '%s'.", str(r["publication_type"]))
		}
		for _, field := range []string{"under_review", "in_press"} {
			if _, ok := r[field].(bool); !ok {
				v.fail(context, "%s must be a boolean.", field)
			}
		}
		if truthy(r["under_review"]) && truthy(r["in_press"]) {
			v.fail(context, "under_review and in_press cannot both be true.")
		}
		if isString(r["date"]) && text(r["date"]) != "" && !validDate(text(r["date"]), true) {
			v.fail(context, "date must use valid YYYY, YYYY-MM, or YYYY-MM-DD.")
		}
	}
	for _, key := range append([]string{"schema_version", "identity", "profile_card", "intro", "contact"}, profileSections...) {
		if !has(profile, key) {
			v.fail("profile.json", "missing top-level key '%s'.", key)
		}
	}
	card := obj(profile["profile_card"])
	if _, ok := card["credentials"].([]any); !ok {
		v.fail("profile.json", "profile_card.credentials must be a list.")
	}
	for _, section := range profileSections {
		if section == "scholarships" {
			continue
		}
		for i, r := range v.rows(profile[section], "profile.json "+section) {
			context := fmt.Sprintf("profile.json %s item %d", section, i+1)
			v.visibility(r, context)
			if section == "certifications" {
				v.document(r, context)
			}
			if section == "education" {
				v.education(r, context)
			}
		}
	}
	v.scholarships(profile["scholarships"])
	return v.errors
}
