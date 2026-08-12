package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
)

type AttachmentCleanupResult struct {
	MediaRemoved     int    `json:"media_removed"`
	DocumentsRemoved int    `json:"documents_removed"`
	Warning          string `json:"warning,omitempty"`
}

type attachmentDirectory struct {
	name string
	root *os.Root
	info os.FileInfo
}

type attachmentCandidate struct {
	directory int
	name      string
	info      os.FileInfo
}

type attachmentCleanupPlan struct {
	repo        *os.Root
	directories []attachmentDirectory
	sources     map[string][]byte
	candidates  []attachmentCandidate
}

// Cleanup runs after a successful save. A plan is checked in full before the
// first deletion, so an unreadable source or changed snapshot keeps all files.
func cleanupUnusedAttachments(root string, expected map[string][]byte) (AttachmentCleanupResult, error) {
	plan, err := planAttachmentCleanup(root, expected)
	if err != nil {
		return AttachmentCleanupResult{}, err
	}
	defer plan.close()
	return plan.remove()
}

func planAttachmentCleanup(root string, expected map[string][]byte) (_ *attachmentCleanupPlan, err error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	absolute, err = filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, err
	}
	repo, err := os.OpenRoot(absolute)
	if err != nil {
		return nil, err
	}
	plan := &attachmentCleanupPlan{repo: repo}
	defer func() {
		if err != nil {
			plan.close()
		}
	}()
	if err := requireAttachmentDirectory(repo, "data"); err != nil {
		return nil, err
	}
	for _, name := range []string{"media", "document"} {
		relative := "data/" + name
		info, statErr := repo.Lstat(relative)
		if os.IsNotExist(statErr) {
			continue
		}
		if statErr != nil {
			return nil, statErr
		}
		if !info.IsDir() || attachmentLink(info) {
			return nil, fmt.Errorf("%s 폴더가 일반 디렉터리가 아닙니다", relative)
		}
		directory, openErr := repo.OpenRoot(relative)
		if openErr != nil {
			return nil, openErr
		}
		plan.directories = append(plan.directories, attachmentDirectory{name: name, root: directory, info: info})
	}
	plan.sources, err = attachmentSources(repo)
	if err != nil {
		return nil, err
	}
	for name, contents := range expected {
		if path.Base(name) != name || name == "." || strings.Contains(name, "\\") {
			return nil, fmt.Errorf("첨부파일 검사 데이터 경로가 올바르지 않습니다: %s", name)
		}
		stored, exists := plan.sources["data/"+name]
		if !exists || !bytes.Equal(stored, contents) {
			return nil, fmt.Errorf("%s이 저장 후 변경되어 첨부파일 정리를 중단했습니다", name)
		}
	}
	var dataStrings, sourceStrings []string
	for name, contents := range plan.sources {
		if strings.HasPrefix(name, "data/") {
			if !json.Valid(contents) {
				return nil, fmt.Errorf("%s의 JSON을 읽을 수 없어 첨부파일을 보존했습니다", name)
			}
			decoder := json.NewDecoder(bytes.NewReader(contents))
			for {
				token, tokenErr := decoder.Token()
				if errors.Is(tokenErr, io.EOF) {
					break
				}
				if tokenErr != nil {
					return nil, tokenErr
				}
				if text, ok := token.(string); ok {
					dataStrings = append(dataStrings, attachmentStringVariants(text)...)
				}
			}
		} else {
			sourceStrings = append(sourceStrings, attachmentStringVariants(string(contents))...)
		}
	}
	for index, directory := range plan.directories {
		walkErr := fs.WalkDir(directory.root.FS(), ".", func(name string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			info, infoErr := entry.Info()
			if infoErr != nil {
				return infoErr
			}
			if attachmentLink(info) {
				return fmt.Errorf("data/%s/%s에 링크가 있어 첨부파일 정리를 중단했습니다", directory.name, name)
			}
			if name != "." && strings.HasPrefix(entry.Name(), ".") {
				if entry.IsDir() {
					return fs.SkipDir
				}
				return nil
			}
			if info.Mode().IsRegular() && !attachmentReferenced(directory.name, name, dataStrings, sourceStrings) {
				plan.candidates = append(plan.candidates, attachmentCandidate{directory: index, name: name, info: info})
			}
			return nil
		})
		if walkErr != nil {
			return nil, walkErr
		}
	}
	return plan, nil
}

func (plan *attachmentCleanupPlan) close() {
	for _, directory := range plan.directories {
		_ = directory.root.Close()
	}
	_ = plan.repo.Close()
}

func (plan *attachmentCleanupPlan) remove() (AttachmentCleanupResult, error) {
	result := AttachmentCleanupResult{}
	latest, err := attachmentSources(plan.repo)
	if err != nil {
		return result, err
	}
	if len(latest) != len(plan.sources) {
		return result, errors.New("참조 원본 목록이 변경되어 첨부파일 정리를 중단했습니다")
	}
	for name, contents := range plan.sources {
		if !bytes.Equal(latest[name], contents) {
			return result, fmt.Errorf("%s이 변경되어 첨부파일 정리를 중단했습니다", name)
		}
	}
	// Verify every candidate before removing any; repeat each check immediately
	// before removal. Root.Remove also confines directory traversal at the OS level.
	for _, candidate := range plan.candidates {
		if err := plan.checkCandidate(candidate); err != nil {
			return result, err
		}
	}
	for _, candidate := range plan.candidates {
		if err := plan.checkCandidate(candidate); err != nil {
			return result, err
		}
		directory := plan.directories[candidate.directory]
		if err := directory.root.Remove(candidate.name); err != nil {
			return result, fmt.Errorf("data/%s/%s 정리 실패: %w", directory.name, candidate.name, err)
		}
		if directory.name == "media" {
			result.MediaRemoved++
		} else {
			result.DocumentsRemoved++
		}
	}
	return result, nil
}

func (plan *attachmentCleanupPlan) checkCandidate(candidate attachmentCandidate) error {
	directory := plan.directories[candidate.directory]
	if err := requireAttachmentDirectory(plan.repo, "data"); err != nil {
		return err
	}
	currentDirectory, err := plan.repo.Lstat("data/" + directory.name)
	if err != nil || attachmentLink(currentDirectory) || !os.SameFile(directory.info, currentDirectory) {
		return fmt.Errorf("data/%s 폴더가 변경되어 정리를 중단했습니다", directory.name)
	}
	parent := path.Dir(candidate.name)
	for parent != "." {
		if err := requireAttachmentDirectory(directory.root, parent); err != nil {
			return err
		}
		parent = path.Dir(parent)
	}
	current, err := directory.root.Lstat(candidate.name)
	if err != nil || attachmentLink(current) || !current.Mode().IsRegular() || !os.SameFile(candidate.info, current) ||
		current.Size() != candidate.info.Size() || !current.ModTime().Equal(candidate.info.ModTime()) {
		return fmt.Errorf("data/%s/%s이 변경되어 정리를 중단했습니다", directory.name, candidate.name)
	}
	return nil
}

func requireAttachmentDirectory(root *os.Root, name string) error {
	info, err := root.Lstat(name)
	if err != nil {
		return err
	}
	if !info.IsDir() || attachmentLink(info) {
		return fmt.Errorf("첨부파일 검사 경로가 일반 디렉터리가 아닙니다: %s", name)
	}
	return nil
}

func attachmentLink(info os.FileInfo) bool {
	if info == nil {
		return true
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return true
	}
	// Windows junctions and other reparse points need the same treatment as links.
	// Reflecting the platform-specific stat data keeps this file portable.
	value := reflect.ValueOf(info.Sys())
	if value.IsValid() && value.Kind() == reflect.Pointer && !value.IsNil() {
		value = value.Elem()
	}
	if value.IsValid() && value.Kind() == reflect.Struct {
		attributes := value.FieldByName("FileAttributes")
		if attributes.IsValid() && attributes.CanUint() {
			return attributes.Uint()&0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
		}
	}
	return false
}

func attachmentSources(repo *os.Root) (map[string][]byte, error) {
	sources := map[string][]byte{}
	read := func(name string, entry fs.DirEntry) error {
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if attachmentLink(info) || !info.Mode().IsRegular() {
			return fmt.Errorf("첨부파일 참조 원본이 일반 파일이 아닙니다: %s", name)
		}
		contents, err := repo.ReadFile(name)
		if err != nil {
			return err
		}
		sources[name] = contents
		return nil
	}
	walk := func(start string, data bool) error {
		return fs.WalkDir(repo.FS(), start, func(name string, entry fs.DirEntry, walkErr error) error {
			if errors.Is(walkErr, fs.ErrNotExist) && name == start && !data {
				return nil
			}
			if walkErr != nil {
				return walkErr
			}
			if name == "data/media" || name == "data/document" {
				return fs.SkipDir
			}
			if entry.IsDir() {
				if !data && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules" || entry.Name() == "runtime") {
					return fs.SkipDir
				}
				return requireAttachmentDirectory(repo, name)
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("첨부파일 참조 경로에 링크가 있습니다: %s", name)
			}
			if (data && strings.EqualFold(path.Ext(name), ".json")) || (!data && attachmentSourceExtension(name)) {
				return read(name, entry)
			}
			return nil
		})
	}
	if err := walk("data", true); err != nil {
		return nil, err
	}
	entries, err := fs.ReadDir(repo.FS(), ".")
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() && attachmentSourceExtension(entry.Name()) {
			if err := read(entry.Name(), entry); err != nil {
				return nil, err
			}
		}
	}
	if err := walk("app", false); err != nil {
		return nil, err
	}
	return sources, nil
}

func attachmentSourceExtension(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".md", ".markdown", ".svg":
		return true
	}
	return false
}

func attachmentStringVariants(text string) []string {
	variants := []string{}
	for pass := 0; pass < 3; pass++ {
		text = strings.ReplaceAll(text, `\/`, "/")
		variants = append(variants, strings.ToLower(strings.ReplaceAll(text, "\\", "/")))
		// CSS percentages and prose may contain a literal %. Preserve those
		// while still decoding URL-escaped filenames elsewhere in the same text.
		var escaped strings.Builder
		for index := 0; index < len(text); index++ {
			if text[index] == '%' && (index+2 >= len(text) || !attachmentHex(text[index+1]) || !attachmentHex(text[index+2])) {
				escaped.WriteString("%25")
			} else {
				escaped.WriteByte(text[index])
			}
		}
		decoded, err := url.PathUnescape(escaped.String())
		if err != nil || decoded == text {
			break
		}
		text = decoded
	}
	return variants
}

func attachmentHex(value byte) bool {
	return value >= '0' && value <= '9' || value >= 'a' && value <= 'f' || value >= 'A' && value <= 'F'
}

func attachmentReferenced(directory, name string, dataStrings, sourceStrings []string) bool {
	name = strings.ToLower(name)
	full := "data/" + directory + "/" + name
	short := directory + "/" + name
	for _, text := range dataStrings {
		bare := strings.TrimPrefix(strings.TrimSpace(text), "./")
		// Bare JSON fields contain filenames, so # and ? may be literal name
		// characters rather than URL suffixes. Check that spelling first.
		if bare == name || bare == full || bare == short {
			return true
		}
		if index := strings.IndexAny(bare, "?#"); index >= 0 {
			bare = bare[:index]
		}
		if bare == name || bare == full || bare == short || strings.Contains(text, full) || strings.Contains(text, short) {
			return true
		}
	}
	for _, text := range sourceStrings {
		if strings.Contains(text, full) {
			return true
		}
	}
	return false
}
