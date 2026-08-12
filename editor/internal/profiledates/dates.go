// Package profiledates handles the canonical dates of experience and education.
package profiledates

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var legacyRange = regexp.MustCompile(`^\s*(\d{4}(?:[.-]\d{1,2}){0,2}\.?)\s*(?:[–—~～-]\s*(.*?))?\s*$`)
var legacyEndpoint = regexp.MustCompile(`^\d{4}(?:[.-]\d{1,2}){0,2}\.?$`)

var legacyFields = []string{"period", "period_en", "period_ko", "period_kr"}

// Normalize converts legacy text only when neither canonical date is present.
// Callers work on decoded objects, so loading never rewrites the source file.
func Normalize(item map[string]any) error {
	_, hasStart := item["start_date"]
	_, hasEnd := item["end_date"]
	if !hasStart && !hasEnd {
		for _, field := range legacyFields {
			value, exists := item[field]
			if !exists {
				continue
			}
			period, ok := value.(string)
			if !ok {
				return fmt.Errorf("%s must be a string", field)
			}
			if strings.TrimSpace(period) == "" {
				continue
			}
			parts := legacyRange.FindStringSubmatch(period)
			if parts == nil {
				return fmt.Errorf("%s cannot be converted to start_date and end_date", field)
			}
			start, err := legacyDate(parts[1])
			if err != nil {
				return fmt.Errorf("%s: %w", field, err)
			}
			end := ""
			if value := strings.TrimSpace(parts[2]); value != "" && !strings.EqualFold(value, "present") && value != "현재" {
				end, err = legacyDate(value)
				if err != nil {
					return fmt.Errorf("%s: %w", field, err)
				}
			}
			item["start_date"], item["end_date"] = start, end
			break
		}
	}
	for _, field := range legacyFields {
		delete(item, field)
	}
	return nil
}

func legacyDate(value string) (string, error) {
	if !legacyEndpoint.MatchString(strings.TrimSpace(value)) {
		return "", fmt.Errorf("invalid legacy date %q", value)
	}
	parts := strings.FieldsFunc(strings.TrimSuffix(strings.TrimSpace(value), "."), func(r rune) bool { return r == '.' || r == '-' })
	if len(parts) < 1 || len(parts) > 3 || len(parts[0]) != 4 {
		return "", fmt.Errorf("invalid legacy date %q", value)
	}
	numbers := []int{0, 1, 1}
	for i, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil {
			return "", fmt.Errorf("invalid legacy date %q", value)
		}
		numbers[i] = number
	}
	date := fmt.Sprintf("%04d-%02d-%02d", numbers[0], numbers[1], numbers[2])
	if !validDate(date) {
		return "", fmt.Errorf("invalid legacy date %q", value)
	}
	return date, nil
}

// Validate requires an actual start date and an optional, ordered end date.
func Validate(item map[string]any) error {
	start, ok := item["start_date"].(string)
	if !ok || !validDate(start) {
		return fmt.Errorf("start_date must be a valid YYYY-MM-DD date")
	}
	end, ok := item["end_date"].(string)
	if !ok || end != "" && !validDate(end) {
		return fmt.Errorf("end_date must be blank or a valid YYYY-MM-DD date")
	}
	if end != "" && end < start {
		return fmt.Errorf("end_date cannot precede start_date")
	}
	return nil
}

func validDate(value string) bool {
	date, err := time.Parse("2006-01-02", value)
	return err == nil && date.Year() >= 1 && date.Format("2006-01-02") == value
}
