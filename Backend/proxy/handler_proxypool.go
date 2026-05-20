package proxy

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (h *Handler) handleCybxAIProxies(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		entries := GetProxies()
		if entries == nil {
			entries = []ProxyEntry{}
		}
		writeJSON(w, http.StatusOK, entries)
	case http.MethodPost:
		var body struct {
			URL   string `json:"url"`
			Label string `json:"label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		if strings.TrimSpace(body.URL) == "" {
			writeError(w, http.StatusBadRequest, "Field 'url' is required")
			return
		}
		entry, err := AddProxy(body.URL, body.Label)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, entry)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIProxiesItem(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/proxies/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeError(w, http.StatusBadRequest, "Proxy ID required")
		return
	}
	switch rest {
	case "batch":
		h.handleCybxAIProxiesBatch(w, r)
		return
	case "remove-all":
		h.handleCybxAIProxiesRemoveAll(w, r)
		return
	case "remove-dead":
		h.handleCybxAIProxiesRemoveDead(w, r)
		return
	case "check-all":
		h.handleCybxAIProxiesCheckAll(w, r)
		return
	}

	parts := strings.Split(rest, "/")
	id := parts[0]
	if id == "" {
		writeError(w, http.StatusBadRequest, "Proxy ID required")
		return
	}
	if len(parts) >= 2 && parts[1] == "check" {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		alive, ping, err := CheckProxy(id)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		out := map[string]any{"alive": alive, "pingMs": ping}
		writeJSON(w, http.StatusOK, out)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := RemoveProxy(id); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIProxiesBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	result, err := BatchAddProxies(body.Text)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleCybxAIProxiesRemoveAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	count, err := RemoveAllProxies()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"removed": count})
}

func (h *Handler) handleCybxAIProxiesRemoveDead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	count, err := RemoveDeadProxies()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"removed": count})
}

func (h *Handler) handleCybxAIProxiesCheckAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := CheckAllProxies(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	entries := GetProxies()
	if entries == nil {
		entries = []ProxyEntry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "proxies": entries})
}

func (h *Handler) handleCybxAIScraperSources(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, GetSources())
}

func (h *Handler) handleCybxAIScraperStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, GetScrapeStatus())
}

func (h *Handler) handleCybxAIScraperStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		SourceIDs   []string `json:"sourceIds"`
		Concurrency int      `json:"concurrency"`
		Options     struct {
			GeonodeCountry string `json:"geonodeCountry"`
		} `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if err := StartScrape(body.SourceIDs, body.Concurrency, ScrapeOptions{GeonodeCountry: body.Options.GeonodeCountry}); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, GetScrapeStatus())
}

func (h *Handler) handleCybxAIScraperCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	CancelScrape()
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIScraperIntegrate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		ProxyURLs []string `json:"proxyUrls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	result, err := IntegrateResults(body.ProxyURLs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
