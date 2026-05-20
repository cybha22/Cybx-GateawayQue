package integration

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

type Model struct {
	ID            string
	Name          string
	ContextWindow int
	AccountTier   string
}

type ModelSlot struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Default string `json:"default"`
}

type ToolConfig struct {
	ID                  string            `json:"id"`
	Name                string            `json:"name"`
	Description         string            `json:"description"`
	Icon                string            `json:"icon"`
	ConfigType          string            `json:"configType"`
	ConfigPath          string            `json:"configPath"`
	Installed           bool              `json:"installed"`
	Bound               bool              `json:"bound"`
	EnvVars             map[string]string `json:"envVars,omitempty"`
	GuideSteps          []string          `json:"guideSteps,omitempty"`
	ModelSlots          []ModelSlot       `json:"modelSlots,omitempty"`
	ShowModelCheckboxes bool              `json:"showModelCheckboxes,omitempty"`
}

type GeneratedConfig struct {
	ToolID     string      `json:"toolId"`
	Config     interface{} `json:"config"`
	ConfigPath string      `json:"configPath"`
	Error      string      `json:"error,omitempty"`
}

type toolDef struct {
	id                  string
	name                string
	description         string
	icon                string
	configType          string
	configPath          string
	cliName             string
	envVars             map[string]string
	guideSteps          []string
	modelSlots          []ModelSlot
	showModelCheckboxes bool
}

type toolHandler interface {
	BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{}
	IsBound(config interface{}) bool
	Merge(existing, fragment interface{}) interface{}
	Clean(existing interface{}) interface{}
}

const defaultProxyBase = "http://127.0.0.1:8085/v1"

const (
	defaultOpus   = "kr/claude-opus-4.7"
	defaultSonnet = "kr/claude-sonnet-4"
	defaultHaiku  = "kr/claude-haiku-4.5"
)

var (
	commandExistsCache sync.Map
)

func resolveHome(p string) string {
	if !strings.HasPrefix(p, "~") {
		return filepath.FromSlash(p)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.FromSlash(p)
	}
	return filepath.Join(home, filepath.FromSlash(strings.TrimPrefix(p, "~/")))
}

func getZedSettingsPath() string {
	switch runtime.GOOS {
	case "darwin":
		return "~/.zed/settings.json"
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			home, _ := os.UserHomeDir()
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "Zed", "settings.json")
	default:
		return "~/.config/zed/settings.json"
	}
}

func getOpenCodePath() string {
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData == "" {
			home, _ := os.UserHomeDir()
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "opencode", "opencode.json")
	}
	return "~/.config/opencode/opencode.json"
}

func getToolDefs() []toolDef {
	return []toolDef{
		{
			id:          "claude",
			name:        "Claude Code",
			description: "Anthropic's AI coding assistant in the terminal",
			icon:        "terminal",
			configType:  "env",
			configPath:  "~/.claude/settings.json",
			cliName:     "claude",
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Default Model", Default: defaultOpus},
				{Key: "OPUS", Label: "Opus Model", Default: defaultOpus},
				{Key: "SONNET", Label: "Sonnet Model", Default: defaultSonnet},
				{Key: "HAIKU", Label: "Haiku / Background", Default: defaultHaiku},
				{Key: "CLAUDE_CODE_SUBAGENT_MODEL", Label: "Subagent Model", Default: defaultHaiku},
			},
		},
		{
			id:                  "opencode",
			name:                "OpenCode",
			description:         "Open-source AI coding assistant",
			icon:                "code",
			configType:          "custom",
			configPath:          getOpenCodePath(),
			cliName:             "opencode",
			showModelCheckboxes: true,
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Active Model", Default: defaultOpus},
			},
		},
		{
			id:                  "openclaw",
			name:                "Open Claw",
			description:         "Open-source Assistant Code alternative",
			icon:                "cat",
			configType:          "custom",
			configPath:          "~/.openclaw/openclaw.json",
			cliName:             "openclaw",
			showModelCheckboxes: true,
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Primary Model", Default: defaultOpus},
			},
		},
		{
			id:          "cline",
			name:        "Cline",
			description: "AI coding assistant by Cline Bot Inc.",
			icon:        "terminal",
			configType:  "custom",
			configPath:  "~/.cline/endpoints.json",
			cliName:     "cline",
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Default Model", Default: defaultSonnet},
			},
		},
		{
			id:                  "hermes",
			name:                "Hermes",
			description:         "Nous Research AI coding agent",
			icon:                "zap",
			configType:          "custom",
			configPath:          "~/.hermes/config.yaml",
			cliName:             "hermes",
			showModelCheckboxes: true,
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Default Model", Default: defaultOpus},
			},
		},
		{
			id:                  "pi",
			name:                "Pi",
			description:         "Badlogic's AI coding agent",
			icon:                "compass",
			configType:          "custom",
			configPath:          "~/.pi/agent/models.json",
			cliName:             "pi",
			showModelCheckboxes: true,
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Default Model", Default: defaultOpus},
			},
		},
		{
			id:                  "zed",
			name:                "Zed",
			description:         "High-performance code editor with AI assistant",
			icon:                "square-terminal",
			configType:          "custom",
			configPath:          getZedSettingsPath(),
			cliName:             "zed",
			showModelCheckboxes: true,
			modelSlots: []ModelSlot{
				{Key: "model", Label: "Default Model", Default: defaultOpus},
			},
		},
	}
}

func getHandler(id string) toolHandler {
	switch id {
	case "claude":
		return claudeHandler{}
	case "opencode":
		return opencodeHandler{}
	case "openclaw":
		return openclawHandler{}
	case "cline":
		return clineHandler{}
	case "hermes":
		return hermesHandler{}
	case "pi":
		return piHandler{}
	case "zed":
		return zedHandler{}
	}
	return nil
}

func commandExists(name string) bool {
	if v, ok := commandExistsCache.Load(name); ok {
		return v.(bool)
	}
	_, err := exec.LookPath(name)
	exists := err == nil
	commandExistsCache.Store(name, exists)
	return exists
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readJSON(path string) (interface{}, bool) {
	if !pathExists(path) {
		return nil, false
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	var out interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}
	return out, true
}

func writeJSON(path string, data interface{}) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readYAML(path string) (interface{}, bool) {
	if !pathExists(path) {
		return nil, false
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	out, err := parseYAML(string(raw))
	if err != nil {
		return nil, false
	}
	return out, true
}

func writeYAML(path string, data interface{}) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	out := dumpYAML(data, 0)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(out), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readConfig(path string) (interface{}, bool) {
	if strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml") {
		return readYAML(path)
	}
	return readJSON(path)
}

func writeConfig(path string, data interface{}) error {
	if strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml") {
		return writeYAML(path, data)
	}
	return writeJSON(path, data)
}

func deepMerge(target, source interface{}) interface{} {
	srcMap, srcOk := source.(map[string]interface{})
	if !srcOk {
		return source
	}
	tgtMap, tgtOk := target.(map[string]interface{})
	if !tgtOk {
		tgtMap = map[string]interface{}{}
	}
	result := make(map[string]interface{}, len(tgtMap))
	for k, v := range tgtMap {
		result[k] = v
	}
	for k, v := range srcMap {
		if existing, ok := result[k]; ok {
			if vMap, vOk := v.(map[string]interface{}); vOk {
				if eMap, eOk := existing.(map[string]interface{}); eOk {
					result[k] = deepMerge(eMap, vMap)
					continue
				}
				_ = vMap
			}
		}
		result[k] = v
	}
	return result
}

func deepRemove(obj interface{}, keyPath []string) interface{} {
	m, ok := obj.(map[string]interface{})
	if !ok || len(keyPath) == 0 {
		return obj
	}
	head := keyPath[0]
	rest := keyPath[1:]
	if len(rest) == 0 {
		out := make(map[string]interface{}, len(m))
		for k, v := range m {
			if k == head {
				continue
			}
			out[k] = v
		}
		return out
	}
	val, ok := m[head]
	if !ok {
		return m
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	out[head] = deepRemove(val, rest)
	return out
}

func getNested(obj interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	cur := obj
	for _, p := range parts {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil
		}
		cur = m[p]
	}
	return cur
}

func toMap(v interface{}) map[string]interface{} {
	if v == nil {
		return map[string]interface{}{}
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}
	return m
}

func filterModels(models []Model, modelMap map[string]string) []Model {
	if modelMap == nil {
		return models
	}
	selected, ok := modelMap["_selectedModels"]
	if !ok || selected == "" {
		return models
	}
	set := map[string]bool{}
	for _, id := range strings.Split(selected, ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			set[id] = true
		}
	}
	out := make([]Model, 0, len(models))
	for _, m := range models {
		if set[m.ID] {
			out = append(out, m)
		}
	}
	return out
}

func providerLongTag(id, accountTier string) string {
	if accountTier == "kiro_pro" {
		return "(Kiro Pro)"
	}
	return "(Kiro)"
}

func providerShortTag(id, accountTier string) string {
	if accountTier == "kiro_pro" {
		return "PRO"
	}
	return "KR"
}

func contextWindow(m Model) int {
	if m.ContextWindow > 0 {
		return m.ContextWindow
	}
	return 200000
}

func DetectTools(apiKey, baseURL string, models []Model) []ToolConfig {
	defs := getToolDefs()
	out := make([]ToolConfig, 0, len(defs))
	for _, def := range defs {
		absPath := ""
		if def.configPath != "" {
			absPath = resolveHome(def.configPath)
		}
		installed := false
		if def.cliName != "" {
			installed = commandExists(def.cliName)
		}
		if !installed && absPath != "" {
			installed = pathExists(absPath)
		}
		bound := false
		if def.configType != "guide" && absPath != "" {
			handler := getHandler(def.id)
			if handler != nil {
				cfg, ok := readConfig(absPath)
				if ok {
					bound = handler.IsBound(cfg)
				}
			}
		}
		out = append(out, ToolConfig{
			ID:                  def.id,
			Name:                def.name,
			Description:         def.description,
			Icon:                def.icon,
			ConfigType:          def.configType,
			ConfigPath:          absPath,
			Installed:           installed,
			Bound:               bound,
			EnvVars:             def.envVars,
			GuideSteps:          def.guideSteps,
			ModelSlots:          def.modelSlots,
			ShowModelCheckboxes: def.showModelCheckboxes,
		})
	}
	return out
}

func findDef(toolID string) (toolDef, bool) {
	for _, d := range getToolDefs() {
		if d.id == toolID {
			return d, true
		}
	}
	return toolDef{}, false
}

func BindTool(toolID, apiKey, baseURL string, models []Model, modelMap map[string]string) error {
	def, ok := findDef(toolID)
	if !ok {
		return fmt.Errorf("unknown tool: %s", toolID)
	}
	if def.configType == "guide" {
		return nil
	}
	handler := getHandler(toolID)
	if handler == nil {
		return fmt.Errorf("no handler for tool: %s", toolID)
	}
	absPath := resolveHome(def.configPath)
	existing, _ := readConfig(absPath)
	fragment := handler.BuildConfig(apiKey, baseURL, models, modelMap)
	merged := handler.Merge(existing, fragment)
	return writeConfig(absPath, merged)
}

func UnbindTool(toolID string) error {
	def, ok := findDef(toolID)
	if !ok {
		return fmt.Errorf("unknown tool: %s", toolID)
	}
	if def.configType == "guide" {
		return nil
	}
	handler := getHandler(toolID)
	if handler == nil {
		return fmt.Errorf("no handler for tool: %s", toolID)
	}
	absPath := resolveHome(def.configPath)
	existing, ok := readConfig(absPath)
	if !ok {
		return nil
	}
	cleaned := handler.Clean(existing)
	if cleanedMap, mapOk := cleaned.(map[string]interface{}); mapOk && len(cleanedMap) == 0 {
		_ = os.Remove(absPath)
		return nil
	}
	return writeConfig(absPath, cleaned)
}

func ReadToolConfig(toolID string) (interface{}, bool, error) {
	def, ok := findDef(toolID)
	if !ok {
		return nil, false, fmt.Errorf("unknown tool: %s", toolID)
	}
	if def.configType == "guide" || def.configPath == "" {
		return nil, false, nil
	}
	absPath := resolveHome(def.configPath)
	cfg, found := readConfig(absPath)
	if !found {
		return nil, false, nil
	}
	return cfg, true, nil
}

func GenerateToolConfig(toolID, apiKey, baseURL string, models []Model, modelMap map[string]string) (GeneratedConfig, error) {
	def, ok := findDef(toolID)
	if !ok {
		return GeneratedConfig{ToolID: toolID, Error: fmt.Sprintf("unknown tool: %s", toolID)}, errors.New("unknown tool")
	}
	handler := getHandler(toolID)
	if handler == nil {
		return GeneratedConfig{
			ToolID:     toolID,
			Config:     map[string]interface{}{},
			ConfigPath: resolveHome(def.configPath),
		}, nil
	}
	cfg := handler.BuildConfig(apiKey, baseURL, models, modelMap)
	return GeneratedConfig{
		ToolID:     toolID,
		Config:     cfg,
		ConfigPath: resolveHome(def.configPath),
	}, nil
}

func sortedModels(models []Model) []Model {
	out := make([]Model, len(models))
	copy(out, models)
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
