package integration

import "strings"

type claudeHandler struct{}

func (claudeHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	mm := modelMap
	if mm == nil {
		mm = map[string]string{}
	}
	cleanBase := strings.TrimSuffix(baseURL, "/v1")
	cleanBase = strings.TrimSuffix(cleanBase, "/")
	pickValue := func(key, fallback string) string {
		if v, ok := mm[key]; ok && v != "" {
			return v
		}
		return fallback
	}
	pick := func(legacyKey, slotKey, fallback string) string {
		if v, ok := mm[legacyKey]; ok && v != "" {
			return v
		}
		return pickValue(slotKey, fallback)
	}
	env := map[string]string{
		"ANTHROPIC_AUTH_TOKEN":                       apiKey,
		"ANTHROPIC_BASE_URL":                         cleanBase,
		"ANTHROPIC_DEFAULT_OPUS_MODEL":               pick("ANTHROPIC_DEFAULT_OPUS_MODEL", "OPUS", defaultOpus),
		"ANTHROPIC_DEFAULT_SONNET_MODEL":             pick("ANTHROPIC_DEFAULT_SONNET_MODEL", "SONNET", defaultSonnet),
		"ANTHROPIC_DEFAULT_HAIKU_MODEL":              pick("ANTHROPIC_DEFAULT_HAIKU_MODEL", "HAIKU", defaultHaiku),
		"CLAUDE_CODE_SUBAGENT_MODEL":                 pickValue("CLAUDE_CODE_SUBAGENT_MODEL", defaultHaiku),
		"API_TIMEOUT_MS":                             "3000000",
		"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
	}
	envIface := map[string]interface{}{}
	for k, v := range env {
		envIface[k] = v
	}
	return map[string]interface{}{
		"model":                  pickValue("model", defaultOpus),
		"hasCompletedOnboarding": true,
		"env":                    envIface,
	}
}

func (claudeHandler) IsBound(config interface{}) bool {
	m, ok := config.(map[string]interface{})
	if !ok {
		return false
	}
	env, ok := m["env"].(map[string]interface{})
	if !ok {
		return false
	}
	for k, v := range env {
		if !strings.Contains(k, "BASE_URL") {
			continue
		}
		s, sOk := v.(string)
		if !sOk {
			continue
		}
		if strings.Contains(s, "127.0.0.1") || strings.Contains(s, "localhost") {
			return true
		}
	}
	return false
}

func (claudeHandler) Merge(existing, fragment interface{}) interface{} {
	frag := toMap(fragment)
	exist := toMap(existing)
	result := make(map[string]interface{}, len(exist))
	for k, v := range exist {
		result[k] = v
	}
	if v, ok := frag["model"]; ok {
		result["model"] = v
	}
	if v, ok := frag["hasCompletedOnboarding"]; ok {
		result["hasCompletedOnboarding"] = v
	}
	if env, ok := frag["env"]; ok {
		result["env"] = env
	}
	return result
}

func (claudeHandler) Clean(existing interface{}) interface{} {
	m := toMap(existing)
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		if k == "model" {
			continue
		}
		out[k] = v
	}
	if envRaw, ok := out["env"]; ok {
		if env, envOk := envRaw.(map[string]interface{}); envOk {
			cleaned := map[string]interface{}{}
			for k, v := range env {
				if strings.Contains(k, "AUTH_TOKEN") ||
					strings.Contains(k, "BASE_URL") ||
					strings.Contains(k, "DEFAULT_OPUS") ||
					strings.Contains(k, "DEFAULT_SONNET") ||
					strings.Contains(k, "DEFAULT_HAIKU") ||
					k == "CLAUDE_CODE_SUBAGENT_MODEL" ||
					k == "API_TIMEOUT_MS" ||
					k == "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC" ||
					k == "ANTHROPIC_MODEL" ||
					k == "ANTHROPIC_SMALL_FAST_MODEL" ||
					k == "ANTHROPIC_DEFAULT_SONET_MODEL" {
					continue
				}
				cleaned[k] = v
			}
			if len(cleaned) == 0 {
				delete(out, "env")
			} else {
				out["env"] = cleaned
			}
		}
	}
	return out
}

type opencodeHandler struct{}

func (opencodeHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	filtered := filterModels(models, modelMap)
	taggedModels := map[string]interface{}{}
	for _, m := range filtered {
		tag := providerLongTag(m.ID, m.AccountTier)
		name := m.Name
		if !strings.Contains(name, tag) {
			name = strings.TrimSpace(name + " " + tag)
		}
		taggedModels[m.ID] = map[string]interface{}{
			"name": name,
			"limit": map[string]interface{}{
				"context": contextWindow(m),
				"output":  65536,
			},
		}
	}
	defaultModel := defaultOpus
	if modelMap != nil {
		if v, ok := modelMap["model"]; ok && v != "" {
			defaultModel = v
		}
	}
	return map[string]interface{}{
		"provider": map[string]interface{}{
			"cybxai": map[string]interface{}{
				"npm": "@ai-sdk/openai-compatible",
				"options": map[string]interface{}{
					"baseURL": baseURL,
					"apiKey":  apiKey,
				},
				"models": taggedModels,
			},
		},
		"model": "cybxai/" + defaultModel,
	}
}

func (opencodeHandler) IsBound(config interface{}) bool {
	return getNested(config, "provider.cybxai") != nil
}

func (opencodeHandler) Merge(existing, fragment interface{}) interface{} {
	return deepMerge(toMap(existing), toMap(fragment))
}

func (opencodeHandler) Clean(existing interface{}) interface{} {
	cleaned := deepRemove(toMap(existing), []string{"provider", "cybxai"})
	m := toMap(cleaned)
	if model, ok := m["model"].(string); ok && strings.HasPrefix(model, "cybxai/") {
		out := make(map[string]interface{}, len(m))
		for k, v := range m {
			if k == "model" {
				continue
			}
			out[k] = v
		}
		return out
	}
	return cleaned
}

type openclawHandler struct{}

func (openclawHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	filtered := filterModels(models, modelMap)
	modelsMap := map[string]interface{}{}
	for _, m := range filtered {
		tag := providerShortTag(m.ID, m.AccountTier)
		longTag := providerLongTag(m.ID, m.AccountTier)
		alias := m.Name
		if !strings.Contains(alias, longTag) && !strings.Contains(alias, "("+tag+")") {
			alias = strings.TrimSpace(m.Name + " (" + tag + ")")
		}
		modelsMap["cybxai/"+m.ID] = map[string]interface{}{"alias": alias}
	}
	defaultModel := defaultOpus
	if modelMap != nil {
		if v, ok := modelMap["model"]; ok && v != "" {
			defaultModel = v
		}
	}
	return map[string]interface{}{
		"models": map[string]interface{}{
			"providers": map[string]interface{}{
				"cybxai": map[string]interface{}{
					"baseUrl": baseURL,
					"apiKey":  apiKey,
				},
			},
		},
		"agents": map[string]interface{}{
			"defaults": map[string]interface{}{
				"models": modelsMap,
				"model":  map[string]interface{}{"primary": "cybxai/" + defaultModel},
			},
		},
	}
}

func (openclawHandler) IsBound(config interface{}) bool {
	return getNested(config, "models.providers.cybxai") != nil
}

func (openclawHandler) Merge(existing, fragment interface{}) interface{} {
	return deepMerge(toMap(existing), toMap(fragment))
}

func (openclawHandler) Clean(existing interface{}) interface{} {
	cleaned := deepRemove(toMap(existing), []string{"models", "providers", "cybxai"})
	models := getNested(cleaned, "agents.defaults.models")
	if mm, ok := models.(map[string]interface{}); ok {
		filtered := map[string]interface{}{}
		for k, v := range mm {
			if strings.HasPrefix(k, "cybxai/") {
				continue
			}
			filtered[k] = v
		}
		cleaned = deepMerge(cleaned, map[string]interface{}{
			"agents": map[string]interface{}{
				"defaults": map[string]interface{}{"models": filtered},
			},
		})
	}
	primary := getNested(cleaned, "agents.defaults.model.primary")
	if s, ok := primary.(string); ok && strings.HasPrefix(s, "cybxai/") {
		cleaned = deepMerge(cleaned, map[string]interface{}{
			"agents": map[string]interface{}{
				"defaults": map[string]interface{}{
					"model": map[string]interface{}{"primary": ""},
				},
			},
		})
	}
	return cleaned
}

type clineHandler struct{}

func (clineHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	return map[string]interface{}{
		"appBaseUrl": "https://app.cline.bot",
		"apiBaseUrl": baseURL,
		"mcpBaseUrl": "https://api.cline.bot/v1/mcp",
	}
}

func (clineHandler) IsBound(config interface{}) bool {
	m, ok := config.(map[string]interface{})
	if !ok {
		return false
	}
	url, ok := m["apiBaseUrl"].(string)
	if !ok {
		return false
	}
	return strings.Contains(url, "127.0.0.1") || strings.Contains(url, "localhost")
}

func (clineHandler) Merge(existing, fragment interface{}) interface{} {
	exist := toMap(existing)
	frag := toMap(fragment)
	out := make(map[string]interface{}, len(exist)+len(frag))
	for k, v := range exist {
		out[k] = v
	}
	for k, v := range frag {
		out[k] = v
	}
	return out
}

func (clineHandler) Clean(existing interface{}) interface{} {
	m := toMap(existing)
	if len(m) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		if k == "apiBaseUrl" {
			continue
		}
		out[k] = v
	}
	return out
}

type piHandler struct{}

func (piHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	filtered := filterModels(models, modelMap)
	piModels := []interface{}{}
	for _, m := range filtered {
		tag := providerLongTag(m.ID, m.AccountTier)
		name := m.Name
		if !strings.Contains(name, tag) {
			name = strings.TrimSpace(name + " " + tag)
		}
		entry := map[string]interface{}{
			"id":   m.ID,
			"name": name,
		}
		if m.ContextWindow > 0 {
			entry["contextWindow"] = m.ContextWindow
		}
		piModels = append(piModels, entry)
	}
	return map[string]interface{}{
		"providers": map[string]interface{}{
			"cybxai": map[string]interface{}{
				"baseUrl": baseURL,
				"api":     "openai-completions",
				"apiKey":  apiKey,
				"compat": map[string]interface{}{
					"supportsDeveloperRole":   false,
					"supportsReasoningEffort": false,
				},
				"models": piModels,
			},
		},
	}
}

func (piHandler) IsBound(config interface{}) bool {
	return getNested(config, "providers.cybxai") != nil
}

func (piHandler) Merge(existing, fragment interface{}) interface{} {
	merged := deepMerge(toMap(existing), toMap(fragment))
	mergedMap := toMap(merged)
	fragMap := toMap(fragment)
	if fragProviders, ok := fragMap["providers"].(map[string]interface{}); ok {
		if cybxai, hasCybx := fragProviders["cybxai"]; hasCybx {
			providers, _ := mergedMap["providers"].(map[string]interface{})
			if providers == nil {
				providers = map[string]interface{}{}
			}
			providers["cybxai"] = cybxai
			mergedMap["providers"] = providers
		}
	}
	return mergedMap
}

func (piHandler) Clean(existing interface{}) interface{} {
	m := toMap(existing)
	if len(m) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	if providers, ok := out["providers"].(map[string]interface{}); ok {
		filtered := map[string]interface{}{}
		for k, v := range providers {
			if k == "cybxai" {
				continue
			}
			filtered[k] = v
		}
		if len(filtered) == 0 {
			delete(out, "providers")
		} else {
			out["providers"] = filtered
		}
	}
	return out
}

type zedHandler struct{}

func (zedHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	filtered := filterModels(models, modelMap)
	available := []interface{}{}
	for _, m := range filtered {
		tag := providerLongTag(m.ID, m.AccountTier)
		display := m.Name
		if !strings.Contains(display, tag) {
			display = strings.TrimSpace(m.Name + " " + tag)
		}
		ctx := m.ContextWindow
		if ctx == 0 {
			ctx = 128000
		}
		available = append(available, map[string]interface{}{
			"name":         m.ID,
			"display_name": display,
			"max_tokens":   ctx,
		})
	}
	return map[string]interface{}{
		"language_models": map[string]interface{}{
			"openai_compatible": map[string]interface{}{
				"CybxAI": map[string]interface{}{
					"api_url":          baseURL,
					"available_models": available,
				},
			},
		},
	}
}

func (zedHandler) IsBound(config interface{}) bool {
	return getNested(config, "language_models.openai_compatible.CybxAI") != nil
}

func (zedHandler) Merge(existing, fragment interface{}) interface{} {
	merged := deepMerge(toMap(existing), toMap(fragment))
	mergedMap := toMap(merged)
	fragLM, _ := toMap(fragment)["language_models"].(map[string]interface{})
	fragCompat, _ := fragLM["openai_compatible"].(map[string]interface{})
	if cybxai, ok := fragCompat["CybxAI"]; ok {
		lm, _ := mergedMap["language_models"].(map[string]interface{})
		if lm == nil {
			lm = map[string]interface{}{}
		}
		compat, _ := lm["openai_compatible"].(map[string]interface{})
		if compat == nil {
			compat = map[string]interface{}{}
		}
		compat["CybxAI"] = cybxai
		lm["openai_compatible"] = compat
		mergedMap["language_models"] = lm
	}
	return mergedMap
}

func (zedHandler) Clean(existing interface{}) interface{} {
	m := toMap(existing)
	if len(m) == 0 {
		return map[string]interface{}{}
	}
	cleaned := deepRemove(m, []string{"language_models", "openai_compatible", "CybxAI"})
	compat := getNested(cleaned, "language_models.openai_compatible")
	if cm, ok := compat.(map[string]interface{}); ok && len(cm) == 0 {
		cleaned = deepRemove(cleaned, []string{"language_models", "openai_compatible"})
	}
	lm := getNested(cleaned, "language_models")
	if lmMap, ok := lm.(map[string]interface{}); ok && len(lmMap) == 0 {
		cleaned = deepRemove(cleaned, []string{"language_models"})
	}
	return cleaned
}

type hermesHandler struct{}

func (hermesHandler) BuildConfig(apiKey, baseURL string, models []Model, modelMap map[string]string) interface{} {
	filtered := filterModels(models, modelMap)
	defaultModel := defaultOpus
	if modelMap != nil {
		if v, ok := modelMap["model"]; ok && v != "" {
			defaultModel = v
		}
	}
	contextLen := 200000
	for _, m := range models {
		if m.ID == defaultModel && m.ContextWindow > 0 {
			contextLen = m.ContextWindow
			break
		}
	}
	ids := []interface{}{}
	for _, m := range filtered {
		ids = append(ids, m.ID)
	}
	return map[string]interface{}{
		"model": map[string]interface{}{
			"provider":       "custom",
			"default":        defaultModel,
			"base_url":       baseURL,
			"api_key":        apiKey,
			"context_length": contextLen,
		},
		"providers": map[string]interface{}{
			"cybxai": map[string]interface{}{
				"name":     "CybxAI",
				"base_url": baseURL,
				"api_key":  apiKey,
				"models":   ids,
			},
		},
	}
}

func (hermesHandler) IsBound(config interface{}) bool {
	m, ok := config.(map[string]interface{})
	if !ok {
		return false
	}
	if model, ok := m["model"].(map[string]interface{}); ok {
		if url, ok := model["base_url"].(string); ok {
			if strings.Contains(url, "127.0.0.1") || strings.Contains(url, "localhost") {
				return true
			}
		}
	}
	if providers, ok := m["providers"].(map[string]interface{}); ok {
		if _, has := providers["cybxai"]; has {
			return true
		}
	}
	if cps, ok := m["custom_providers"].([]interface{}); ok {
		for _, p := range cps {
			if pm, ok := p.(map[string]interface{}); ok {
				if name, _ := pm["name"].(string); name == "cybxai" {
					return true
				}
			}
		}
	}
	return false
}

func (hermesHandler) Merge(existing, fragment interface{}) interface{} {
	merged := deepMerge(toMap(existing), toMap(fragment))
	mergedMap := toMap(merged)
	fragMap := toMap(fragment)
	if fragProviders, ok := fragMap["providers"].(map[string]interface{}); ok {
		if cybxai, has := fragProviders["cybxai"]; has {
			providers, _ := mergedMap["providers"].(map[string]interface{})
			if providers == nil {
				providers = map[string]interface{}{}
			}
			providers["cybxai"] = cybxai
			mergedMap["providers"] = providers
		}
	}
	if cps, ok := mergedMap["custom_providers"].([]interface{}); ok {
		filtered := []interface{}{}
		for _, p := range cps {
			if pm, ok := p.(map[string]interface{}); ok {
				if name, _ := pm["name"].(string); name == "cybxai" {
					continue
				}
			}
			filtered = append(filtered, p)
		}
		if len(filtered) == 0 {
			delete(mergedMap, "custom_providers")
		} else {
			mergedMap["custom_providers"] = filtered
		}
	}
	return mergedMap
}

func (hermesHandler) Clean(existing interface{}) interface{} {
	m := toMap(existing)
	if len(m) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	if model, ok := out["model"].(map[string]interface{}); ok {
		newModel := map[string]interface{}{}
		for k, v := range model {
			if k == "base_url" || k == "api_key" || k == "context_length" {
				continue
			}
			if k == "provider" {
				if s, ok := v.(string); ok && s == "custom" {
					continue
				}
			}
			newModel[k] = v
		}
		out["model"] = newModel
	}
	if providers, ok := out["providers"].(map[string]interface{}); ok {
		filtered := map[string]interface{}{}
		for k, v := range providers {
			if k == "cybxai" {
				continue
			}
			filtered[k] = v
		}
		out["providers"] = filtered
	}
	if cps, ok := out["custom_providers"].([]interface{}); ok {
		filtered := []interface{}{}
		for _, p := range cps {
			if pm, ok := p.(map[string]interface{}); ok {
				if name, _ := pm["name"].(string); name == "cybxai" {
					continue
				}
			}
			filtered = append(filtered, p)
		}
		if len(filtered) == 0 {
			delete(out, "custom_providers")
		} else {
			out["custom_providers"] = filtered
		}
	}
	return out
}
