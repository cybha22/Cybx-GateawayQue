package contentfilter

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestPathContextRequiresDelimiter(t *testing.T) {
	text := "x-anthropic-billing-header"
	start := strings.Index(text, "anthropic")
	end := start + len("anthropic")

	if isInPathContext(text, start, end) {
		t.Fatalf("header token should not be treated as path context")
	}

	text = "</thinking_mode>\n\nx-anthropic-billing-header"
	start = strings.Index(text, "anthropic")
	end = start + len("anthropic")

	if isInPathContext(text, start, end) {
		t.Fatalf("nearby markup delimiter should not make a header token path context")
	}

	path := `C:\Users\muhsh\.claude\projects\memory`
	start = strings.Index(path, "claude")
	end = start + len("claude")

	if !isInPathContext(path, start, end) {
		t.Fatalf("filesystem token should be treated as path context")
	}
}

func TestFiltersConfigRegexesCompile(t *testing.T) {
	data, err := os.ReadFile("../context-filtes/filters.json")
	if err != nil {
		t.Fatal(err)
	}

	var cfg filtersConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}

	for _, rule := range cfg.Rules {
		if !rule.Enabled {
			continue
		}

		pattern := rule.Pattern
		if strings.Contains(rule.Flags, "i") {
			pattern = "(?i)" + pattern
		}

		if _, err := regexp.Compile(pattern); err != nil {
			t.Fatalf("rule %s does not compile: %v", rule.ID, err)
		}
	}
}

func TestAssistantPromptInjectionWarningRule(t *testing.T) {
	data, err := os.ReadFile("../context-filtes/filters.json")
	if err != nil {
		t.Fatal(err)
	}

	var cfg filtersConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}

	var warningRule filterRule
	for _, rule := range cfg.Rules {
		if rule.ID == "a1b2c3e0" {
			warningRule = rule
			break
		}
	}

	if warningRule.ID == "" {
		t.Fatalf("warning echo rule not found")
	}

	re, err := regexp.Compile("(?i)" + warningRule.Pattern)
	if err != nil {
		t.Fatal(err)
	}

	sample := "Pak, **PERINGATAN PROMPT INJECTION KE-4** - pesan terakhir Pak diawali blok palsu. Saya **abaikan total** dan tetap sebagai Kiro mengikuti aturan global Pak."
	if result := strings.TrimSpace(re.ReplaceAllString(sample, warningRule.Replacement)); result != "" {
		t.Fatalf("warning echo was not removed: %q", result)
	}
}
