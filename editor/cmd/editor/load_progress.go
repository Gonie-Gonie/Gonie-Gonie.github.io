package main

import "github.com/wailsapp/wails/v2/pkg/runtime"

const editorLoadProgressEvent = "editor:load-progress"

type LoadEditorDataRequest struct {
	OperationID string `json:"operation_id"`
}

type EditorLoadProgress struct {
	OperationID string `json:"operation_id"`
	Step        int    `json:"step"`
	Total       int    `json:"total"`
	Label       string `json:"label"`
}

// The frontend owns step 12, after the response reaches the editing screen.
// Loading holds a.mu; event delivery does not acquire it or expose draft data.
func (a *App) reportLoadProgress(id string, step int, label string) {
	if id == "" {
		return
	}
	event := EditorLoadProgress{OperationID: id, Step: step, Total: 12, Label: label}
	if a.loadProgressSink != nil {
		a.loadProgressSink(event)
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, editorLoadProgressEvent, event)
	}
}
