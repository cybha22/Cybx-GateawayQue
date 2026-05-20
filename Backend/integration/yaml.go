package integration

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
)

func parseYAML(text string) (interface{}, error) {
	lines := []string{}
	scanner := bufio.NewScanner(strings.NewReader(text))
	scanner.Buffer(make([]byte, 1024*1024), 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		lines = append(lines, line)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return map[string]interface{}{}, nil
	}
	value, _, err := parseBlock(lines, 0, 0)
	if err != nil {
		return nil, err
	}
	return value, nil
}

func indentLevel(line string) int {
	count := 0
	for _, ch := range line {
		if ch == ' ' {
			count++
		} else if ch == '\t' {
			count += 2
		} else {
			break
		}
	}
	return count
}

func parseBlock(lines []string, start, indent int) (interface{}, int, error) {
	if start >= len(lines) {
		return map[string]interface{}{}, start, nil
	}
	first := lines[start]
	trimmed := strings.TrimSpace(first)
	if strings.HasPrefix(trimmed, "- ") || trimmed == "-" {
		return parseList(lines, start, indent)
	}
	return parseMap(lines, start, indent)
}

func parseMap(lines []string, start, indent int) (map[string]interface{}, int, error) {
	out := map[string]interface{}{}
	i := start
	for i < len(lines) {
		line := lines[i]
		curIndent := indentLevel(line)
		if curIndent < indent {
			break
		}
		if curIndent > indent {
			i++
			continue
		}
		trimmed := strings.TrimSpace(line)
		colon := strings.Index(trimmed, ":")
		if colon < 0 {
			return nil, i, fmt.Errorf("invalid yaml line: %q", line)
		}
		key := strings.TrimSpace(trimmed[:colon])
		key = strings.Trim(key, "\"'")
		rest := strings.TrimSpace(trimmed[colon+1:])
		if rest != "" {
			out[key] = parseScalar(rest)
			i++
			continue
		}
		if i+1 < len(lines) {
			nextIndent := indentLevel(lines[i+1])
			if nextIndent > curIndent {
				value, next, err := parseBlock(lines, i+1, nextIndent)
				if err != nil {
					return nil, next, err
				}
				out[key] = value
				i = next
				continue
			}
		}
		out[key] = nil
		i++
	}
	return out, i, nil
}

func parseList(lines []string, start, indent int) ([]interface{}, int, error) {
	out := []interface{}{}
	i := start
	for i < len(lines) {
		line := lines[i]
		curIndent := indentLevel(line)
		if curIndent < indent {
			break
		}
		if curIndent > indent {
			i++
			continue
		}
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "- ") && trimmed != "-" {
			break
		}
		rest := strings.TrimPrefix(trimmed, "-")
		rest = strings.TrimSpace(rest)
		if rest == "" {
			if i+1 < len(lines) {
				nextIndent := indentLevel(lines[i+1])
				if nextIndent > curIndent {
					value, next, err := parseBlock(lines, i+1, nextIndent)
					if err != nil {
						return nil, next, err
					}
					out = append(out, value)
					i = next
					continue
				}
			}
			out = append(out, nil)
			i++
			continue
		}
		if strings.Contains(rest, ":") && !strings.HasPrefix(rest, "\"") && !strings.HasPrefix(rest, "'") {
			synthetic := strings.Repeat(" ", curIndent+2) + rest
			synthLines := []string{synthetic}
			synthLines = append(synthLines, lines[i+1:]...)
			value, consumed, err := parseMap(synthLines, 0, curIndent+2)
			if err != nil {
				return nil, i, err
			}
			out = append(out, value)
			i = i + consumed
			continue
		}
		out = append(out, parseScalar(rest))
		i++
	}
	return out, i, nil
}

func parseScalar(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" || s == "~" || s == "null" {
		return nil
	}
	if s == "true" {
		return true
	}
	if s == "false" {
		return false
	}
	if (strings.HasPrefix(s, "\"") && strings.HasSuffix(s, "\"")) ||
		(strings.HasPrefix(s, "'") && strings.HasSuffix(s, "'")) {
		return s[1 : len(s)-1]
	}
	if strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]") {
		inner := strings.TrimSpace(s[1 : len(s)-1])
		if inner == "" {
			return []interface{}{}
		}
		parts := splitFlow(inner)
		arr := make([]interface{}, 0, len(parts))
		for _, p := range parts {
			arr = append(arr, parseScalar(strings.TrimSpace(p)))
		}
		return arr
	}
	if i, err := strconv.ParseInt(s, 10, 64); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}

func splitFlow(s string) []string {
	out := []string{}
	depth := 0
	last := 0
	inStr := byte(0)
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if inStr != 0 {
			if ch == inStr {
				inStr = 0
			}
			continue
		}
		switch ch {
		case '"', '\'':
			inStr = ch
		case '[', '{':
			depth++
		case ']', '}':
			depth--
		case ',':
			if depth == 0 {
				out = append(out, s[last:i])
				last = i + 1
			}
		}
	}
	out = append(out, s[last:])
	return out
}

func dumpYAML(value interface{}, indent int) string {
	var b strings.Builder
	dumpYAMLInto(&b, value, indent, true)
	return b.String()
}

func dumpYAMLInto(b *strings.Builder, value interface{}, indent int, topLevel bool) {
	pad := strings.Repeat("  ", indent)
	switch v := value.(type) {
	case map[string]interface{}:
		if len(v) == 0 {
			if !topLevel {
				b.WriteString(" {}\n")
			} else {
				b.WriteString("{}\n")
			}
			return
		}
		keys := sortedKeys(v)
		for _, k := range keys {
			val := v[k]
			b.WriteString(pad)
			b.WriteString(quoteYAMLKey(k))
			b.WriteString(":")
			switch sub := val.(type) {
			case map[string]interface{}:
				if len(sub) == 0 {
					b.WriteString(" {}\n")
				} else {
					b.WriteString("\n")
					dumpYAMLInto(b, sub, indent+1, false)
				}
			case []interface{}:
				if len(sub) == 0 {
					b.WriteString(" []\n")
				} else {
					b.WriteString("\n")
					dumpYAMLList(b, sub, indent)
				}
			default:
				b.WriteString(" ")
				b.WriteString(yamlScalar(val))
				b.WriteString("\n")
			}
		}
	case []interface{}:
		if len(v) == 0 {
			b.WriteString("[]\n")
			return
		}
		dumpYAMLList(b, v, indent-1)
	default:
		b.WriteString(yamlScalar(value))
		b.WriteString("\n")
	}
}

func dumpYAMLList(b *strings.Builder, list []interface{}, parentIndent int) {
	pad := strings.Repeat("  ", parentIndent+1)
	for _, item := range list {
		b.WriteString(pad)
		b.WriteString("-")
		switch sub := item.(type) {
		case map[string]interface{}:
			if len(sub) == 0 {
				b.WriteString(" {}\n")
			} else {
				b.WriteString("\n")
				dumpYAMLInto(b, sub, parentIndent+2, false)
			}
		case []interface{}:
			if len(sub) == 0 {
				b.WriteString(" []\n")
			} else {
				b.WriteString("\n")
				dumpYAMLList(b, sub, parentIndent+1)
			}
		default:
			b.WriteString(" ")
			b.WriteString(yamlScalar(item))
			b.WriteString("\n")
		}
	}
}

func quoteYAMLKey(k string) string {
	if k == "" {
		return "\"\""
	}
	if needsQuotingKey(k) {
		return strconv.Quote(k)
	}
	return k
}

func needsQuotingKey(k string) bool {
	for _, ch := range k {
		if ch == ':' || ch == '#' || ch == '\n' || ch == '"' || ch == '\'' || ch == '{' || ch == '}' || ch == '[' || ch == ']' || ch == ',' || ch == '&' || ch == '*' || ch == '?' || ch == '|' || ch == '<' || ch == '>' || ch == '=' || ch == '!' || ch == '%' || ch == '@' || ch == '`' {
			return true
		}
	}
	return false
}

func yamlScalar(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case string:
		if x == "" {
			return "\"\""
		}
		if needsStringQuote(x) {
			return strconv.Quote(x)
		}
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func needsStringQuote(s string) bool {
	if s == "" {
		return true
	}
	if s == "true" || s == "false" || s == "null" || s == "~" {
		return true
	}
	if _, err := strconv.ParseFloat(s, 64); err == nil {
		return true
	}
	for _, ch := range s {
		if ch == ':' || ch == '#' || ch == '\n' || ch == '"' || ch == '\'' || ch == '{' || ch == '}' || ch == '[' || ch == ']' || ch == ',' || ch == '&' || ch == '*' || ch == '?' || ch == '|' || ch == '<' || ch == '>' || ch == '=' || ch == '!' || ch == '%' || ch == '@' || ch == '`' || ch == '\t' {
			return true
		}
	}
	if strings.HasPrefix(s, "- ") || strings.HasPrefix(s, " ") || strings.HasSuffix(s, " ") {
		return true
	}
	return false
}

func sortedKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sortStrings(keys)
	return keys
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j-1] > s[j]; j-- {
			s[j-1], s[j] = s[j], s[j-1]
		}
	}
}
