package main

import (
	"fmt"

	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/dataversion"
	"github.com/Gonie-Gonie/Gonie-Gonie.github.io/editor/internal/initialtheme"
)

// Run after program recovery so an older fork gets its first theme export from
// its own settings. Reopening the editor also picks up manual settings changes.
func prepareInitialTheme(root string) error {
	if !isRepoRoot(root) {
		return fmt.Errorf("cannot generate the initial theme outside a site repository")
	}
	if err := dataversion.ValidateBundle(root); err != nil {
		return err
	}
	return initialtheme.Write(root)
}
