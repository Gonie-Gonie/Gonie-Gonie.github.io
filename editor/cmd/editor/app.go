package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const settingsSchemaVersion = 4

var supportedMainPageSections = []string{
	"experience",
	"education",
	"scholarships",
	"certifications",
	"awards",
	"teaching",
	"skills",
}

type BilingualLabel struct {
	LabelEN string `json:"label_en"`
	LabelKO string `json:"label_ko"`

	extraFields map[string]json.RawMessage
}

type TaxonomyItem struct {
	ID string `json:"id,omitempty"`
	BilingualLabel

	extraFields map[string]json.RawMessage
}

type SettingsDocument struct {
	SchemaVersion            int            `json:"schema_version"`
	MainPageSections         []string       `json:"main_page_sections"`
	HiddenMainPageSections   []string       `json:"hidden_main_page_sections"`
	ProjectThemes            []TaxonomyItem `json:"project_themes"`
	ProjectThemeFallback     BilingualLabel `json:"project_theme_fallback"`
	PublicationTopics        []TaxonomyItem `json:"publication_topics"`
	PublicationTopicFallback BilingualLabel `json:"publication_topic_fallback"`

	extraFields map[string]json.RawMessage
}

var taxonomyIDPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

var reservedPublicationTopicIDs = map[string]bool{
	"__all_topics__":     true,
	"__fallback_topic__": true,
}

type SettingsUsage struct {
	ProjectThemes     map[string]int `json:"project_themes"`
	PublicationTopics map[string]int `json:"publication_topics"`
}

type SettingsResponse struct {
	Settings SettingsDocument `json:"settings"`
	Revision string           `json:"revision"`
	Usage    SettingsUsage    `json:"usage"`
	Location string           `json:"location"`
}

type SaveSettingsRequest struct {
	Settings SettingsDocument `json:"settings"`
	Revision string           `json:"revision"`
}

type App struct {
	mu         sync.Mutex
	ctx        context.Context
	repoRoot   string
	startupErr error
	dirty      bool
	stagingDir string
	boardMedia map[string]stagedBoardMedia
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	root, err := discoverRepoRoot()
	a.mu.Lock()
	a.ctx = ctx
	a.repoRoot = root
	a.startupErr = err
	a.mu.Unlock()
}

// SetDirty mirrors the frontend draft state so the native window-close hook can
// warn before discarding edits. It never writes a file.
func (a *App) SetDirty(dirty bool) {
	a.mu.Lock()
	a.dirty = dirty
	a.mu.Unlock()
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	dirty := a.dirty || len(a.boardMedia) > 0
	a.mu.Unlock()
	if !dirty {
		return false
	}

	choice, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "저장하지 않은 변경",
		Message:       "저장하지 않은 변경 내용이 있습니다. 저장하지 않고 닫을까요?",
		DefaultButton: "No",
		CancelButton:  "No",
	})
	if err != nil {
		return true
	}
	return choice != "Yes"
}

func (a *App) LoadSettings() (SettingsResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	root, err := a.rootLocked()
	if err != nil {
		return SettingsResponse{}, err
	}
	settingsPath := filepath.Join(root, "data", "settings.json")
	document, raw, err := readSettings(settingsPath)
	if err != nil {
		return SettingsResponse{}, err
	}
	if err := normaliseLoadedSettings(&document); err != nil {
		return SettingsResponse{}, err
	}
	usage, err := loadUsage(root)
	if err != nil {
		return SettingsResponse{}, err
	}
	if err := validateReferences(document, usage); err != nil {
		return SettingsResponse{}, err
	}

	a.dirty = false
	return SettingsResponse{
		Settings: document,
		Revision: revisionOf(raw),
		Usage:    usage,
		Location: filepath.ToSlash(filepath.Join("data", "settings.json")),
	}, nil
}

func (a *App) SaveSettings(request SaveSettingsRequest) (SettingsResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	root, err := a.rootLocked()
	if err != nil {
		return SettingsResponse{}, err
	}
	settingsPath := filepath.Join(root, "data", "settings.json")
	current, raw, err := readSettings(settingsPath)
	if err != nil {
		return SettingsResponse{}, err
	}
	if request.Revision == "" || request.Revision != revisionOf(raw) {
		return SettingsResponse{}, errors.New("settings.json이 편집기 밖에서 변경되었습니다. 다시 불러온 뒤 수정해 주세요")
	}
	if err := normaliseLoadedSettings(&current); err != nil {
		return SettingsResponse{}, err
	}
	usage, err := loadUsage(root)
	if err != nil {
		return SettingsResponse{}, err
	}

	normalised, err := normaliseForSave(request.Settings, current, usage)
	if err != nil {
		return SettingsResponse{}, err
	}
	encoded, err := marshalSettings(normalised)
	if err != nil {
		return SettingsResponse{}, fmt.Errorf("settings.json 인코딩 실패: %w", err)
	}
	if err := writeFileAtomically(settingsPath, encoded); err != nil {
		return SettingsResponse{}, fmt.Errorf("settings.json 저장 실패: %w", err)
	}

	a.dirty = false
	return SettingsResponse{
		Settings: normalised,
		Revision: revisionOf(encoded),
		Usage:    usage,
		Location: filepath.ToSlash(filepath.Join("data", "settings.json")),
	}, nil
}

func (a *App) rootLocked() (string, error) {
	if a.repoRoot != "" {
		return a.repoRoot, nil
	}
	if a.startupErr != nil {
		return "", a.startupErr
	}
	root, err := discoverRepoRoot()
	if err != nil {
		return "", err
	}
	a.repoRoot = root
	return root, nil
}

func discoverRepoRoot() (string, error) {
	var starts []string
	if executable, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(executable))
	}
	if cwd, err := os.Getwd(); err == nil {
		starts = append(starts, cwd)
	}

	seen := make(map[string]bool)
	for _, start := range starts {
		current, err := filepath.Abs(start)
		if err != nil {
			continue
		}
		for {
			key := strings.ToLower(filepath.Clean(current))
			if !seen[key] {
				seen[key] = true
				if isRepoRoot(current) {
					return current, nil
				}
			}
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			current = parent
		}
	}
	return "", errors.New("저장소 루트를 찾지 못했습니다. Profile-Editor.exe를 저장소 최상위에서 실행해 주세요")
}

func isRepoRoot(root string) bool {
	markers := []string{
		filepath.Join("data", "settings.json"),
		filepath.Join("data", "projects.json"),
		filepath.Join("data", "publications.json"),
		"index.html",
	}
	for _, marker := range markers {
		info, err := os.Stat(filepath.Join(root, marker))
		if err != nil || info.IsDir() {
			return false
		}
	}
	return true
}

func readSettings(path string) (SettingsDocument, []byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return SettingsDocument{}, nil, fmt.Errorf("settings.json 읽기 실패: %w", err)
	}
	var document SettingsDocument
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if err := decoder.Decode(&document); err != nil {
		return SettingsDocument{}, nil, fmt.Errorf("settings.json 파싱 실패: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return SettingsDocument{}, nil, errors.New("settings.json에는 하나의 JSON 값만 있어야 합니다")
	}
	if err := captureSettingsExtraFields(&document, raw); err != nil {
		return SettingsDocument{}, nil, fmt.Errorf("settings.json 추가 필드 분석 실패: %w", err)
	}
	return document, raw, nil
}

func captureSettingsExtraFields(document *SettingsDocument, raw []byte) error {
	root, err := decodeObject(raw)
	if err != nil {
		return err
	}
	document.extraFields = withoutKnownFields(root,
		"schema_version",
		"main_page_sections",
		"hidden_main_page_sections",
		"project_themes",
		"project_theme_fallback",
		"publication_topics",
		"publication_topic_fallback",
	)

	if value, ok := root["project_themes"]; ok {
		if err := captureTaxonomyExtraFields(document.ProjectThemes, value); err != nil {
			return fmt.Errorf("project_themes: %w", err)
		}
	}
	if value, ok := root["publication_topics"]; ok {
		if err := captureTaxonomyExtraFields(document.PublicationTopics, value); err != nil {
			return fmt.Errorf("publication_topics: %w", err)
		}
	}
	if value, ok := root["project_theme_fallback"]; ok {
		fields, err := decodeObject(value)
		if err != nil {
			return fmt.Errorf("project_theme_fallback: %w", err)
		}
		document.ProjectThemeFallback.extraFields = withoutKnownFields(fields, "label_en", "label_ko")
	}
	if value, ok := root["publication_topic_fallback"]; ok {
		fields, err := decodeObject(value)
		if err != nil {
			return fmt.Errorf("publication_topic_fallback: %w", err)
		}
		document.PublicationTopicFallback.extraFields = withoutKnownFields(fields, "label_en", "label_ko")
	}
	return nil
}

func captureTaxonomyExtraFields(items []TaxonomyItem, raw json.RawMessage) error {
	var rows []json.RawMessage
	if err := json.Unmarshal(raw, &rows); err != nil {
		return err
	}
	if len(rows) != len(items) {
		return errors.New("항목 수를 확인할 수 없습니다")
	}
	for index, row := range rows {
		fields, err := decodeObject(row)
		if err != nil {
			return fmt.Errorf("%d번째 항목: %w", index+1, err)
		}
		items[index].extraFields = withoutKnownFields(fields, "id", "label_en", "label_ko")
	}
	return nil
}

func decodeObject(raw []byte) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	if fields == nil {
		return nil, errors.New("JSON 객체여야 합니다")
	}
	return fields, nil
}

func withoutKnownFields(fields map[string]json.RawMessage, known ...string) map[string]json.RawMessage {
	knownSet := make(map[string]bool, len(known))
	for _, name := range known {
		knownSet[name] = true
	}
	extras := make(map[string]json.RawMessage)
	for name, value := range fields {
		if !knownSet[name] {
			extras[name] = cloneRawMessage(value)
		}
	}
	return extras
}

func cloneRawMessage(value json.RawMessage) json.RawMessage {
	return append(json.RawMessage(nil), value...)
}

func cloneExtraFields(fields map[string]json.RawMessage) map[string]json.RawMessage {
	if len(fields) == 0 {
		return nil
	}
	cloned := make(map[string]json.RawMessage, len(fields))
	for name, value := range fields {
		cloned[name] = cloneRawMessage(value)
	}
	return cloned
}

func normaliseLoadedSettings(document *SettingsDocument) error {
	if document.SchemaVersion != 3 && document.SchemaVersion != settingsSchemaVersion {
		return fmt.Errorf("지원하지 않는 settings.json schema_version입니다: %d", document.SchemaVersion)
	}
	if document.HiddenMainPageSections == nil {
		visible := make(map[string]bool, len(document.MainPageSections))
		for _, section := range document.MainPageSections {
			visible[section] = true
		}
		document.HiddenMainPageSections = make([]string, 0)
		for _, section := range supportedMainPageSections {
			if !visible[section] {
				document.HiddenMainPageSections = append(document.HiddenMainPageSections, section)
			}
		}
	}
	if document.MainPageSections == nil {
		document.MainPageSections = []string{}
	}
	if document.ProjectThemes == nil {
		return errors.New("project_themes는 JSON 배열이어야 합니다")
	}
	if document.PublicationTopics == nil {
		return errors.New("publication_topics는 JSON 배열이어야 합니다")
	}
	document.SchemaVersion = settingsSchemaVersion
	if err := validateSectionPartition(document.MainPageSections, document.HiddenMainPageSections); err != nil {
		return err
	}
	if err := validateLoadedTaxonomy(document.ProjectThemes, "프로젝트 테마", nil); err != nil {
		return err
	}
	if err := validateLoadedTaxonomy(document.PublicationTopics, "논문 주제", reservedPublicationTopicIDs); err != nil {
		return err
	}
	if err := validateLoadedLabel(document.ProjectThemeFallback, "프로젝트 기타 분류"); err != nil {
		return err
	}
	if err := validateLoadedLabel(document.PublicationTopicFallback, "논문 기타 분류"); err != nil {
		return err
	}
	return nil
}

func validateLoadedTaxonomy(items []TaxonomyItem, label string, reservedIDs map[string]bool) error {
	seenIDs := make(map[string]bool, len(items))
	seenEN := make(map[string]bool, len(items))
	seenKO := make(map[string]bool, len(items))
	for index, item := range items {
		context := fmt.Sprintf("%s %d", label, index+1)
		if item.ID == "" {
			return fmt.Errorf("%s의 ID가 비어 있습니다", context)
		}
		if reservedIDs[item.ID] {
			return fmt.Errorf("%s의 ID '%s'는 화면 필터용 예약 ID라 사용할 수 없습니다", context, item.ID)
		}
		if !taxonomyIDPattern.MatchString(item.ID) {
			return fmt.Errorf("%s의 ID '%s'는 소문자 영문, 숫자, 단일 하이픈만 사용할 수 있습니다", context, item.ID)
		}
		if seenIDs[item.ID] {
			return fmt.Errorf("%s ID가 중복되었습니다: %s", label, item.ID)
		}
		if err := validateLoadedLabel(item.BilingualLabel, context); err != nil {
			return err
		}
		enKey := strings.ToLower(item.LabelEN)
		koKey := strings.ToLower(item.LabelKO)
		if seenEN[enKey] {
			return fmt.Errorf("%s 영문 이름이 중복되었습니다: %s", label, item.LabelEN)
		}
		if seenKO[koKey] {
			return fmt.Errorf("%s 국문 이름이 중복되었습니다: %s", label, item.LabelKO)
		}
		seenIDs[item.ID] = true
		seenEN[enKey] = true
		seenKO[koKey] = true
	}
	return nil
}

func validateLoadedLabel(input BilingualLabel, context string) error {
	validated, err := normaliseLabel(input, context)
	if err != nil {
		return err
	}
	if validated.LabelEN != input.LabelEN || validated.LabelKO != input.LabelKO {
		return fmt.Errorf("%s 이름의 앞뒤 공백을 제거해 주세요", context)
	}
	return nil
}

func normaliseForSave(input, current SettingsDocument, usage SettingsUsage) (SettingsDocument, error) {
	if err := validateSectionPartition(input.MainPageSections, input.HiddenMainPageSections); err != nil {
		return SettingsDocument{}, err
	}
	projectThemes, err := normaliseTaxonomyWithReserved(input.ProjectThemes, current.ProjectThemes, usage.ProjectThemes, "프로젝트 테마", nil)
	if err != nil {
		return SettingsDocument{}, err
	}
	publicationTopics, err := normaliseTaxonomyWithReserved(input.PublicationTopics, current.PublicationTopics, usage.PublicationTopics, "논문 주제", reservedPublicationTopicIDs)
	if err != nil {
		return SettingsDocument{}, err
	}
	projectFallbackInput := input.ProjectThemeFallback
	projectFallbackInput.extraFields = cloneExtraFields(current.ProjectThemeFallback.extraFields)
	projectFallback, err := normaliseLabel(projectFallbackInput, "프로젝트 기타 분류")
	if err != nil {
		return SettingsDocument{}, err
	}
	publicationFallbackInput := input.PublicationTopicFallback
	publicationFallbackInput.extraFields = cloneExtraFields(current.PublicationTopicFallback.extraFields)
	publicationFallback, err := normaliseLabel(publicationFallbackInput, "논문 기타 분류")
	if err != nil {
		return SettingsDocument{}, err
	}

	document := SettingsDocument{
		SchemaVersion:            settingsSchemaVersion,
		MainPageSections:         append([]string{}, input.MainPageSections...),
		HiddenMainPageSections:   append([]string{}, input.HiddenMainPageSections...),
		ProjectThemes:            projectThemes,
		ProjectThemeFallback:     projectFallback,
		PublicationTopics:        publicationTopics,
		PublicationTopicFallback: publicationFallback,
		extraFields:              cloneExtraFields(current.extraFields),
	}
	if err := validateReferences(document, usage); err != nil {
		return SettingsDocument{}, err
	}
	return document, nil
}

func validateSectionPartition(visible, hidden []string) error {
	configured := append(append([]string{}, visible...), hidden...)
	if len(configured) != len(supportedMainPageSections) {
		return errors.New("프로필 노출/숨김 목록에는 지원 섹션이 각각 한 번씩 있어야 합니다")
	}
	allowed := make(map[string]bool, len(supportedMainPageSections))
	for _, section := range supportedMainPageSections {
		allowed[section] = true
	}
	seen := make(map[string]bool, len(configured))
	for _, section := range configured {
		if !allowed[section] || seen[section] {
			return fmt.Errorf("잘못되거나 중복된 프로필 섹션입니다: %s", section)
		}
		seen[section] = true
	}
	return nil
}

func normaliseTaxonomy(input, current []TaxonomyItem, usage map[string]int, label string) ([]TaxonomyItem, error) {
	return normaliseTaxonomyWithReserved(input, current, usage, label, nil)
}

func normaliseTaxonomyWithReserved(input, current []TaxonomyItem, usage map[string]int, label string, reservedIDs map[string]bool) ([]TaxonomyItem, error) {
	currentByID := make(map[string]TaxonomyItem, len(current))
	usedIDs := make(map[string]bool, len(current)+len(usage))
	for _, item := range current {
		currentByID[item.ID] = item
		usedIDs[item.ID] = true
	}
	for id := range usage {
		if id != "" {
			usedIDs[id] = true
		}
	}

	result := make([]TaxonomyItem, 0, len(input))
	seenIDs := make(map[string]bool, len(input))
	seenEN := make(map[string]bool, len(input))
	seenKO := make(map[string]bool, len(input))
	for index, item := range input {
		labels, err := normaliseLabel(item.BilingualLabel, fmt.Sprintf("%s %d", label, index+1))
		if err != nil {
			return nil, err
		}
		id := strings.TrimSpace(item.ID)
		if id == "" {
			id, err = newTaxonomyID(labels.LabelEN, usedIDs)
			if err != nil {
				return nil, err
			}
		} else if _, exists := currentByID[id]; !exists {
			return nil, fmt.Errorf("%s ID는 직접 만들거나 변경할 수 없습니다", label)
		}
		if reservedIDs[id] {
			return nil, fmt.Errorf("%s ID '%s'는 화면 필터용 예약 ID라 사용할 수 없습니다", label, id)
		}
		if !taxonomyIDPattern.MatchString(id) {
			return nil, fmt.Errorf("%s ID '%s'는 소문자 영문, 숫자, 단일 하이픈만 사용할 수 있습니다", label, id)
		}
		if seenIDs[id] {
			return nil, fmt.Errorf("%s ID가 중복되었습니다: %s", label, id)
		}
		enKey := strings.ToLower(labels.LabelEN)
		koKey := strings.ToLower(labels.LabelKO)
		if seenEN[enKey] {
			return nil, fmt.Errorf("%s 영문 이름이 중복되었습니다: %s", label, labels.LabelEN)
		}
		if seenKO[koKey] {
			return nil, fmt.Errorf("%s 국문 이름이 중복되었습니다: %s", label, labels.LabelKO)
		}
		seenIDs[id] = true
		seenEN[enKey] = true
		seenKO[koKey] = true
		usedIDs[id] = true
		extras := map[string]json.RawMessage(nil)
		if existing, exists := currentByID[id]; exists {
			extras = cloneExtraFields(existing.extraFields)
		}
		result = append(result, TaxonomyItem{ID: id, BilingualLabel: labels, extraFields: extras})
	}

	for _, item := range current {
		if !seenIDs[item.ID] && usage[item.ID] > 0 {
			return nil, fmt.Errorf("%s '%s'은(는) %d개 데이터에서 사용 중이라 삭제할 수 없습니다", label, item.LabelKO, usage[item.ID])
		}
	}
	return result, nil
}

func normaliseLabel(input BilingualLabel, context string) (BilingualLabel, error) {
	label := BilingualLabel{
		LabelEN:     strings.TrimSpace(input.LabelEN),
		LabelKO:     strings.TrimSpace(input.LabelKO),
		extraFields: cloneExtraFields(input.extraFields),
	}
	if label.LabelEN == "" || label.LabelKO == "" {
		return BilingualLabel{}, fmt.Errorf("%s의 영문/국문 이름을 모두 입력해 주세요", context)
	}
	for _, value := range []string{label.LabelEN, label.LabelKO} {
		if utf8.RuneCountInString(value) > 100 {
			return BilingualLabel{}, fmt.Errorf("%s 이름은 100자 이하여야 합니다", context)
		}
		if strings.IndexFunc(value, unicode.IsControl) >= 0 {
			return BilingualLabel{}, fmt.Errorf("%s 이름에는 제어 문자를 사용할 수 없습니다", context)
		}
	}
	return label, nil
}

func newTaxonomyID(labelEN string, used map[string]bool) (string, error) {
	var builder strings.Builder
	lastHyphen := false
	for _, char := range strings.ToLower(labelEN) {
		switch {
		case char >= 'a' && char <= 'z', char >= '0' && char <= '9':
			builder.WriteRune(char)
			lastHyphen = false
		case builder.Len() > 0 && !lastHyphen:
			builder.WriteByte('-')
			lastHyphen = true
		}
	}
	base := strings.Trim(builder.String(), "-")
	if base == "" {
		var random [8]byte
		if _, err := rand.Read(random[:]); err != nil {
			return "", fmt.Errorf("새 분류 ID 생성 실패: %w", err)
		}
		base = "item-" + hex.EncodeToString(random[:])
	}
	candidate := base
	for suffix := 2; used[candidate]; suffix++ {
		candidate = fmt.Sprintf("%s-%d", base, suffix)
	}
	return candidate, nil
}

func loadUsage(root string) (SettingsUsage, error) {
	usage := SettingsUsage{
		ProjectThemes:     make(map[string]int),
		PublicationTopics: make(map[string]int),
	}
	var projects []struct {
		Theme string `json:"theme"`
	}
	if err := readJSONArray(filepath.Join(root, "data", "projects.json"), &projects); err != nil {
		return SettingsUsage{}, err
	}
	for _, project := range projects {
		if project.Theme != "" {
			usage.ProjectThemes[project.Theme]++
		}
	}

	var publications []struct {
		Topic string `json:"topic"`
	}
	if err := readJSONArray(filepath.Join(root, "data", "publications.json"), &publications); err != nil {
		return SettingsUsage{}, err
	}
	for _, publication := range publications {
		if publication.Topic != "" {
			usage.PublicationTopics[publication.Topic]++
		}
	}
	return usage, nil
}

func readJSONArray(path string, destination any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("%s 읽기 실패: %w", filepath.Base(path), err)
	}
	if err := json.Unmarshal(raw, destination); err != nil {
		return fmt.Errorf("%s 파싱 실패: %w", filepath.Base(path), err)
	}
	return nil
}

func validateReferences(document SettingsDocument, usage SettingsUsage) error {
	projectIDs := make(map[string]bool, len(document.ProjectThemes))
	for _, item := range document.ProjectThemes {
		projectIDs[item.ID] = true
	}
	for id, count := range usage.ProjectThemes {
		if id != "" && count > 0 && !projectIDs[id] {
			return fmt.Errorf("projects.json의 %d개 항목이 존재하지 않는 프로젝트 테마 '%s'을(를) 참조합니다", count, id)
		}
	}
	publicationIDs := make(map[string]bool, len(document.PublicationTopics))
	for _, item := range document.PublicationTopics {
		publicationIDs[item.ID] = true
	}
	for id, count := range usage.PublicationTopics {
		if id != "" && count > 0 && !publicationIDs[id] {
			return fmt.Errorf("publications.json의 %d개 항목이 존재하지 않는 논문 주제 '%s'을(를) 참조합니다", count, id)
		}
	}
	return nil
}

func marshalSettings(document SettingsDocument) ([]byte, error) {
	projectThemes, err := marshalTaxonomy(document.ProjectThemes)
	if err != nil {
		return nil, fmt.Errorf("project_themes: %w", err)
	}
	publicationTopics, err := marshalTaxonomy(document.PublicationTopics)
	if err != nil {
		return nil, fmt.Errorf("publication_topics: %w", err)
	}
	projectFallback, err := mergeObjectFields(document.ProjectThemeFallback.extraFields, map[string]any{
		"label_en": document.ProjectThemeFallback.LabelEN,
		"label_ko": document.ProjectThemeFallback.LabelKO,
	})
	if err != nil {
		return nil, fmt.Errorf("project_theme_fallback: %w", err)
	}
	publicationFallback, err := mergeObjectFields(document.PublicationTopicFallback.extraFields, map[string]any{
		"label_en": document.PublicationTopicFallback.LabelEN,
		"label_ko": document.PublicationTopicFallback.LabelKO,
	})
	if err != nil {
		return nil, fmt.Errorf("publication_topic_fallback: %w", err)
	}
	root, err := mergeObjectFields(document.extraFields, map[string]any{
		"schema_version":             document.SchemaVersion,
		"main_page_sections":         document.MainPageSections,
		"hidden_main_page_sections":  document.HiddenMainPageSections,
		"project_themes":             projectThemes,
		"project_theme_fallback":     projectFallback,
		"publication_topics":         publicationTopics,
		"publication_topic_fallback": publicationFallback,
	})
	if err != nil {
		return nil, err
	}
	raw, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(raw, '\n'), nil
}

func marshalTaxonomy(items []TaxonomyItem) ([]json.RawMessage, error) {
	rows := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		row, err := mergeObjectFields(item.extraFields, map[string]any{
			"id":       item.ID,
			"label_en": item.LabelEN,
			"label_ko": item.LabelKO,
		})
		if err != nil {
			return nil, err
		}
		encoded, err := json.Marshal(row)
		if err != nil {
			return nil, err
		}
		rows = append(rows, encoded)
	}
	return rows, nil
}

func mergeObjectFields(extras map[string]json.RawMessage, known map[string]any) (map[string]json.RawMessage, error) {
	fields := cloneExtraFields(extras)
	if fields == nil {
		fields = make(map[string]json.RawMessage, len(known))
	}
	for name, value := range known {
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		fields[name] = encoded
	}
	return fields, nil
}

func revisionOf(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func writeFileAtomically(path string, contents []byte) (err error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, "."+filepath.Base(path)+"-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer func() {
		_ = temporary.Close()
		if err != nil {
			_ = os.Remove(temporaryPath)
		}
	}()
	if info, statErr := os.Stat(path); statErr == nil {
		if chmodErr := temporary.Chmod(info.Mode().Perm()); chmodErr != nil {
			return chmodErr
		}
	}
	if _, err = temporary.Write(contents); err != nil {
		return err
	}
	if err = temporary.Sync(); err != nil {
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	if err = replaceFile(temporaryPath, path); err != nil {
		return err
	}
	return nil
}
