package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
)

var profileCVSections = []string{
	"experience",
	"education",
	"teaching",
	"scholarships",
	"certifications",
	"skills",
}

type profileSnapshot struct {
	Raw  []byte
	Data map[string]any
}

type ProfileMediaSummary struct {
	EditorKey    string `json:"editor_key,omitempty"`
	Src          string `json:"src"`
	Type         string `json:"type,omitempty"`
	Poster       string `json:"poster,omitempty"`
	OriginalName string `json:"original_name,omitempty"`
	Size         int64  `json:"size,omitempty"`
	PreviewURL   string `json:"preview_url,omitempty"`
}

func readProfile(path string) (profileSnapshot, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return profileSnapshot{}, fmt.Errorf("profile.json 읽기 실패: %w", err)
	}
	return readProfileBytes(raw)
}

func readProfileBytes(raw []byte) (profileSnapshot, error) {
	var data map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&data); err != nil {
		return profileSnapshot{}, fmt.Errorf("profile.json 파싱 실패: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return profileSnapshot{}, errors.New("profile.json에는 하나의 JSON 값만 있어야 합니다")
	}
	if data == nil {
		return profileSnapshot{}, errors.New("profile.json은 JSON 객체여야 합니다")
	}
	if err := validateProfileShape(data); err != nil {
		return profileSnapshot{}, err
	}
	return profileSnapshot{Raw: append([]byte(nil), raw...), Data: data}, nil
}

func validateProfileShape(data map[string]any) error {
	identity, err := profileObject(data, "identity", "profile.json")
	if err != nil {
		return err
	}
	if err := profileStrings(identity, "profile.json identity", "name_en", "name_ko", "role_en", "role_ko", "affiliation_en", "affiliation_ko", "location_en", "location_ko"); err != nil {
		return err
	}
	card, err := profileObject(data, "profile_card", "profile.json")
	if err != nil {
		return err
	}
	if err := profileStrings(card, "profile.json profile_card", "title_en", "title_ko"); err != nil {
		return err
	}
	media, err := profileObject(card, "media", "profile.json profile_card")
	if err != nil {
		return err
	}
	if err := profileStrings(media, "profile.json profile_card media", "src", "type"); err != nil {
		return err
	}
	if poster, exists := media["poster"]; exists {
		if _, ok := poster.(string); !ok {
			return errors.New("profile.json profile_card media poster는 문자열이어야 합니다")
		}
	}
	credentials, err := profileObjectArray(card, "credentials", "profile.json profile_card")
	if err != nil {
		return err
	}
	for index, item := range credentials {
		contextLabel := fmt.Sprintf("profile.json credentials %d", index+1)
		if err := profileStrings(item, contextLabel, "name_en", "name_ko"); err != nil {
			return err
		}
		if err := profileMeaningfulPrimaryField(item, contextLabel, "name_en", "name_ko"); err != nil {
			return err
		}
	}
	intro, err := profileObject(data, "intro", "profile.json")
	if err != nil {
		return err
	}
	if err := profileStrings(intro, "profile.json intro", "short_en", "short_ko"); err != nil {
		return err
	}
	contact, err := profileObject(data, "contact", "profile.json")
	if err != nil {
		return err
	}
	if err := profileStrings(contact, "profile.json contact", "email", "github", "orcid", "scholar"); err != nil {
		return err
	}
	if linkedin, exists := contact["linkedin"]; exists {
		if _, ok := linkedin.(string); !ok {
			return errors.New("profile.json contact의 linkedin은 문자열이어야 합니다")
		}
	}
	for _, section := range profileCVSections {
		items, err := profileObjectArray(data, section, "profile.json")
		if err != nil {
			return err
		}
		for index, item := range items {
			contextLabel := fmt.Sprintf("profile.json의 %s %d번째 항목", section, index+1)
			if visible, exists := item["visible_in_CV"]; exists {
				if _, ok := visible.(bool); !ok {
					return fmt.Errorf("%s의 visible_in_CV는 Boolean이어야 합니다", contextLabel)
				}
			}
			var fields []string
			var primaryFields []string
			switch section {
			case "experience":
				fields = []string{"title_en", "title_ko", "institution_en", "institution_ko", "period_en", "period_ko"}
				primaryFields = []string{"title_en", "title_ko"}
			case "education":
				fields = []string{"degree_en", "degree_ko", "institution_en", "institution_ko", "period", "advisor_en", "advisor_ko", "thesis_en", "thesis_ko"}
				primaryFields = []string{"degree_en", "degree_ko"}
			case "teaching":
				fields = []string{"title_en", "title_ko", "detail_en", "detail_ko", "period"}
				primaryFields = []string{"title_en", "title_ko"}
			case "scholarships":
				fields = []string{"name_en", "name_ko", "period_en", "period_ko", "summary_en", "summary_ko"}
				primaryFields = []string{"name_en", "name_ko"}
			case "certifications":
				fields = []string{"name_en", "name_ko", "issuer_en", "issuer_ko", "date"}
				primaryFields = []string{"name_en", "name_ko"}
			case "skills":
				fields = []string{"name", "detail_en", "detail_ko"}
				primaryFields = []string{"name"}
			}
			if err := profileStrings(item, contextLabel, fields...); err != nil {
				return err
			}
			if err := profileMeaningfulPrimaryField(item, contextLabel, primaryFields...); err != nil {
				return err
			}
			if section == "certifications" {
				if _, err := parseCanonicalDate(item["date"].(string)); err != nil {
					return fmt.Errorf("%s의 date는 YYYY-MM-DD 형식의 실제 날짜여야 합니다", contextLabel)
				}
			}
			if section == "scholarships" {
				amount, err := profileObject(item, "amount", contextLabel)
				if err != nil {
					return err
				}
				if err := validateScholarshipAmount(amount, contextLabel); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func validateScholarshipAmount(amount map[string]any, contextLabel string) error {
	value, exists := amount["value"]
	if !exists {
		return fmt.Errorf("%s의 amount.value는 0보다 큰 숫자여야 합니다", contextLabel)
	}
	var numericValue float64
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil {
			return fmt.Errorf("%s의 amount.value는 0보다 큰 숫자여야 합니다", contextLabel)
		}
		numericValue = parsed
	case float64:
		numericValue = typed
	default:
		return fmt.Errorf("%s의 amount.value는 0보다 큰 숫자여야 합니다", contextLabel)
	}
	if math.IsNaN(numericValue) || math.IsInf(numericValue, 0) || numericValue <= 0 {
		return fmt.Errorf("%s의 amount.value는 0보다 큰 숫자여야 합니다", contextLabel)
	}

	currency, ok := amount["currency"].(string)
	if !ok || len(currency) != 3 {
		return fmt.Errorf("%s의 amount.currency는 대문자 영문 3자리 통화 코드여야 합니다", contextLabel)
	}
	for _, character := range currency {
		if character < 'A' || character > 'Z' {
			return fmt.Errorf("%s의 amount.currency는 대문자 영문 3자리 통화 코드여야 합니다", contextLabel)
		}
	}
	return nil
}

func profileObject(parent map[string]any, key, contextLabel string) (map[string]any, error) {
	value, ok := parent[key].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s의 %s는 JSON 객체여야 합니다", contextLabel, key)
	}
	return value, nil
}

func profileObjectArray(parent map[string]any, key, contextLabel string) ([]map[string]any, error) {
	values, ok := parent[key].([]any)
	if !ok {
		return nil, fmt.Errorf("%s의 %s는 JSON 배열이어야 합니다", contextLabel, key)
	}
	result := make([]map[string]any, 0, len(values))
	for index, value := range values {
		item, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s의 %s %d번째 항목은 JSON 객체여야 합니다", contextLabel, key, index+1)
		}
		result = append(result, item)
	}
	return result, nil
}

func profileStrings(item map[string]any, contextLabel string, fields ...string) error {
	for _, field := range fields {
		if _, ok := item[field].(string); !ok {
			return fmt.Errorf("%s의 %s는 문자열이어야 합니다", contextLabel, field)
		}
	}
	return nil
}

func profileMeaningfulPrimaryField(item map[string]any, contextLabel string, fields ...string) error {
	for _, field := range fields {
		value, _ := item[field].(string)
		if strings.TrimSpace(value) != "" {
			return nil
		}
	}
	return fmt.Errorf("%s은 %s 중 하나를 입력해야 합니다", contextLabel, strings.Join(fields, " 또는 "))
}

// profileForEditor returns a detached JSON object and materializes the default
// visibility value. The source file is untouched until an explicit save.
func profileForEditor(snapshot profileSnapshot) (json.RawMessage, error) {
	data, err := cloneJSONMap(snapshot.Data)
	if err != nil {
		return nil, err
	}
	removeDeprecatedScholarshipDetails(data)
	ensureProfileContactDefaults(data)
	ensureProfileCVVisibility(data)
	return json.Marshal(data)
}

func buildProfileSave(input json.RawMessage) ([]byte, profileSnapshot, error) {
	if len(input) == 0 || bytes.Equal(bytes.TrimSpace(input), []byte("null")) {
		return nil, profileSnapshot{}, errors.New("저장할 profile.json 입력이 없습니다")
	}
	parsed, err := readProfileBytes(input)
	if err != nil {
		return nil, profileSnapshot{}, err
	}
	removeDeprecatedScholarshipDetails(parsed.Data)
	removeKnownProfileEditorMetadata(parsed.Data)
	ensureProfileContactDefaults(parsed.Data)
	ensureProfileCVVisibility(parsed.Data)
	if err := validateProfileShape(parsed.Data); err != nil {
		return nil, profileSnapshot{}, err
	}
	encoded, err := json.MarshalIndent(parsed.Data, "", "  ")
	if err != nil {
		return nil, profileSnapshot{}, fmt.Errorf("profile.json 인코딩 실패: %w", err)
	}
	encoded = append(encoded, '\n')
	stored, err := readProfileBytes(encoded)
	if err != nil {
		return nil, profileSnapshot{}, fmt.Errorf("저장할 profile.json 확인 실패: %w", err)
	}
	return encoded, stored, nil
}

// ensureProfileContactDefaults keeps older profile.json files editable without
// mutating them during load. The new field is materialized only in the detached
// editor payload and therefore reaches disk only after an explicit save.
func ensureProfileContactDefaults(data map[string]any) {
	contact, _ := data["contact"].(map[string]any)
	if contact == nil {
		return
	}
	if _, exists := contact["linkedin"]; !exists {
		contact["linkedin"] = ""
	}
}

// applyProfileMediaActionLocked converts a single staged Explorer image into
// profile.json's media reference. Staged bytes remain outside the repository;
// SaveEditorData publishes them only after every revision has been rechecked.
func (a *App) applyProfileMediaActionLocked(
	root string,
	profile profileSnapshot,
	stageToken string,
	remove bool,
	reservedNames map[string]bool,
	claimedStageTokens map[string]bool,
) ([]byte, profileSnapshot, []pendingBoardMedia, []string, error) {
	stageToken = strings.TrimSpace(stageToken)
	if stageToken != "" && remove {
		return nil, profileSnapshot{}, nil, nil, errors.New("프로필 이미지는 교체와 제거를 동시에 요청할 수 없습니다")
	}
	if stageToken == "" && !remove {
		return profile.Raw, profile, nil, nil, nil
	}

	data, err := cloneJSONMap(profile.Data)
	if err != nil {
		return nil, profileSnapshot{}, nil, nil, fmt.Errorf("프로필 이미지 편집 데이터 복제 실패: %w", err)
	}
	card, _ := data["profile_card"].(map[string]any)
	media, _ := card["media"].(map[string]any)
	if media == nil {
		return nil, profileSnapshot{}, nil, nil, errors.New("profile.json profile_card media가 올바르지 않습니다")
	}

	if remove {
		media["src"] = ""
		media["type"] = "image"
		delete(media, "poster")
		encoded, _ := json.Marshal(data)
		nextRaw, nextProfile, err := buildProfileSave(encoded)
		return nextRaw, nextProfile, nil, nil, err
	}

	staged, exists := a.boardMedia[stageToken]
	if !exists {
		return nil, profileSnapshot{}, nil, nil, errors.New("프로필 이미지 임시 파일이 없습니다. 다시 드롭해 주세요")
	}
	if claimedStageTokens[stageToken] {
		return nil, profileSnapshot{}, nil, nil, fmt.Errorf("이미지 '%s'가 중복으로 연결되었습니다", staged.OriginalName)
	}
	filename := nextProfileMediaName(stageToken, staged.Extension, reservedNames)
	reservedNames[strings.ToLower(filename)] = true
	media["src"] = filename
	media["type"] = "image"
	delete(media, "poster")
	encoded, err := json.Marshal(data)
	if err != nil {
		return nil, profileSnapshot{}, nil, nil, fmt.Errorf("프로필 이미지 정보 인코딩 실패: %w", err)
	}
	nextRaw, nextProfile, err := buildProfileSave(encoded)
	if err != nil {
		return nil, profileSnapshot{}, nil, nil, err
	}
	return nextRaw, nextProfile, []pendingBoardMedia{{
		Token:           stageToken,
		StagedPath:      staged.Path,
		DestinationPath: filepath.Join(root, "data", "media", filename),
	}}, []string{stageToken}, nil
}

func nextProfileMediaName(stageToken, extension string, reserved map[string]bool) string {
	tokenPart := strings.ToLower(strings.TrimSpace(stageToken))
	if len(tokenPart) > 12 {
		tokenPart = tokenPart[:12]
	}
	if tokenPart == "" {
		tokenPart = "image"
	}
	base := "profile-" + tokenPart
	for suffix := 0; ; suffix++ {
		filename := base + extension
		if suffix > 0 {
			filename = fmt.Sprintf("%s-%d%s", base, suffix+1, extension)
		}
		if !reserved[strings.ToLower(filename)] {
			return filename
		}
	}
}

func profileMediaForEditor(profile profileSnapshot, root string) ProfileMediaSummary {
	card, _ := profile.Data["profile_card"].(map[string]any)
	media, _ := card["media"].(map[string]any)
	source, _ := media["src"].(string)
	mediaType, _ := media["type"].(string)
	poster, _ := media["poster"].(string)
	summary := ProfileMediaSummary{
		Src:    source,
		Type:   mediaType,
		Poster: poster,
	}
	if source != "" {
		summary.OriginalName = pathpkg.Base(source)
	}
	if encoded, err := json.Marshal(media); err == nil {
		hash := revisionOf(encoded)
		summary.EditorKey = "profile:" + hash[:20]
	}
	if source == "" {
		return summary
	}
	resolved, info, err := resolveBoardMediaPath(root, source, "profile.json 프로필 이미지")
	if err != nil {
		// Legacy/manual JSON remains editable even when its referenced file is
		// temporarily unavailable. The editor simply omits the preview.
		return summary
	}
	summary.Size = info.Size()
	summary.PreviewURL = boardThumbnailDataURL(resolved)
	if summary.PreviewURL == "" && poster != "" {
		if resolvedPoster, _, err := resolveBoardMediaPath(root, poster, "profile.json 프로필 이미지 poster"); err == nil {
			summary.PreviewURL = boardThumbnailDataURL(resolvedPoster)
		}
	}
	return summary
}

func ensureProfileCVVisibility(data map[string]any) {
	for _, section := range profileCVSections {
		items, _ := data[section].([]any)
		for _, value := range items {
			if item, ok := value.(map[string]any); ok {
				if _, exists := item["visible_in_CV"]; !exists {
					item["visible_in_CV"] = true
				}
			}
		}
	}
}

func removeKnownProfileEditorMetadata(data map[string]any) {
	if card, ok := data["profile_card"].(map[string]any); ok {
		removeProfileArrayMetadata(card["credentials"])
	}
	for _, section := range profileCVSections {
		removeProfileArrayMetadata(data[section])
	}
}

func removeProfileArrayMetadata(value any) {
	items, _ := value.([]any)
	for _, value := range items {
		item, ok := value.(map[string]any)
		if !ok {
			continue
		}
		delete(item, "_clientKey")
		delete(item, "_editorKey")
	}
}

// details was the former free-form scholarship representation. It is a known
// retired field, so it is deliberately omitted from detached editor payloads
// and from every newly saved profile while unrelated unknown fields survive.
func removeDeprecatedScholarshipDetails(data map[string]any) {
	items, _ := data["scholarships"].([]any)
	for _, value := range items {
		if item, ok := value.(map[string]any); ok {
			delete(item, "details")
		}
	}
}

func cloneJSONMap(value map[string]any) (map[string]any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func profileSectionCounts(profile profileSnapshot, awards int) map[string]int {
	counts := make(map[string]int, len(supportedMainPageSections))
	for _, section := range profileCVSections {
		if items, ok := profile.Data[section].([]any); ok {
			counts[section] = len(items)
		}
	}
	counts["awards"] = awards
	return counts
}

func autoHideEmptyMainSections(settings *SettingsDocument, counts map[string]int) {
	visible := make([]string, 0, len(settings.MainPageSections))
	hidden := append([]string(nil), settings.HiddenMainPageSections...)
	hiddenSet := make(map[string]bool, len(hidden))
	for _, section := range hidden {
		hiddenSet[section] = true
	}
	for _, section := range settings.MainPageSections {
		if counts[section] > 0 {
			visible = append(visible, section)
			continue
		}
		if !hiddenSet[section] {
			hidden = append(hidden, section)
			hiddenSet[section] = true
		}
	}
	settings.MainPageSections = visible
	settings.HiddenMainPageSections = hidden
}

func cvSectionCounts(
	profile profileSnapshot,
	projectsRaw, publicationsRaw, softwareRaw, awardsRaw, academicActivitiesRaw []byte,
) (map[string]int, error) {
	counts := make(map[string]int, len(supportedCVSections))
	for _, section := range profileCVSections {
		items, _ := profile.Data[section].([]any)
		for _, value := range items {
			item, ok := value.(map[string]any)
			if !ok {
				continue
			}
			visible, exists := item["visible_in_CV"]
			if !exists || visible == true {
				counts[section]++
			}
		}
	}

	collections := []struct {
		section  string
		filename string
		raw      []byte
	}{
		{section: "projects", filename: "projects.json", raw: projectsRaw},
		{section: "publications", filename: "publications.json", raw: publicationsRaw},
		{section: "software", filename: "software.json", raw: softwareRaw},
		{section: "awards", filename: "awards.json", raw: awardsRaw},
	}
	for _, collection := range collections {
		rows, err := decodePeopleAwardsArray(collection.raw, collection.filename)
		if err != nil {
			return nil, err
		}
		for index, row := range rows {
			visible, err := visibleInCV(row, fmt.Sprintf("%s %d번째 항목", collection.filename, index+1))
			if err != nil {
				return nil, err
			}
			if visible {
				counts[collection.section]++
			}
		}
	}
	academicActivities, err := readAcademicActivitiesBytes(academicActivitiesRaw)
	if err != nil {
		return nil, err
	}
	counts["academic_activities"] = academicActivityCVCount(academicActivities)
	return counts, nil
}

func autoHideEmptyCVSections(settings *SettingsDocument, counts map[string]int, affected map[string]bool) {
	visible := make([]string, 0, len(settings.CVSections))
	hidden := append([]string(nil), settings.HiddenCVSections...)
	hiddenSet := make(map[string]bool, len(hidden))
	for _, section := range hidden {
		hiddenSet[section] = true
	}
	for _, section := range settings.CVSections {
		if !affected[section] || counts[section] > 0 {
			visible = append(visible, section)
			continue
		}
		if !hiddenSet[section] {
			hidden = append(hidden, section)
			hiddenSet[section] = true
		}
	}
	settings.CVSections = visible
	settings.HiddenCVSections = hidden
}
