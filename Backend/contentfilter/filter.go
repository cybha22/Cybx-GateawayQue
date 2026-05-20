package contentfilter

import (
	"encoding/json"
	"fmt"
	"kiro-go/logger"
	"os"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
)

type filterRule struct {
	Label       string `json:"label"`
	Pattern     string `json:"pattern"`
	Flags       string `json:"flags"`
	Replacement string `json:"replacement"`
	Enabled     bool   `json:"enabled"`
	ID          string `json:"id"`
	SkipInPath  bool   `json:"skipInPath"`
}

type filtersConfig struct {
	Enabled bool         `json:"enabled"`
	Rules   []filterRule `json:"rules"`
}

type compiledRule struct {
	regex       *regexp.Regexp
	replacement string
	label       string
	id          string
	skipInPath  bool
}

var (
	rules     []compiledRule
	rulesMu   sync.RWMutex
	rulesOnce sync.Once
	loaded    bool
	auditMode atomic.Int32
	pathCharSet [256]bool
)

func init() {
	for _, ch := range "/\\._-" {
		pathCharSet[ch] = true
	}
	for ch := 'a'; ch <= 'z'; ch++ {
		pathCharSet[ch] = true
	}
	for ch := 'A'; ch <= 'Z'; ch++ {
		pathCharSet[ch] = true
	}
	for ch := '0'; ch <= '9'; ch++ {
		pathCharSet[ch] = true
	}
}

func isPathChar(b byte) bool {
	return pathCharSet[b]
}

func tokenHasPathDelimiter(text string, matchStart, matchEnd int) bool {
	left := matchStart
	for left > 0 && isPathChar(text[left-1]) {
		left--
	}

	right := matchEnd
	for right < len(text) && isPathChar(text[right]) {
		right++
	}

	for i := left; i < right; i++ {
		switch text[i] {
		case '/', '\\':
			return true
		}
	}
	return false
}

func isInPathContext(text string, matchStart, matchEnd int) bool {
	leftPathChar := matchStart > 0 && isPathChar(text[matchStart-1])
	rightPathChar := matchEnd < len(text) && isPathChar(text[matchEnd])

	if !leftPathChar && !rightPathChar {
		return false
	}

	return tokenHasPathDelimiter(text, matchStart, matchEnd)
}

func SetAuditMode(enabled bool) {
	if enabled {
		auditMode.Store(1)
	} else {
		auditMode.Store(0)
	}
}

func isAuditMode() bool {
	return auditMode.Load() == 1
}

func truncateForLog(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + fmt.Sprintf("... [truncated, total %d chars]", len(s))
}

func extractContext(text string, loc []int, contextChars int) string {
	start := loc[0] - contextChars
	if start < 0 {
		start = 0
	}
	end := loc[1] + contextChars
	if end > len(text) {
		end = len(text)
	}

	prefix := ""
	suffix := ""
	if start > 0 {
		prefix = "..."
	}
	if end < len(text) {
		suffix = "..."
	}

	matched := text[loc[0]:loc[1]]
	before := text[start:loc[0]]
	after := text[loc[1]:end]

	return fmt.Sprintf("%s%s[>>%s<<]%s%s", prefix, before, matched, after, suffix)
}

func Load(path string) {
	rulesOnce.Do(func() {
		_ = compileFromFile(path)
	})
}

func Reload(path string) error {
	return compileFromFile(path)
}

func compileFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		logger.Warnf("[ContentFilter] Failed to read %s: %v", path, err)
		return err
	}

	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}

	var cfg filtersConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		logger.Warnf("[ContentFilter] Failed to parse %s: %v", path, err)
		return err
	}

	rulesMu.Lock()
	defer rulesMu.Unlock()

	if !cfg.Enabled {
		rules = nil
		loaded = false
		logger.Infof("[ContentFilter] Filters disabled in config")
		return nil
	}

	skipped := 0
	failed := 0
	pathAware := 0
	compiled := make([]compiledRule, 0, len(cfg.Rules))
	for _, r := range cfg.Rules {
		if !r.Enabled {
			skipped++
			continue
		}

		flags := ""
		caseInsensitive := false
		for _, ch := range r.Flags {
			if ch == 'i' {
				caseInsensitive = true
			}
		}

		pattern := r.Pattern
		if caseInsensitive {
			flags = "(?i)"
		}

		re, err := regexp.Compile(flags + pattern)
		if err != nil {
			logger.Warnf("[ContentFilter] Invalid regex in rule '%s' (id=%s): %v", r.Label, r.ID, err)
			failed++
			continue
		}

		if r.SkipInPath {
			pathAware++
		}

		compiled = append(compiled, compiledRule{
			regex:       re,
			replacement: r.Replacement,
			label:       r.Label,
			id:          r.ID,
			skipInPath:  r.SkipInPath,
		})
	}

	rules = compiled
	loaded = true
	logger.Infof("[ContentFilter] Loaded %d filter rules (skipped=%d disabled, failed=%d invalid, pathAware=%d)", len(rules), skipped, failed, pathAware)
	return nil
}

func applyRule(rule compiledRule, text string, audit bool) (string, int) {
	if !rule.skipInPath {
		locs := rule.regex.FindAllStringIndex(text, -1)
		matchCount := len(locs)

		if matchCount > 0 && audit {
			logger.Debugf("[ContentFilter:AUDIT] Rule [%s] '%s': %d match(es)", rule.id, rule.label, matchCount)
			for i, loc := range locs {
				if i >= 5 {
					logger.Debugf("[ContentFilter:AUDIT]   ... and %d more matches", matchCount-5)
					break
				}
				ctx := extractContext(text, loc, 60)
				logger.Debugf("[ContentFilter:AUDIT]   Match #%d: %s", i+1, ctx)
			}
			logger.Debugf("[ContentFilter:AUDIT]   Replacement: %q", truncateForLog(rule.replacement, 200))
		}

		if matchCount > 0 {
			result := rule.regex.ReplaceAllString(text, rule.replacement)
			return result, matchCount
		}
		return text, 0
	}

	locs := rule.regex.FindAllStringIndex(text, -1)
	if len(locs) == 0 {
		return text, 0
	}

	applied := 0
	skippedPath := 0
	var builder strings.Builder
	builder.Grow(len(text))
	lastEnd := 0

	for _, loc := range locs {
		if isInPathContext(text, loc[0], loc[1]) {
			skippedPath++
			if audit {
				ctx := extractContext(text, loc, 60)
				logger.Debugf("[ContentFilter:AUDIT]   SKIPPED (path context): %s", ctx)
			}
			continue
		}
		applied++
		if audit {
			ctx := extractContext(text, loc, 60)
			logger.Debugf("[ContentFilter:AUDIT]   Match #%d: %s", applied, ctx)
		}
		builder.WriteString(text[lastEnd:loc[0]])
		builder.WriteString(rule.replacement)
		lastEnd = loc[1]
	}

	if applied == 0 {
		if audit && skippedPath > 0 {
			logger.Debugf("[ContentFilter:AUDIT] Rule [%s] '%s': %d found, ALL SKIPPED (path context)", rule.id, rule.label, skippedPath)
		}
		return text, 0
	}

	builder.WriteString(text[lastEnd:])
	result := builder.String()

	if audit {
		logger.Debugf("[ContentFilter:AUDIT] Rule [%s] '%s': %d match(es), %d skipped(path)", rule.id, rule.label, applied, skippedPath)
		logger.Debugf("[ContentFilter:AUDIT]   Replacement: %q", truncateForLog(rule.replacement, 200))
	}

	return result, applied
}

func Apply(text string) string {
	rulesMu.RLock()
	if !loaded || len(rules) == 0 {
		rulesMu.RUnlock()
		return text
	}
	snapshot := make([]compiledRule, len(rules))
	copy(snapshot, rules)
	rulesMu.RUnlock()

	audit := isAuditMode()

	if audit {
		logger.Debugf("[ContentFilter:AUDIT] ========== FILTER APPLY START ==========")
		logger.Debugf("[ContentFilter:AUDIT] Input length: %d chars", len(text))
		logger.Debugf("[ContentFilter:AUDIT] Input preview: %s", truncateForLog(text, 500))
	}

	result := text
	totalMatches := 0
	matchedRules := []string{}

	for _, rule := range snapshot {
		before := result
		var matchCount int
		result, matchCount = applyRule(rule, result, audit)

		if matchCount > 0 {
			totalMatches += matchCount
			matchedRules = append(matchedRules, fmt.Sprintf("%s(%s)x%d", rule.id, rule.label, matchCount))

			if audit {
				delta := len(before) - len(result)
				logger.Debugf("[ContentFilter:AUDIT]   Size delta: %d chars (before=%d, after=%d)", delta, len(before), len(result))
			}
		} else if audit && matchCount == 0 {
			if !rule.skipInPath {
				logger.Debugf("[ContentFilter:AUDIT] Rule [%s] '%s': NO MATCH", rule.id, rule.label)
			}
		}
	}

	if audit {
		logger.Debugf("[ContentFilter:AUDIT] ---------- FILTER APPLY RESULT ----------")
		logger.Debugf("[ContentFilter:AUDIT] Total rules: %d, Matched rules: %d, Total matches: %d", len(snapshot), len(matchedRules), totalMatches)
		if len(matchedRules) > 0 {
			logger.Debugf("[ContentFilter:AUDIT] Matched: %s", strings.Join(matchedRules, " | "))
		}
		logger.Debugf("[ContentFilter:AUDIT] Output length: %d chars (delta: %d)", len(result), len(text)-len(result))
		logger.Debugf("[ContentFilter:AUDIT] Output preview: %s", truncateForLog(result, 500))
		logger.Debugf("[ContentFilter:AUDIT] ========== FILTER APPLY END ==========")
	} else if totalMatches > 0 {
		logger.Debugf("[ContentFilter] Applied %d match(es) across %d rule(s): %s", totalMatches, len(matchedRules), strings.Join(matchedRules, " | "))
	}

	return result
}

func IsLoaded() bool {
	rulesMu.RLock()
	defer rulesMu.RUnlock()
	return loaded
}

var systemReminderRe = regexp.MustCompile(`(?s)(<system-reminder>)(.*?)(</system-reminder>)`)

func ApplyInSystemReminders(text string) string {
	if !IsLoaded() {
		return text
	}

	if !systemReminderRe.MatchString(text) {
		return text
	}

	audit := isAuditMode()
	if audit {
		logger.Debugf("[ContentFilter:AUDIT] ========== SYSTEM-REMINDER FILTER START ==========")
		logger.Debugf("[ContentFilter:AUDIT] Input length: %d chars", len(text))
	}

	result := systemReminderRe.ReplaceAllStringFunc(text, func(match string) string {
		subs := systemReminderRe.FindStringSubmatch(match)
		if len(subs) < 4 {
			return match
		}
		openTag := subs[1]
		inner := subs[2]
		closeTag := subs[3]

		if audit {
			logger.Debugf("[ContentFilter:AUDIT] Found <system-reminder> block (%d chars)", len(inner))
		}

		filtered := Apply(inner)
		return openTag + filtered + closeTag
	})

	if audit {
		logger.Debugf("[ContentFilter:AUDIT] Output length: %d chars (delta: %d)", len(result), len(text)-len(result))
		logger.Debugf("[ContentFilter:AUDIT] ========== SYSTEM-REMINDER FILTER END ==========")
	}

	return result
}
