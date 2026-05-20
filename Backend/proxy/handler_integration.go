package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

	"kiro-go/config"
	"kiro-go/integration"
)

const integrationBaseURL = "http://127.0.0.1:8085/v1"

func (h *Handler) buildIntegrationModels() []integration.Model {
	h.modelsCacheMu.RLock()
	cached := h.cachedModels
	h.modelsCacheMu.RUnlock()
	if len(cached) == 0 {
		h.refreshModelsCache()
		h.modelsCacheMu.RLock()
		cached = h.cachedModels
		h.modelsCacheMu.RUnlock()
	}

	thinkingSuffix := config.GetThinkingConfig().Suffix
	anthropicModels := buildAnthropicModelsResponse(cached, thinkingSuffix)
	if len(anthropicModels) == 0 {
		anthropicModels = fallbackAnthropicModels(thinkingSuffix)
	}

	out := make([]integration.Model, 0, len(anthropicModels))
	seen := map[string]bool{}
	for _, m := range anthropicModels {
		idAny, _ := m["id"]
		id, _ := idAny.(string)
		if id == "" {
			continue
		}
		baseName := id
		fullID := id
		if !strings.HasPrefix(fullID, "kr/") {
			fullID = "kr/" + fullID
		}
		if seen[fullID] {
			continue
		}
		seen[fullID] = true
		out = append(out, integration.Model{
			ID:            fullID,
			Name:          baseName,
			ContextWindow: modelContextWindow(baseName),
		})
	}
	return out
}

func (h *Handler) handleCybxAIIntegrations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	apiKey := config.GetApiKey()
	tools := integration.DetectTools(apiKey, integrationBaseURL, h.buildIntegrationModels())
	writeJSON(w, http.StatusOK, tools)
}

func (h *Handler) handleCybxAIIntegrationsItem(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/integrations/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeError(w, http.StatusBadRequest, "Tool ID required")
		return
	}
	parts := strings.Split(rest, "/")
	toolID := parts[0]
	action := ""
	if len(parts) >= 2 {
		action = parts[1]
	}
	switch action {
	case "bind":
		h.handleCybxAIIntegrationBind(w, r, toolID)
	case "unbind":
		h.handleCybxAIIntegrationUnbind(w, r, toolID)
	case "config":
		h.handleCybxAIIntegrationConfig(w, r, toolID)
	case "generate":
		h.handleCybxAIIntegrationGenerate(w, r, toolID)
	default:
		writeError(w, http.StatusNotFound, "Unknown integration action")
	}
}

func (h *Handler) handleCybxAIIntegrationBind(w http.ResponseWriter, r *http.Request, toolID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		ModelMap map[string]string `json:"modelMap"`
	}
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
	}
	apiKey := config.GetApiKey()
	if err := integration.BindTool(toolID, apiKey, integrationBaseURL, h.buildIntegrationModels(), body.ModelMap); err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) handleCybxAIIntegrationUnbind(w http.ResponseWriter, r *http.Request, toolID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := integration.UnbindTool(toolID); err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) handleCybxAIIntegrationConfig(w http.ResponseWriter, r *http.Request, toolID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	cfg, exists, err := integration.ReadToolConfig(toolID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"exists": exists,
		"config": cfg,
	})
}

func (h *Handler) handleCybxAIIntegrationGenerate(w http.ResponseWriter, r *http.Request, toolID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	q := r.URL.Query()
	modelMap := map[string]string{}
	for k, v := range q {
		if len(v) > 0 && v[0] != "" {
			modelMap[k] = v[0]
		}
	}
	apiKey := config.GetApiKey()
	gen, err := integration.GenerateToolConfig(toolID, apiKey, integrationBaseURL, h.buildIntegrationModels(), modelMap)
	if err != nil {
		writeJSON(w, http.StatusOK, gen)
		return
	}
	writeJSON(w, http.StatusOK, gen)
}
