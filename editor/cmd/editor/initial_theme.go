package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

// Keep the first-paint export in the same transaction as edited settings.
func prepareInitialThemeWrite(root string, settings []byte) (editorFileWrite, error) {
	script, err := initialtheme.Script(settings)
	if err != nil {
		return editorFileWrite{}, fmt.Errorf("색상 테마 인코딩 실패: %w", err)
	}
	path := filepath.Join(root, filepath.FromSlash(initialtheme.Path))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return editorFileWrite{}, err
	}
	previous, err := os.ReadFile(path)
	missing := os.IsNotExist(err)
	if err != nil && !missing {
		return editorFileWrite{}, fmt.Errorf("%s 확인 실패: %w", initialtheme.Path, err)
	}
	return editorFileWrite{Name: initialtheme.Path, Path: path, Revision: revisionOf(previous), Previous: previous, Next: script, Enabled: true, Missing: missing}, nil
}

func requireEditorFileWrite(write editorFileWrite) error {
	if !write.Missing {
		return requireUnchangedRevision(write.Path, write.Revision, write.Name)
	}
	if _, err := os.Lstat(write.Path); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf("%s 재확인 실패: %w", write.Name, err)
	}
	return fmt.Errorf("%s이 편집기 밖에서 생성되었습니다. 다시 저장해 주세요", write.Name)
}

func rollbackEditorFile(write editorFileWrite) error {
	if !write.Missing {
		return rollbackFileIfCurrent(write.Path, write.Next, write.Previous)
	}
	if err := requireUnchangedRevision(write.Path, revisionOf(write.Next), write.Name); err != nil {
		return err
	}
	return os.Remove(write.Path)
}
