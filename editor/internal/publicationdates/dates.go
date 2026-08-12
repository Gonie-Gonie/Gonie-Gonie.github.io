// Package publicationdates normalizes dates shared by publication catalogs.
package publicationdates

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var proceedingsDatePattern = regexp.MustCompile(`^[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?$`)

// NormalizeProceedingsDate expands legacy year/month values to full dates.
// Missing month/day components use 01; an unknown date stays blank.
func NormalizeProceedingsDate(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	invalid := func() (string, error) {
		return "", fmt.Errorf("Proceedings 발행일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다")
	}
	if !proceedingsDatePattern.MatchString(value) {
		return invalid()
	}
	if len(value) == 4 {
		value += "-01-01"
	} else if len(value) == 7 {
		value += "-01"
	}
	date, err := time.Parse("2006-01-02", value)
	if err != nil || date.Year() < 1 || date.Format("2006-01-02") != value {
		return invalid()
	}
	return value, nil
}
