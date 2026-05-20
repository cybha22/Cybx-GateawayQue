package proxy

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"kiro-go/auth"
	"kiro-go/config"
	"kiro-go/contentfilter"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	ProviderKiro     = "kiro"
	DefaultPageLimit = 20
	MaxPageLimit     = 100
)

func (h *Handler) RegisterCybxAIRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/connections", h.handleCybxAIConnections)
	mux.HandleFunc("/api/connections/", h.handleCybxAIConnectionsItem)
	mux.HandleFunc("/api/connections/labels", h.handleCybxAIConnectionLabels)
	mux.HandleFunc("/api/connections/credit-summary", h.handleCybxAICreditSummary)
	mux.HandleFunc("/api/connections/bulk-refresh-tokens", h.handleCybxAIBulkRefreshTokens)
	mux.HandleFunc("/api/connections/check-credits", h.handleCybxAICheckCredits)
	mux.HandleFunc("/api/connections/remove-exhausted", h.handleCybxAIRemoveExhausted)
	mux.HandleFunc("/api/connections/remove-expired", h.handleCybxAIRemoveExpired)
	mux.HandleFunc("/api/connections/remove-banned", h.handleCybxAIRemoveBanned)
	mux.HandleFunc("/api/connections/remove-baned", h.handleCybxAIRemoveBanned)
	mux.HandleFunc("/api/dashboard", h.handleCybxAIDashboardStats)
	mux.HandleFunc("/api/kiro/connections", h.handleCybxAIKiroConnections)
	mux.HandleFunc("/api/kiro/auth/credentials", h.handleCybxAIKiroAuthCredentials)
	mux.HandleFunc("/api/kiro/add-refresh-token", h.handleCybxAIKiroAddRefreshToken)
	mux.HandleFunc("/api/kiro/check-credit", h.handleCybxAIKiroCheckCredit)
	mux.HandleFunc("/api/kiro/auth/builderid/start", h.handleCybxAIBuilderIdStart)
	mux.HandleFunc("/api/kiro/auth/builderid/poll", h.handleCybxAIBuilderIdPoll)
	mux.HandleFunc("/api/kiro/auth/iam-sso/start", h.handleCybxAIIamSsoStart)
	mux.HandleFunc("/api/kiro/auth/iam-sso/complete", h.handleCybxAIIamSsoComplete)
	mux.HandleFunc("/api/kiro/auth/web-token", h.handleCybxAIWebToken)
	mux.HandleFunc("/api/models", h.handleCybxAIModels)
	mux.HandleFunc("/api/models/custom", h.handleCybxAIModelsCustom)
	mux.HandleFunc("/api/keys", h.handleCybxAIApiKeys)
	mux.HandleFunc("/api/proxy-settings", h.handleCybxAIProxySettings)
	mux.HandleFunc("/api/proxies", h.handleCybxAIProxies)
	mux.HandleFunc("/api/proxies/", h.handleCybxAIProxiesItem)
	mux.HandleFunc("/api/proxies/batch", h.handleCybxAIProxiesBatch)
	mux.HandleFunc("/api/proxies/remove-all", h.handleCybxAIProxiesRemoveAll)
	mux.HandleFunc("/api/proxies/remove-dead", h.handleCybxAIProxiesRemoveDead)
	mux.HandleFunc("/api/proxies/check-all", h.handleCybxAIProxiesCheckAll)
	mux.HandleFunc("/api/scraper/sources", h.handleCybxAIScraperSources)
	mux.HandleFunc("/api/scraper/status", h.handleCybxAIScraperStatus)
	mux.HandleFunc("/api/scraper/start", h.handleCybxAIScraperStart)
	mux.HandleFunc("/api/scraper/cancel", h.handleCybxAIScraperCancel)
	mux.HandleFunc("/api/scraper/integrate", h.handleCybxAIScraperIntegrate)
	mux.HandleFunc("/api/auth/status", h.handleCybxAIAuthStatus)
	mux.HandleFunc("/api/auth/login", h.handleCybxAIAuthLogin)
	mux.HandleFunc("/api/auth/logout", h.handleCybxAIAuthLogout)
	mux.HandleFunc("/api/auth/set-password", h.handleCybxAISetPassword)
	mux.HandleFunc("/api/auth/remove-password", h.handleCybxAIRemovePassword)
	mux.HandleFunc("/api/auth/toggle", h.handleCybxAIAuthToggle)
	mux.HandleFunc("/api/auth/session-timeout", h.handleCybxAISessionTimeout)
	mux.HandleFunc("/api/auth/sessions", h.handleCybxAISessions)
	mux.HandleFunc("/api/auth/sessions/clear", h.handleCybxAISessionsClear)
	mux.HandleFunc("/api/routing-settings", h.handleCybxAIRoutingSettings)
	mux.HandleFunc("/api/usage/records", h.handleCybxAIUsageRecords)
	mux.HandleFunc("/api/usage/stats", h.handleCybxAIUsageStats)
	mux.HandleFunc("/api/usage/chart", h.handleCybxAIUsageChart)
	mux.HandleFunc("/api/filters", h.handleCybxAIFilters)
	mux.HandleFunc("/api/filters/toggle", h.handleCybxAIFiltersToggle)
	mux.HandleFunc("/api/filters/provider", h.handleCybxAIFiltersProvider)
	mux.HandleFunc("/api/filters/rules", h.handleCybxAIFiltersRules)
	mux.HandleFunc("/api/filters/rules/", h.handleCybxAIFiltersRuleItem)
	mux.HandleFunc("/api/filters/rule", h.handleCybxAIFiltersRule)
	mux.HandleFunc("/api/filters/reload", h.handleCybxAIFiltersReload)
	mux.HandleFunc("/api/export", h.handleCybxAIExport)
	mux.HandleFunc("/api/import", h.handleCybxAIImport)
	mux.HandleFunc("/api/batch-connect", h.handleCybxAIBatchConnect)
	mux.HandleFunc("/api/batch-connect/", h.handleCybxAIBatchConnectItem)
	mux.HandleFunc("/api/system", h.handleCybxAISystem)
	mux.HandleFunc("/api/chat/completions", h.handleCybxAIChatCompletions)
	mux.HandleFunc("/api/integrations", h.handleCybxAIIntegrations)
	mux.HandleFunc("/api/integrations/", h.handleCybxAIIntegrationsItem)
	mux.HandleFunc("/api/tunnel", h.handleCybxAITunnel)
	mux.HandleFunc("/api/tunnel/start", h.handleCybxAITunnelStart)
	mux.HandleFunc("/api/tunnel/stop", h.handleCybxAITunnelStop)
	mux.HandleFunc("/api/tunnel/config", h.handleCybxAITunnelConfig)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func accountToConnection(a config.Account) map[string]interface{} {
	now := time.Now().Unix()
	status := "active"
	switch {
	case a.BanStatus == "BANNED":
		status = "suspended"
	case a.BanStatus == "SUSPENDED":
		status = "suspended"
	case a.ExpiresAt > 0 && now > a.ExpiresAt:
		status = "expired"
	case !a.Enabled:
		if a.UsageLimit > 0 && a.UsageCurrent >= a.UsageLimit && !a.AllowOverage {
			status = "exhausted"
		} else {
			status = "disabled"
		}
	case a.UsageLimit > 0 && a.UsageCurrent >= a.UsageLimit && !a.AllowOverage:
		status = "exhausted"
	}

	label := a.Nickname
	if label == "" {
		label = a.Email
	}

	credit := map[string]interface{}{
		"totalCredits":     a.UsageLimit,
		"usedCredits":      a.UsageCurrent,
		"remainingCredits": maxFloat(a.UsageLimit-a.UsageCurrent, 0),
		"usagePercent":     a.UsagePercent,
		"packageName":      a.SubscriptionTitle,
		"nextResetDate":    a.NextResetDate,
	}

	subscription := map[string]interface{}{
		"type":          a.SubscriptionType,
		"title":         a.SubscriptionTitle,
		"daysRemaining": a.DaysRemaining,
	}

	stats := map[string]interface{}{
		"requestCount": a.RequestCount,
		"errorCount":   a.ErrorCount,
		"totalTokens":  a.TotalTokens,
		"totalCredits": a.TotalCredits,
		"lastUsed":     a.LastUsed,
	}

	lastUsedISO := ""
	if a.LastUsed > 0 {
		lastUsedISO = time.Unix(a.LastUsed, 0).UTC().Format(time.RFC3339)
	}

	return map[string]interface{}{
		"id":                a.ID,
		"email":             a.Email,
		"label":             label,
		"nickname":          a.Nickname,
		"provider":          ProviderKiro,
		"loginProvider":     a.Provider,
		"authMethod":        a.AuthMethod,
		"region":            a.Region,
		"subscriptionType":  a.SubscriptionType,
		"subscriptionTitle": a.SubscriptionTitle,
		"subscription":      subscription,
		"status":            status,
		"enabled":           a.Enabled,
		"tokenValid":        a.AccessToken != "" && (a.ExpiresAt == 0 || a.ExpiresAt > now),
		"lastChecked":       lastUsedISO,
		"usageCurrent":      a.UsageCurrent,
		"usageLimit":        a.UsageLimit,
		"usagePercent":      a.UsagePercent,
		"daysRemaining":     a.DaysRemaining,
		"lastUsed":          a.LastUsed,
		"lastUsedAt":        lastUsedISO,
		"requestCount":      a.RequestCount,
		"usageCount":        a.RequestCount,
		"errorCount":        a.ErrorCount,
		"failCount":         a.ErrorCount,
		"totalTokens":       a.TotalTokens,
		"totalCredits":      a.TotalCredits,
		"weight":            a.Weight,
		"allowOverage":      a.AllowOverage,
		"overageWeight":     a.OverageWeight,
		"banStatus":         a.BanStatus,
		"banReason":         a.BanReason,
		"banTime":           a.BanTime,
		"credit":            credit,
		"stats":             stats,
		"profileArn":        a.ProfileArn,
		"uid":               a.ProfileArn,
	}
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func filterConnections(items []map[string]interface{}, search, status, pro string) []map[string]interface{} {
	if search == "" && status == "" && pro == "" {
		return items
	}
	searchLower := strings.ToLower(search)
	out := make([]map[string]interface{}, 0, len(items))
	for _, it := range items {
		if search != "" {
			email := strings.ToLower(fmt.Sprint(it["email"]))
			label := strings.ToLower(fmt.Sprint(it["label"]))
			id := strings.ToLower(fmt.Sprint(it["id"]))
			if !strings.Contains(email, searchLower) && !strings.Contains(label, searchLower) && !strings.Contains(id, searchLower) {
				continue
			}
		}
		if status != "" {
			if !strings.EqualFold(fmt.Sprint(it["status"]), status) {
				continue
			}
		}
		if pro != "" {
			subTitle := strings.ToLower(fmt.Sprint(it["subscriptionTitle"]))
			subType := strings.ToLower(fmt.Sprint(it["subscriptionType"]))
			match := strings.Contains(subTitle, strings.ToLower(pro)) || strings.Contains(subType, strings.ToLower(pro))
			if !match {
				continue
			}
		}
		out = append(out, it)
	}
	return out
}

func mapPaginated(items []map[string]interface{}, page, limit int) map[string]interface{} {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > MaxPageLimit {
		limit = DefaultPageLimit
	}

	total := len(items)
	start := (page - 1) * limit
	end := start + limit

	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	var data []map[string]interface{}
	if start < total {
		data = items[start:end]
	} else {
		data = []map[string]interface{}{}
	}

	totalPages := (total + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	return map[string]interface{}{
		"data": data,
		"pagination": map[string]interface{}{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": totalPages,
		},
	}
}

func (h *Handler) handleCybxAIConnections(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	page := 1
	limit := DefaultPageLimit
	q := r.URL.Query()

	if pageStr := q.Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	provider := strings.ToLower(strings.TrimSpace(q.Get("provider")))
	search := strings.TrimSpace(q.Get("search"))
	status := strings.TrimSpace(q.Get("status"))
	pro := strings.TrimSpace(q.Get("pro"))

	accounts := config.GetAccounts()
	connections := make([]map[string]interface{}, 0, len(accounts))
	for _, a := range accounts {
		if provider != "" && provider != ProviderKiro {
			continue
		}
		connections = append(connections, accountToConnection(a))
	}

	filtered := filterConnections(connections, search, status, pro)
	result := mapPaginated(filtered, page, limit)
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleCybxAIConnectionsItem(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	parts := strings.Split(strings.Trim(strings.TrimPrefix(path, "/api/connections/"), "/"), "/")

	if len(parts) < 1 || parts[0] == "" {
		writeError(w, http.StatusBadRequest, "Invalid path")
		return
	}

	if parts[0] == "provider" {
		if len(parts) < 2 {
			writeError(w, http.StatusBadRequest, "Provider name required")
			return
		}
		provider := parts[1]
		action := ""
		if len(parts) > 2 {
			action = parts[2]
		}
		h.handleCybxAIProviderBulk(w, r, provider, action)
		return
	}

	id := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch r.Method {
	case "DELETE":
		h.deleteConnection(w, id)
	case "POST":
		h.handleConnectionAction(w, id, action)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIProviderBulk(w http.ResponseWriter, r *http.Request, provider, action string) {
	if !strings.EqualFold(provider, ProviderKiro) {
		writeJSON(w, http.StatusOK, map[string]int{"removed": 0, "enabled": 0, "disabled": 0})
		return
	}

	accounts := config.GetAccounts()

	switch action {
	case "":
		if r.Method != "DELETE" {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		removed := 0
		for _, a := range accounts {
			if err := config.DeleteAccount(a.ID); err == nil {
				removed++
			}
		}
		h.pool.Reload()
		writeJSON(w, http.StatusOK, map[string]int{"removed": removed})
	case "enable":
		if r.Method != "POST" {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		count := 0
		for _, a := range accounts {
			if !a.Enabled {
				a.Enabled = true
				if a.BanStatus != "" && a.BanStatus != "ACTIVE" {
					a.BanStatus = "ACTIVE"
					a.BanReason = ""
					a.BanTime = 0
				}
				if err := config.UpdateAccount(a.ID, a); err == nil {
					count++
				}
			}
		}
		h.pool.Reload()
		writeJSON(w, http.StatusOK, map[string]int{"enabled": count})
	case "disable":
		if r.Method != "POST" {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		count := 0
		for _, a := range accounts {
			if a.Enabled {
				a.Enabled = false
				if err := config.UpdateAccount(a.ID, a); err == nil {
					count++
				}
			}
		}
		h.pool.Reload()
		writeJSON(w, http.StatusOK, map[string]int{"disabled": count})
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Unknown provider action: %s", action))
	}
}

func (h *Handler) deleteConnection(w http.ResponseWriter, id string) {
	accounts := config.GetAccounts()
	var found bool
	var filtered []config.Account

	for _, a := range accounts {
		if a.ID != id {
			filtered = append(filtered, a)
		} else {
			found = true
		}
	}

	if !found {
		writeError(w, http.StatusNotFound, "Connection not found")
		return
	}

	cfg := config.Get()
	cfg.Accounts = filtered
	if err := config.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save config: %v", err))
		return
	}

	h.pool.Reload()
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleConnectionAction(w http.ResponseWriter, id, action string) {
	accounts := config.GetAccounts()
	var account *config.Account

	for i := range accounts {
		if accounts[i].ID == id {
			account = &accounts[i]
			break
		}
	}

	if account == nil {
		writeError(w, http.StatusNotFound, "Connection not found")
		return
	}

	switch action {
	case "enable":
		account.Enabled = true
		if account.BanStatus != "" && account.BanStatus != "ACTIVE" {
			account.BanStatus = "ACTIVE"
			account.BanReason = ""
			account.BanTime = 0
		}
	case "disable":
		account.Enabled = false
	case "check":
		valid := true
		if account.RefreshToken != "" {
			if newAccess, newRefresh, newExpires, profileArn, err := auth.RefreshToken(account); err == nil {
				account.AccessToken = newAccess
				if newRefresh != "" {
					account.RefreshToken = newRefresh
				}
				account.ExpiresAt = newExpires
				config.UpdateAccountToken(id, newAccess, newRefresh, newExpires)
				if profileArn != "" {
					account.ProfileArn = profileArn
					config.UpdateAccountProfileArn(id, profileArn)
				}
				h.pool.UpdateToken(id, newAccess, newRefresh, newExpires)
			} else {
				valid = false
			}
		} else if account.AccessToken == "" {
			valid = false
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":          account.ID,
			"valid":       valid,
			"status":      "ok",
			"lastChecked": time.Now().UTC().Format(time.RFC3339),
		})
		return
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Unknown action: %s", action))
		return
	}

	if err := config.UpdateAccount(id, *account); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to update account: %v", err))
		return
	}

	h.pool.Reload()
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIConnectionLabels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	labelMap := make(map[string]bool)

	for _, a := range accounts {
		if a.Email != "" {
			labelMap[a.Email] = true
		}
	}

	var labels []map[string]interface{}
	for label := range labelMap {
		labels = append(labels, map[string]interface{}{
			"provider": ProviderKiro,
			"label":    label,
		})
	}

	writeJSON(w, http.StatusOK, labels)
}

func (h *Handler) handleCybxAICreditSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	now := time.Now().Unix()

	var totalUsage, totalLimit float64
	var totalConnections, activeConnections, totalExhausted, totalExpired, totalBanned int

	for _, a := range accounts {
		totalConnections++
		totalUsage += a.UsageCurrent
		totalLimit += a.UsageLimit

		expired := a.ExpiresAt > 0 && now > a.ExpiresAt
		banned := a.BanStatus == "BANNED" || a.BanStatus == "SUSPENDED"
		exhausted := a.UsageLimit > 0 && a.UsageCurrent >= a.UsageLimit && !a.AllowOverage

		if banned {
			totalBanned++
		}
		if expired {
			totalExpired++
		}
		if exhausted {
			totalExhausted++
		}
		if a.Enabled && !banned && !expired && !exhausted {
			activeConnections++
		}
	}

	providerSummary := map[string]interface{}{
		"total":     totalLimit,
		"used":      totalUsage,
		"remaining": maxFloat(totalLimit-totalUsage, 0),
		"count":     totalConnections,
		"active":    activeConnections,
		"exhausted": totalExhausted,
		"expired":   totalExpired,
		"banned":    totalBanned,
	}

	result := map[string]interface{}{
		"totalConnections":  totalConnections,
		"activeConnections": activeConnections,
		"totalExhausted":    totalExhausted,
		"totalExpired":      totalExpired,
		"totalBanned":       totalBanned,
		"totalUsage":        totalUsage,
		"totalLimit":        totalLimit,
		"timestamp":         time.Now().Unix(),
		"byProvider": map[string]interface{}{
			ProviderKiro: providerSummary,
		},
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleCybxAIBulkRefreshTokens(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Provider string   `json:"provider"`
		IDs      []string `json:"ids"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider != "" && provider != ProviderKiro {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"provider": provider,
			"checked":  0, "valid": 0, "refreshed": 0,
			"expired": 0, "suspended": 0, "failed": 0,
			"results": []any{},
		})
		return
	}

	accounts := config.GetAccounts()
	idSet := map[string]bool{}
	for _, id := range req.IDs {
		idSet[id] = true
	}

	checked := 0
	valid := 0
	refreshed := 0
	expired := 0
	suspended := 0
	failed := 0
	results := make([]map[string]interface{}, 0, len(accounts))

	for i := range accounts {
		a := &accounts[i]
		if len(req.IDs) > 0 && !idSet[a.ID] {
			continue
		}
		checked++
		entry := map[string]interface{}{
			"id":       a.ID,
			"label":    fallbackLabel(a),
			"provider": ProviderKiro,
		}

		if a.BanStatus == "BANNED" || a.BanStatus == "SUSPENDED" {
			suspended++
			entry["valid"] = false
			entry["suspended"] = true
			entry["reason"] = a.BanReason
			results = append(results, entry)
			continue
		}

		if a.RefreshToken == "" {
			failed++
			entry["valid"] = false
			entry["reason"] = "no refresh token"
			results = append(results, entry)
			continue
		}

		newAccess, newRefresh, newExpires, profileArn, err := auth.RefreshToken(a)
		if err != nil {
			failed++
			entry["valid"] = false
			entry["expired"] = true
			entry["reason"] = err.Error()
			expired++
			results = append(results, entry)
			continue
		}

		a.AccessToken = newAccess
		if newRefresh != "" {
			a.RefreshToken = newRefresh
		}
		a.ExpiresAt = newExpires
		config.UpdateAccountToken(a.ID, newAccess, newRefresh, newExpires)
		if profileArn != "" {
			a.ProfileArn = profileArn
			config.UpdateAccountProfileArn(a.ID, profileArn)
		}
		h.pool.UpdateToken(a.ID, newAccess, newRefresh, newExpires)

		valid++
		refreshed++
		entry["valid"] = true
		entry["refreshed"] = true
		if info, infoErr := RefreshAccountInfo(a); infoErr == nil {
			config.UpdateAccountInfo(a.ID, *info)
			entry["credit"] = map[string]interface{}{
				"totalCredits":     info.UsageLimit,
				"usedCredits":      info.UsageCurrent,
				"remainingCredits": maxFloat(info.UsageLimit-info.UsageCurrent, 0),
				"usagePercent":     info.UsagePercent,
				"packageName":      info.SubscriptionTitle,
			}
		}
		results = append(results, entry)
	}

	h.pool.Reload()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"provider":  ProviderKiro,
		"checked":   checked,
		"valid":     valid,
		"refreshed": refreshed,
		"expired":   expired,
		"suspended": suspended,
		"failed":    failed,
		"results":   results,
	})
}

func fallbackLabel(a *config.Account) string {
	if a.Nickname != "" {
		return a.Nickname
	}
	if a.Email != "" {
		return a.Email
	}
	return a.ID
}

func (h *Handler) handleCybxAIRemoveExhausted(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	removedCount := 0
	keep := make([]config.Account, 0, len(accounts))
	for _, a := range accounts {
		if a.UsageLimit > 0 && a.UsageCurrent >= a.UsageLimit && !a.AllowOverage {
			removedCount++
			continue
		}
		keep = append(keep, a)
	}

	if removedCount > 0 {
		cfg := config.Get()
		cfg.Accounts = keep
		if err := config.Save(); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save config: %v", err))
			return
		}
		h.pool.Reload()
	}

	writeJSON(w, http.StatusOK, map[string]int{"removed": removedCount})
}

func (h *Handler) handleCybxAIRemoveExpired(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	now := time.Now().Unix()
	removedCount := 0
	keep := make([]config.Account, 0, len(accounts))
	for _, a := range accounts {
		if a.ExpiresAt > 0 && now > a.ExpiresAt {
			removedCount++
			continue
		}
		keep = append(keep, a)
	}

	if removedCount > 0 {
		cfg := config.Get()
		cfg.Accounts = keep
		if err := config.Save(); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save config: %v", err))
			return
		}
		h.pool.Reload()
	}

	writeJSON(w, http.StatusOK, map[string]int{"removed": removedCount})
}

func (h *Handler) handleCybxAIRemoveBanned(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	removedCount := 0
	keep := make([]config.Account, 0, len(accounts))
	for _, a := range accounts {
		if a.BanStatus == "BANNED" || a.BanStatus == "SUSPENDED" {
			removedCount++
			continue
		}
		keep = append(keep, a)
	}

	if removedCount > 0 {
		cfg := config.Get()
		cfg.Accounts = keep
		if err := config.Save(); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to save config: %v", err))
			return
		}
		h.pool.Reload()
	}

	writeJSON(w, http.StatusOK, map[string]int{"removed": removedCount})
}

func (h *Handler) handleCybxAICheckCredits(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	checked := 0
	failed := 0
	for i := range accounts {
		a := &accounts[i]
		if !a.Enabled {
			continue
		}
		info, err := RefreshAccountInfo(a)
		if err != nil {
			failed++
			continue
		}
		config.UpdateAccountInfo(a.ID, *info)
		checked++
	}
	h.pool.Reload()

	writeJSON(w, http.StatusOK, map[string]int{
		"checked": checked,
		"failed":  failed,
	})
}

func (h *Handler) handleCybxAIDashboardStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	accounts := config.GetAccounts()
	now := time.Now().Unix()

	var totalUsage, totalLimit float64
	var activeCount, disabledCount, bannedCount, expiredCount, exhaustedCount int

	for _, a := range accounts {
		totalUsage += a.UsageCurrent
		totalLimit += a.UsageLimit

		expired := a.ExpiresAt > 0 && now > a.ExpiresAt
		banned := a.BanStatus == "BANNED" || a.BanStatus == "SUSPENDED"
		exhausted := a.UsageLimit > 0 && a.UsageCurrent >= a.UsageLimit && !a.AllowOverage

		switch {
		case banned:
			bannedCount++
		case expired:
			expiredCount++
		case !a.Enabled:
			disabledCount++
		case exhausted:
			exhaustedCount++
		default:
			activeCount++
		}
	}

	usageRecordsMu.Lock()
	byModelMap := map[string]map[string]any{}
	byAccountMap := map[string]map[string]any{}
	totalRequestsBuf := 0
	successRequestsBuf := 0
	failedRequestsBuf := 0
	totalTokensBuf := 0
	totalPromptBuf := 0
	totalCompletionBuf := 0
	totalCostBuf := 0.0
	totalLatency := int64(0)
	for _, rec := range usageBuffer {
		totalRequestsBuf++
		totalTokensBuf += rec.TotalTokens
		totalPromptBuf += rec.PromptTokens
		totalCompletionBuf += rec.CompletionTokens
		totalCostBuf += rec.Cost
		totalLatency += rec.LatencyMs
		if rec.Success {
			successRequestsBuf++
		} else {
			failedRequestsBuf++
		}

		mKey := rec.Model
		if mKey == "" {
			mKey = "unknown"
		}
		me, ok := byModelMap[mKey]
		if !ok {
			me = map[string]any{
				"model":            mKey,
				"requests":         0,
				"totalTokens":      0,
				"promptTokens":     0,
				"completionTokens": 0,
				"cost":             0.0,
			}
		}
		me["requests"] = me["requests"].(int) + 1
		me["totalTokens"] = me["totalTokens"].(int) + rec.TotalTokens
		me["promptTokens"] = me["promptTokens"].(int) + rec.PromptTokens
		me["completionTokens"] = me["completionTokens"].(int) + rec.CompletionTokens
		me["cost"] = me["cost"].(float64) + rec.Cost
		byModelMap[mKey] = me

		if rec.AccountID == "" {
			continue
		}
		ae, ok := byAccountMap[rec.AccountID]
		if !ok {
			ae = map[string]any{
				"accountId":        rec.AccountID,
				"accountLabel":     rec.AccountLabel,
				"label":            rec.AccountLabel,
				"email":            rec.AccountLabel,
				"requests":         0,
				"promptTokens":     0,
				"completionTokens": 0,
				"totalTokens":      0,
				"cost":             0.0,
				"lastUsed":         int64(0),
			}
		}
		ae["requests"] = ae["requests"].(int) + 1
		ae["promptTokens"] = ae["promptTokens"].(int) + rec.PromptTokens
		ae["completionTokens"] = ae["completionTokens"].(int) + rec.CompletionTokens
		ae["totalTokens"] = ae["totalTokens"].(int) + rec.TotalTokens
		ae["cost"] = ae["cost"].(float64) + rec.Cost
		if ts := rec.Timestamp; ts > ae["lastUsed"].(int64) {
			ae["lastUsed"] = ts
		}
		byAccountMap[rec.AccountID] = ae
	}
	usageRecordsMu.Unlock()

	for _, a := range accounts {
		if _, ok := byAccountMap[a.ID]; !ok {
			label := a.Email
			if label == "" {
				label = a.Nickname
			}
			byAccountMap[a.ID] = map[string]any{
				"accountId":        a.ID,
				"accountLabel":     label,
				"label":            label,
				"email":            a.Email,
				"requests":         a.RequestCount,
				"promptTokens":     0,
				"completionTokens": 0,
				"totalTokens":      a.TotalTokens,
				"cost":             a.TotalCredits,
				"lastUsed":         a.LastUsed * 1000,
			}
		}
	}

	totalRequestsServer := h.totalRequests
	if totalRequestsBuf > int(totalRequestsServer) {
		totalRequestsServer = int64(totalRequestsBuf)
	}
	successRequests := h.successRequests
	if int64(successRequestsBuf) > 0 {
		successRequests = int64(successRequestsBuf)
	}
	failedRequests := h.failedRequests
	if int64(failedRequestsBuf) > 0 {
		failedRequests = int64(failedRequestsBuf)
	}
	totalTokensServer := h.totalTokens
	if int64(totalTokensBuf) > 0 {
		totalTokensServer = int64(totalTokensBuf)
	}
	successRate := 0.0
	if totalRequestsServer > 0 {
		successRate = float64(successRequests) / float64(totalRequestsServer) * 100.0
	}
	avgLatency := int64(0)
	if totalRequestsBuf > 0 {
		avgLatency = totalLatency / int64(totalRequestsBuf)
	}
	totalCost := totalCostBuf
	if totalCost == 0 {
		for _, a := range accounts {
			totalCost += a.TotalCredits
		}
	}

	usagePercent := 0.0
	if totalLimit > 0 {
		usagePercent = totalUsage / totalLimit
	}

	startedAtMs := h.startTime * 1000
	uptimeSec := now - h.startTime

	result := map[string]interface{}{
		"totalAccounts":   len(accounts),
		"activeAccounts":  activeCount,
		"totalModels":     len(byModelMap),
		"totalRequests":   totalRequestsServer,
		"successRequests": successRequests,
		"failedRequests":  failedRequests,
		"totalTokens":     totalTokensServer,
		"totalCost":       totalCost,
		"uptime":          uptimeSec,
		"successRate":     successRate,
		"usage": map[string]interface{}{
			"total":                 totalUsage,
			"limit":                 totalLimit,
			"percent":               usagePercent,
			"totalRequests":         totalRequestsServer,
			"successRequests":       successRequests,
			"failedRequests":        failedRequests,
			"totalTokens":           totalTokensServer,
			"totalPromptTokens":     totalPromptBuf,
			"totalCompletionTokens": totalCompletionBuf,
			"totalCost":             totalCost,
			"successRate":           successRate,
			"avgLatencyMs":          avgLatency,
		},
		"accounts": map[string]interface{}{
			"total":     len(accounts),
			"active":    activeCount,
			"disabled":  disabledCount,
			"banned":    bannedCount,
			"expired":   expiredCount,
			"exhausted": exhaustedCount,
		},
		"byModel":   byModelMap,
		"byAccount": byAccountMap,
		"server": map[string]interface{}{
			"totalRequests":   totalRequestsServer,
			"successRequests": successRequests,
			"failedRequests":  failedRequests,
			"totalTokens":     totalTokensServer,
			"uptime":          uptimeSec,
			"uptimeMs":        uptimeSec * 1000,
			"startedAt":       startedAtMs,
		},
		"timestamp": now,
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleCybxAIKiroAuthCredentials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiImportCredentials(w, r)
}

func (h *Handler) handleCybxAIKiroAddRefreshToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiImportCredentials(w, r)
}

func (h *Handler) handleCybxAIKiroCheckCredit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		ConnectionID string `json:"connectionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.ConnectionID == "" {
		writeError(w, http.StatusBadRequest, "Field 'connectionId' is required")
		return
	}
	r2 := r.Clone(r.Context())
	r2.URL.Path = "/admin/api/accounts/" + body.ConnectionID + "/refresh"
	h.apiRefreshAccount(w, r2, body.ConnectionID)
}

func (h *Handler) handleCybxAIBuilderIdStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiStartBuilderIdLogin(w, r)
}

func (h *Handler) handleCybxAIBuilderIdPoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiPollBuilderIdAuth(w, r)
}

func (h *Handler) handleCybxAIIamSsoStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiStartIamSso(w, r)
}

func (h *Handler) handleCybxAIIamSsoComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiCompleteIamSso(w, r)
}

func (h *Handler) handleCybxAIWebToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiImportSsoToken(w, r)
}

func (h *Handler) handleCybxAIModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

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

	custom := loadCustomModels()
	seen := make(map[string]bool)
	out := make([]map[string]interface{}, 0, len(anthropicModels)+len(custom))

	for _, m := range anthropicModels {
		idAny, _ := m["id"]
		id, _ := idAny.(string)
		if id == "" {
			continue
		}
		seen[id] = true
		name := id
		if !strings.HasPrefix(id, "kr/") {
			id = "kr/" + id
		}
		out = append(out, map[string]interface{}{
			"id":            id,
			"name":          name,
			"provider":      ProviderKiro,
			"upstreamModel": name,
			"contextWindow": modelContextWindow(name),
			"custom":        false,
		})
	}

	for _, c := range custom {
		if seen[c.ID] {
			continue
		}
		entry := map[string]interface{}{
			"id":            c.ID,
			"name":          c.Name,
			"provider":      c.Provider,
			"upstreamModel": c.UpstreamModel,
			"contextWindow": c.ContextWindow,
			"custom":        true,
		}
		if c.AccountTier != "" {
			entry["accountTier"] = c.AccountTier
		}
		out = append(out, entry)
	}

	writeJSON(w, http.StatusOK, out)
}

func modelContextWindow(id string) int {
	lower := strings.ToLower(id)
	lower = strings.TrimSuffix(lower, "-thinking")
	lower = strings.TrimPrefix(lower, "kr/")

	switch lower {
	case "auto", "auto-thinking":
		return 1000000
	case "claude-opus-4.7", "claude-opus-4.6", "claude-sonnet-4.6":
		return 1000000
	case "claude-opus-4.5", "claude-sonnet-4.5", "claude-sonnet-4", "claude-haiku-4.5":
		return 200000
	case "deepseek-3.2":
		return 164000
	case "minimax-m2.5", "minimax-m2.1":
		return 196000
	case "glm-5":
		return 200000
	case "qwen3-coder-next":
		return 256000
	}

	if strings.Contains(lower, "opus") || strings.Contains(lower, "sonnet") || strings.Contains(lower, "haiku") {
		return 200000
	}
	if strings.Contains(lower, "deepseek") {
		return 164000
	}
	if strings.Contains(lower, "qwen") {
		return 256000
	}
	if strings.Contains(lower, "glm") {
		return 200000
	}
	if strings.Contains(lower, "minimax") {
		return 196000
	}
	return 128000
}

func (h *Handler) handleCybxAIApiKeys(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		apiKey := config.GetApiKey()
		requireApiKey := config.IsApiKeyRequired()
		masked := ""
		if apiKey != "" {
			if len(apiKey) > 12 {
				masked = apiKey[:6] + "..." + apiKey[len(apiKey)-4:]
			} else {
				masked = "****"
			}
		}
		writeJSON(w, http.StatusOK, []map[string]any{{
			"id":        "primary",
			"key":       apiKey,
			"masked":    masked,
			"name":      "Primary API Key",
			"createdAt": time.Now().UTC().Format(time.RFC3339),
			"enabled":   requireApiKey,
		}})
	case http.MethodPost:
		var body struct {
			Key string `json:"key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		newKey := body.Key
		if newKey == "" {
			newKey = generateApiKey()
		}
		if err := config.UpdateSettings(newKey, true, ""); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "key": newKey})
	case http.MethodDelete:
		if err := config.UpdateSettings("", false, ""); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIProxySettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		settings := LoadProxySettings()
		proxyURL := settings.ProxyURL
		if proxyURL == "" {
			proxyURL = config.GetProxyURL()
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"proxyURL":         proxyURL,
			"applyTo":          settings.ApplyTo,
			"autoTest":         settings.AutoTest,
			"autoDeleteFailed": settings.AutoDeleteFailed,
		})
	case http.MethodPost:
		var body struct {
			ProxyURL         *string         `json:"proxyURL,omitempty"`
			ApplyTo          map[string]bool `json:"applyTo,omitempty"`
			AutoTest         *ProxyAutoTest  `json:"autoTest,omitempty"`
			AutoDeleteFailed *bool           `json:"autoDeleteFailed,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		update := ProxySettingsUpdate{
			ProxyURL:         body.ProxyURL,
			ApplyTo:          body.ApplyTo,
			AutoTest:         body.AutoTest,
			AutoDeleteFailed: body.AutoDeleteFailed,
		}
		saved, err := SaveProxySettings(update)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if body.ProxyURL != nil {
			if err := config.UpdateProxySettings(*body.ProxyURL); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			applyProxyConfig(*body.ProxyURL)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success":          true,
			"proxyURL":         saved.ProxyURL,
			"applyTo":          saved.ApplyTo,
			"autoTest":         saved.AutoTest,
			"autoDeleteFailed": saved.AutoDeleteFailed,
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	hasPassword := config.GetPassword() != ""
	authenticated := isAdminAuthenticated(r) || !hasPassword || isLocalRequest(r)
	settings := loadCybxAISettings()
	authEnabled := hasPassword && settings.AuthEnabled
	if !hasPassword {
		authEnabled = false
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated":       authenticated,
		"authEnabled":         authEnabled,
		"hasPassword":         hasPassword,
		"isLocal":             isLocalRequest(r),
		"enabled":             authEnabled,
		"sessionTimeoutHours": settings.SessionTimeoutHours,
		"activeSessions":      len(settings.Sessions),
	})
}

func (h *Handler) handleCybxAIAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.Password != config.GetPassword() {
		writeError(w, http.StatusUnauthorized, "Invalid password")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "admin_password",
		Value:    body.Password,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   86400 * 7,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:   "admin_password",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIRoutingSettings(w http.ResponseWriter, r *http.Request) {
	settings := loadCybxAISettings()
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]bool{"roundRobinEnabled": settings.RoundRobinEnabled})
	case http.MethodPost:
		var body struct {
			RoundRobinEnabled *bool `json:"roundRobinEnabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		if body.RoundRobinEnabled != nil {
			settings.RoundRobinEnabled = *body.RoundRobinEnabled
			saveCybxAISettings(settings)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"roundRobinEnabled": settings.RoundRobinEnabled,
			"success":           true,
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIUsageRecords(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := r.URL.Query()
		limit := 0
		if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
			limit = l
		}
		model := q.Get("model")
		accountId := q.Get("accountId")
		records := getUsageRecords(limit, model, accountId)
		writeJSON(w, http.StatusOK, records)
	case http.MethodDelete:
		clearUsageRecords()
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIUsageStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	stats := computeUsageStats(h)
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) handleCybxAIUsageChart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	rangeKey := r.URL.Query().Get("range")
	if rangeKey == "" {
		rangeKey = "day"
	}
	buckets := buildUsageChart(rangeKey)
	writeJSON(w, http.StatusOK, map[string]any{
		"range":   rangeKey,
		"buckets": buckets,
	})
}

func (h *Handler) handleCybxAIFilters(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		data, err := readFiltersFile()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		ensureFiltersDefaults(data)
		writeJSON(w, http.StatusOK, data)
	case http.MethodPost:
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		if err := validateFiltersConfig(body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		ensureFiltersDefaults(body)
		if err := writeFiltersFile(body); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIFiltersToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	data, err := readFiltersFile()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	data["enabled"] = body.Enabled
	if err := writeFiltersFile(data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIFiltersRule(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Location", "/api/filters/rules")
	writeError(w, http.StatusGone, "Use /api/filters/rules (plural) instead.")
}

func (h *Handler) handleCybxAIFiltersProvider(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Provider string `json:"provider"`
		Enabled  bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.Provider == "" {
		writeError(w, http.StatusBadRequest, "Field 'provider' is required")
		return
	}
	data, err := readFiltersFile()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	overrides, _ := data["providerOverrides"].(map[string]any)
	if overrides == nil {
		overrides = map[string]any{}
	}
	overrides[body.Provider] = body.Enabled
	data["providerOverrides"] = overrides
	if err := writeFiltersFile(data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIFiltersRules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		ID          string `json:"id"`
		Label       string `json:"label"`
		Pattern     string `json:"pattern"`
		Flags       string `json:"flags"`
		Replacement string `json:"replacement"`
		Category    string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(body.Label) == "" || strings.TrimSpace(body.Pattern) == "" {
		writeError(w, http.StatusBadRequest, "label and pattern are required")
		return
	}
	flagsPrefix := ""
	if strings.Contains(body.Flags, "i") {
		flagsPrefix = "(?i)"
	}
	if _, err := regexp.Compile(flagsPrefix + body.Pattern); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid regex: "+err.Error())
		return
	}
	if body.Category == "" {
		body.Category = "custom"
	}
	if body.ID == "" {
		body.ID = randomHex(4)
	}
	rule := map[string]any{
		"id":          body.ID,
		"label":       body.Label,
		"pattern":     body.Pattern,
		"flags":       body.Flags,
		"replacement": body.Replacement,
		"preset":      false,
		"enabled":     true,
		"category":    body.Category,
	}
	data, err := readFiltersFile()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rules, _ := data["rules"].([]any)
	rules = append(rules, rule)
	data["rules"] = rules
	if err := writeFiltersFile(data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

func (h *Handler) handleCybxAIFiltersRuleItem(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/filters/rules/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusBadRequest, "Rule id required")
		return
	}
	id := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}
	data, err := readFiltersFile()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rulesAny, _ := data["rules"].([]any)
	switch r.Method {
	case http.MethodDelete:
		newRules := make([]any, 0, len(rulesAny))
		removed := false
		for _, raw := range rulesAny {
			rule, ok := raw.(map[string]any)
			if !ok {
				newRules = append(newRules, raw)
				continue
			}
			if fmt.Sprint(rule["id"]) == id {
				removed = true
				continue
			}
			newRules = append(newRules, rule)
		}
		if !removed {
			writeError(w, http.StatusNotFound, "Rule not found")
			return
		}
		data["rules"] = newRules
		if err := writeFiltersFile(data); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	case http.MethodPost:
		if action != "toggle" {
			writeError(w, http.StatusBadRequest, "Unknown action: "+action)
			return
		}
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		updated := false
		for _, raw := range rulesAny {
			if rule, ok := raw.(map[string]any); ok && fmt.Sprint(rule["id"]) == id {
				rule["enabled"] = body.Enabled
				updated = true
			}
		}
		if !updated {
			writeError(w, http.StatusNotFound, "Rule not found")
			return
		}
		if err := writeFiltersFile(data); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAISetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(body.Password) == "" {
		writeError(w, http.StatusBadRequest, "Password cannot be empty")
		return
	}
	if err := config.UpdateSettings(config.GetApiKey(), config.IsApiKeyRequired(), body.Password); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	settings := loadCybxAISettings()
	settings.AuthEnabled = true
	saveCybxAISettings(settings)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIRemovePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	cfg := config.Get()
	if cfg != nil {
		cfg.Password = ""
		_ = config.Save()
	}
	settings := loadCybxAISettings()
	settings.AuthEnabled = false
	saveCybxAISettings(settings)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIAuthToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.Enabled && config.GetPassword() == "" {
		writeError(w, http.StatusBadRequest, "Set a password before enabling auth")
		return
	}
	settings := loadCybxAISettings()
	settings.AuthEnabled = body.Enabled
	saveCybxAISettings(settings)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAISessionTimeout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Hours int `json:"hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.Hours < 1 || body.Hours > 720 {
		writeError(w, http.StatusBadRequest, "Hours must be between 1 and 720")
		return
	}
	settings := loadCybxAISettings()
	settings.SessionTimeoutHours = body.Hours
	saveCybxAISettings(settings)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAISessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	settings := loadCybxAISettings()
	now := time.Now().Unix()
	out := make([]map[string]any, 0, len(settings.Sessions))
	for _, s := range settings.Sessions {
		if s.ExpiresAt < now {
			continue
		}
		out = append(out, map[string]any{
			"id":        s.ID,
			"createdAt": s.CreatedAt * 1000,
			"expiresAt": s.ExpiresAt * 1000,
			"ip":        s.IP,
			"userAgent": s.UserAgent,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (h *Handler) handleCybxAISessionsClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	settings := loadCybxAISettings()
	settings.Sessions = nil
	saveCybxAISettings(settings)
	http.SetCookie(w, &http.Cookie{
		Name:   "admin_password",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) handleCybxAIKiroConnections(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	q := r.URL.Query()
	if q.Get("provider") == "" {
		q.Set("provider", ProviderKiro)
		r.URL.RawQuery = q.Encode()
	}
	h.handleCybxAIConnections(w, r)
}

func (h *Handler) handleCybxAIModelsCustom(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var body customModelEntry
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		if body.ID == "" || body.Name == "" || body.UpstreamModel == "" {
			writeError(w, http.StatusBadRequest, "id, name, and upstreamModel are required")
			return
		}
		if body.Provider == "" {
			body.Provider = ProviderKiro
		}
		if !strings.Contains(body.ID, "/") {
			body.ID = "kr/" + body.ID
		}
		body.Custom = true
		list := loadCustomModels()
		filtered := make([]customModelEntry, 0, len(list)+1)
		for _, m := range list {
			if m.ID == body.ID {
				continue
			}
			filtered = append(filtered, m)
		}
		filtered = append(filtered, body)
		saveCustomModels(filtered)
		out := map[string]any{
			"id":            body.ID,
			"name":          body.Name,
			"provider":      body.Provider,
			"upstreamModel": body.UpstreamModel,
			"contextWindow": body.ContextWindow,
			"custom":        true,
		}
		if body.AccountTier != "" {
			out["accountTier"] = body.AccountTier
		}
		writeJSON(w, http.StatusOK, out)
	case http.MethodDelete:
		var body struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		if body.ID == "" {
			writeError(w, http.StatusBadRequest, "id required")
			return
		}
		list := loadCustomModels()
		out := make([]customModelEntry, 0, len(list))
		removed := false
		for _, m := range list {
			if m.ID == body.ID {
				removed = true
				continue
			}
			out = append(out, m)
		}
		if !removed {
			writeError(w, http.StatusNotFound, "Custom model not found")
			return
		}
		saveCustomModels(out)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	h.apiExportAccounts(w, r)
}

func (h *Handler) handleCybxAIImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var payload struct {
		Accounts []struct {
			ID          string `json:"id"`
			Email       string `json:"email"`
			Nickname    string `json:"nickname"`
			Idp         string `json:"idp"`
			UserId      string `json:"userId"`
			MachineId   string `json:"machineId"`
			Credentials struct {
				AccessToken  string `json:"accessToken"`
				RefreshToken string `json:"refreshToken"`
				ClientID     string `json:"clientId"`
				ClientSecret string `json:"clientSecret"`
				Region       string `json:"region"`
				ExpiresAt    int64  `json:"expiresAt"`
				AuthMethod   string `json:"authMethod"`
				Provider     string `json:"provider"`
			} `json:"credentials"`
			Subscription struct {
				Type  string `json:"type"`
				Title string `json:"title"`
			} `json:"subscription"`
			Usage struct {
				Current     float64 `json:"current"`
				Limit       float64 `json:"limit"`
				PercentUsed float64 `json:"percentUsed"`
			} `json:"usage"`
		} `json:"accounts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	existing := config.GetAccounts()
	emails := make(map[string]bool)
	ids := make(map[string]bool)
	for _, a := range existing {
		ids[a.ID] = true
		if a.Email != "" {
			emails[strings.ToLower(a.Email)] = true
		}
	}
	imported := 0
	skipped := 0
	for _, p := range payload.Accounts {
		emailLower := strings.ToLower(p.Email)
		if (p.ID != "" && ids[p.ID]) || (p.Email != "" && emails[emailLower]) {
			skipped++
			continue
		}
		expiresAt := p.Credentials.ExpiresAt
		if expiresAt > 9_999_999_999 {
			expiresAt = expiresAt / 1000
		}
		acc := config.Account{
			ID:                p.ID,
			Email:             p.Email,
			Nickname:          p.Nickname,
			UserId:            p.UserId,
			MachineId:         p.MachineId,
			AccessToken:       p.Credentials.AccessToken,
			RefreshToken:      p.Credentials.RefreshToken,
			ClientID:          p.Credentials.ClientID,
			ClientSecret:      p.Credentials.ClientSecret,
			Region:            p.Credentials.Region,
			ExpiresAt:         expiresAt,
			AuthMethod:        normalizeAuthMethod(p.Credentials.AuthMethod, p.Idp),
			Provider:          firstNonEmpty(p.Credentials.Provider, p.Idp),
			SubscriptionType:  p.Subscription.Type,
			SubscriptionTitle: p.Subscription.Title,
			UsageCurrent:      p.Usage.Current,
			UsageLimit:        p.Usage.Limit,
			UsagePercent:      p.Usage.PercentUsed,
			Enabled:           true,
		}
		if acc.ID == "" {
			acc.ID = auth.GenerateAccountID()
		}
		if acc.Region == "" {
			acc.Region = "us-east-1"
		}
		if acc.MachineId == "" {
			acc.MachineId = config.GenerateMachineId()
		}
		if err := config.AddAccount(acc); err != nil {
			skipped++
			continue
		}
		ids[acc.ID] = true
		if acc.Email != "" {
			emails[strings.ToLower(acc.Email)] = true
		}
		imported++
	}
	if imported > 0 {
		h.pool.Reload()
	}
	writeJSON(w, http.StatusOK, map[string]int{
		"imported": imported,
		"skipped":  skipped,
	})
}

func normalizeAuthMethod(method, idp string) string {
	m := strings.ToLower(strings.TrimSpace(method))
	switch m {
	case "idc":
		return "idc"
	case "social":
		return "social"
	}
	if idp != "" && (strings.EqualFold(idp, "google") || strings.EqualFold(idp, "github")) {
		return "social"
	}
	if idp != "" {
		return "idc"
	}
	return "social"
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (h *Handler) handleCybxAIBatchConnect(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		writeJSON(w, http.StatusNotImplemented, map[string]any{
			"taskId": "",
			"error":  "Headless batch login is not supported by Kiro-Cybxai. Use Builder ID, IAM SSO, web token, or refresh token in the Kiro provider page instead.",
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAIBatchConnectItem(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/batch-connect/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	taskId := ""
	if len(parts) > 0 {
		taskId = parts[0]
	}
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"taskId":    taskId,
			"status":    "failed",
			"total":     0,
			"completed": 0,
			"failed":    0,
			"results":   []any{},
			"logs": []map[string]any{{
				"time":    time.Now().UTC().Format("15:04:05"),
				"level":   "error",
				"message": "Batch login is not available in Kiro-Cybxai.",
			}},
		})
	case http.MethodPost:
		if action == "cancel" {
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
			return
		}
		writeError(w, http.StatusBadRequest, "Unknown action")
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *Handler) handleCybxAISystem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"version": config.Version,
		"port":    config.GetPort(),
	})
}

func (h *Handler) handleCybxAIChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if !h.validateApiKey(r) {
		h.sendOpenAIError(w, http.StatusUnauthorized, "authentication_error", "Invalid or missing API key")
		return
	}
	h.handleOpenAIChat(w, r)
}

func generateApiKey() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "cy-" + strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return "cy-" + hex.EncodeToString(b)
}

func isAdminAuthenticated(r *http.Request) bool {
	pw := r.Header.Get("X-Admin-Password")
	if pw == "" {
		if c, err := r.Cookie("admin_password"); err == nil {
			pw = c.Value
		}
	}
	return pw != "" && pw == config.GetPassword()
}

const filtersConfigPath = "context-filtes/filters.json"

func readFiltersFile() (map[string]any, error) {
	data, err := os.ReadFile(filtersConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{
				"enabled":           false,
				"providerOverrides": map[string]any{},
				"rules":             []any{},
			}, nil
		}
		return nil, fmt.Errorf("read filters: %w", err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("parse filters: %w", err)
	}
	return out, nil
}

func writeFiltersFile(data map[string]any) error {
	dir := filepath.Dir(filtersConfigPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	tmp := filtersConfigPath + ".tmp"
	encoded, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("encode: %w", err)
	}
	if err := os.WriteFile(tmp, encoded, 0644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Rename(tmp, filtersConfigPath); err != nil {
		return fmt.Errorf("rename: %w", err)
	}
	if err := contentfilter.Reload(filtersConfigPath); err != nil {
		return fmt.Errorf("reload: %w", err)
	}
	return nil
}

func (h *Handler) handleCybxAIFiltersReload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := contentfilter.Reload(filtersConfigPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func ensureFiltersDefaults(data map[string]any) {
	if _, ok := data["enabled"]; !ok {
		data["enabled"] = false
	}
	if _, ok := data["providerOverrides"]; !ok {
		data["providerOverrides"] = map[string]any{}
	}
	if _, ok := data["rules"]; !ok {
		data["rules"] = []any{}
	}
}

func validateFiltersConfig(data map[string]any) error {
	rulesAny, _ := data["rules"].([]any)
	for i, raw := range rulesAny {
		rule, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		pattern, _ := rule["pattern"].(string)
		if pattern == "" {
			return fmt.Errorf("rule %d: pattern is empty", i)
		}
		flags, _ := rule["flags"].(string)
		prefix := ""
		if strings.Contains(flags, "i") {
			prefix = "(?i)"
		}
		if _, err := regexp.Compile(prefix + pattern); err != nil {
			return fmt.Errorf("rule %d (%v): invalid regex: %v", i, rule["id"], err)
		}
	}
	return nil
}

type customModelEntry struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	UpstreamModel string `json:"upstreamModel"`
	ContextWindow int    `json:"contextWindow,omitempty"`
	Custom        bool   `json:"custom,omitempty"`
	AccountTier   string `json:"accountTier,omitempty"`
}

const customModelsPath = "data/custom_models.json"

func loadCustomModels() []customModelEntry {
	data, err := os.ReadFile(customModelsPath)
	if err != nil {
		return nil
	}
	var out []customModelEntry
	if err := json.Unmarshal(data, &out); err != nil {
		return nil
	}
	return out
}

func saveCustomModels(list []customModelEntry) {
	dir := filepath.Dir(customModelsPath)
	_ = os.MkdirAll(dir, 0755)
	encoded, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	tmp := customModelsPath + ".tmp"
	if err := os.WriteFile(tmp, encoded, 0644); err != nil {
		return
	}
	_ = os.Rename(tmp, customModelsPath)
}

type cybxaiSettings struct {
	AuthEnabled         bool                    `json:"authEnabled"`
	SessionTimeoutHours int                     `json:"sessionTimeoutHours"`
	RoundRobinEnabled   bool                    `json:"roundRobinEnabled"`
	Sessions            []cybxaiSettingsSession `json:"sessions"`
}

type cybxaiSettingsSession struct {
	ID        string `json:"id"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
	IP        string `json:"ip"`
	UserAgent string `json:"userAgent"`
}

const cybxaiSettingsPath = "data/cybxai_settings.json"

var cybxaiSettingsMu sync.Mutex

func loadCybxAISettings() *cybxaiSettings {
	cybxaiSettingsMu.Lock()
	defer cybxaiSettingsMu.Unlock()
	out := &cybxaiSettings{
		AuthEnabled:         config.GetPassword() != "",
		SessionTimeoutHours: 24,
		RoundRobinEnabled:   true,
	}
	data, err := os.ReadFile(cybxaiSettingsPath)
	if err != nil {
		return out
	}
	_ = json.Unmarshal(data, out)
	if out.SessionTimeoutHours < 1 {
		out.SessionTimeoutHours = 24
	}
	return out
}

func saveCybxAISettings(s *cybxaiSettings) {
	cybxaiSettingsMu.Lock()
	defer cybxaiSettingsMu.Unlock()
	dir := filepath.Dir(cybxaiSettingsPath)
	_ = os.MkdirAll(dir, 0755)
	encoded, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	tmp := cybxaiSettingsPath + ".tmp"
	if err := os.WriteFile(tmp, encoded, 0644); err != nil {
		return
	}
	_ = os.Rename(tmp, cybxaiSettingsPath)
}

func isLocalRequest(r *http.Request) bool {
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	host = strings.Trim(host, "[]")
	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}

type usageRecord struct {
	ID               string  `json:"id"`
	Model            string  `json:"model"`
	AccountID        string  `json:"accountId"`
	AccountLabel     string  `json:"accountLabel,omitempty"`
	PromptTokens     int     `json:"promptTokens"`
	CompletionTokens int     `json:"completionTokens"`
	TotalTokens      int     `json:"totalTokens"`
	Cost             float64 `json:"cost"`
	Tokens           int     `json:"tokens"`
	LatencyMs        int64   `json:"latencyMs"`
	Status           string  `json:"status"`
	Success          bool    `json:"success"`
	Endpoint         string  `json:"endpoint,omitempty"`
	Streaming        bool    `json:"streaming,omitempty"`
	RequestBody      string  `json:"requestBody,omitempty"`
	ResponseBody     string  `json:"responseBody,omitempty"`
	Timestamp        int64   `json:"timestamp"`
}

const maxUsageRecords = 500
const usageRecordsPath = "data/usage_records.json"

var (
	usageRecordsMu sync.Mutex
	usageBuffer    []usageRecord
)

func init() {
	loadUsageBuffer()
}

func loadUsageBuffer() {
	data, err := os.ReadFile(usageRecordsPath)
	if err != nil {
		return
	}
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	var stored []usageRecord
	if err := json.Unmarshal(data, &stored); err == nil {
		if len(stored) > maxUsageRecords {
			stored = stored[len(stored)-maxUsageRecords:]
		}
		usageBuffer = stored
	}
}

func saveUsageBufferLocked() {
	dir := filepath.Dir(usageRecordsPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return
	}
	encoded, err := json.Marshal(usageBuffer)
	if err != nil {
		return
	}
	tmp := usageRecordsPath + ".tmp"
	if err := os.WriteFile(tmp, encoded, 0644); err != nil {
		return
	}
	_ = os.Rename(tmp, usageRecordsPath)
}

func RecordUsage(rec usageRecord) {
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	if rec.ID == "" {
		rec.ID = randomHex(8)
	}
	if rec.Timestamp == 0 {
		rec.Timestamp = time.Now().UnixMilli()
	}
	if rec.Tokens == 0 {
		rec.Tokens = rec.TotalTokens
	}
	usageBuffer = append(usageBuffer, rec)
	if len(usageBuffer) > maxUsageRecords {
		usageBuffer = usageBuffer[len(usageBuffer)-maxUsageRecords:]
	}
	saveUsageBufferLocked()
}

func recordUsageWithCtx(account *config.Account, model string, inputTokens, outputTokens int, cost float64, success bool, httpStatus int) {
	if account == nil {
		return
	}
	rec := &usageRecord{
		Model:            model,
		AccountID:        account.ID,
		AccountLabel:     account.Email,
		PromptTokens:     inputTokens,
		CompletionTokens: outputTokens,
		TotalTokens:      inputTokens + outputTokens,
		Cost:             cost,
		Success:          success,
	}
	if httpStatus > 0 {
		rec.Status = fmt.Sprintf("%d", httpStatus)
	} else if success {
		rec.Status = "200"
	} else {
		rec.Status = "fail"
	}
	uc := getAccountUsageCtx(account.ID)
	if uc != nil {
		rec.Endpoint = uc.Endpoint
		rec.Streaming = uc.Streaming
		rec.RequestBody = uc.RequestBody
		uc.Pending = rec
	} else {
		RecordUsage(*rec)
	}
}

func flushAccountUsage(accountID string) {
	uc := getAccountUsageCtx(accountID)
	if uc == nil || uc.Pending == nil {
		return
	}
	rec := uc.Pending
	if !uc.StartTime.IsZero() {
		rec.LatencyMs = time.Since(uc.StartTime).Milliseconds()
	}
	if uc.ResponseTee != nil {
		rec.ResponseBody = cleanResponseBody(uc.ResponseTee.buf.String(), uc.Streaming)
		if rec.Status == "" || rec.Status == "200" {
			if uc.ResponseTee.status > 0 {
				rec.Status = fmt.Sprintf("%d", uc.ResponseTee.status)
			}
		}
	}
	RecordUsage(*rec)
	uc.Pending = nil
}

func getUsageRecords(limit int, model, accountId string) []usageRecord {
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	out := make([]usageRecord, 0, len(usageBuffer))
	for i := len(usageBuffer) - 1; i >= 0; i-- {
		rec := usageBuffer[i]
		if model != "" && !strings.EqualFold(rec.Model, model) {
			continue
		}
		if accountId != "" && rec.AccountID != accountId {
			continue
		}
		out = append(out, rec)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func clearUsageRecords() {
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	usageBuffer = nil
	saveUsageBufferLocked()
}

func cleanResponseBody(raw string, streaming bool) string {
	if raw == "" {
		return raw
	}
	if !streaming {
		return strings.TrimSpace(raw)
	}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	scanner.Buffer(make([]byte, 1024*1024), 8*1024*1024)
	textParts := make([]string, 0)
	stopReason := ""
	model := ""
	id := ""
	inputTokens := 0
	outputTokens := 0
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		if payload == "[DONE]" {
			continue
		}
		var obj map[string]any
		if err := json.Unmarshal([]byte(payload), &obj); err != nil {
			continue
		}
		switch obj["type"] {
		case "message_start":
			if msg, ok := obj["message"].(map[string]any); ok {
				if v, ok := msg["id"].(string); ok {
					id = v
				}
				if v, ok := msg["model"].(string); ok {
					model = v
				}
			}
		case "content_block_delta":
			if delta, ok := obj["delta"].(map[string]any); ok {
				if t, ok := delta["text"].(string); ok {
					textParts = append(textParts, t)
				}
				if t, ok := delta["thinking"].(string); ok {
					textParts = append(textParts, t)
				}
			}
		case "message_delta":
			if delta, ok := obj["delta"].(map[string]any); ok {
				if v, ok := delta["stop_reason"].(string); ok {
					stopReason = v
				}
			}
			if u, ok := obj["usage"].(map[string]any); ok {
				if v, ok := u["input_tokens"].(float64); ok {
					inputTokens = int(v)
				}
				if v, ok := u["output_tokens"].(float64); ok {
					outputTokens = int(v)
				}
			}
		}
		if choices, ok := obj["choices"].([]any); ok && len(choices) > 0 {
			if first, ok := choices[0].(map[string]any); ok {
				if d, ok := first["delta"].(map[string]any); ok {
					if c, ok := d["content"].(string); ok {
						textParts = append(textParts, c)
					}
				}
			}
			if model == "" {
				if v, ok := obj["model"].(string); ok {
					model = v
				}
			}
			if id == "" {
				if v, ok := obj["id"].(string); ok {
					id = v
				}
			}
		}
	}
	flat := map[string]any{
		"id":            id,
		"type":          "message",
		"role":          "assistant",
		"content":       []any{map[string]string{"type": "text", "text": strings.Join(textParts, "")}},
		"model":         model,
		"stop_reason":   stopReason,
		"stop_sequence": nil,
		"usage": map[string]int{
			"input_tokens":  inputTokens,
			"output_tokens": outputTokens,
		},
	}
	encoded, err := json.Marshal(flat)
	if err != nil {
		return strings.TrimSpace(raw)
	}
	return string(encoded)
}

func computeUsageStats(h *Handler) map[string]any {
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	byModel := map[string]map[string]any{}
	totalRequests := 0
	totalTokens := 0
	totalCost := 0.0
	successRequests := 0
	failedRequests := 0
	totalPrompt := 0
	totalCompletion := 0
	for _, rec := range usageBuffer {
		totalRequests++
		totalTokens += rec.TotalTokens
		totalPrompt += rec.PromptTokens
		totalCompletion += rec.CompletionTokens
		totalCost += rec.Cost
		if rec.Success {
			successRequests++
		} else {
			failedRequests++
		}
		key := rec.Model
		if key == "" {
			key = "unknown"
		}
		entry, ok := byModel[key]
		if !ok {
			entry = map[string]any{
				"model":            key,
				"requests":         0,
				"totalTokens":      0,
				"promptTokens":     0,
				"completionTokens": 0,
				"cost":             0.0,
			}
		}
		entry["requests"] = entry["requests"].(int) + 1
		entry["totalTokens"] = entry["totalTokens"].(int) + rec.TotalTokens
		entry["promptTokens"] = entry["promptTokens"].(int) + rec.PromptTokens
		entry["completionTokens"] = entry["completionTokens"].(int) + rec.CompletionTokens
		entry["cost"] = entry["cost"].(float64) + rec.Cost
		byModel[key] = entry
	}
	successRate := 0.0
	if totalRequests > 0 {
		successRate = float64(successRequests) / float64(totalRequests) * 100.0
	}
	if totalRequests == 0 {
		totalRequests = int(h.totalRequests)
		totalTokens = int(h.totalTokens)
		successRequests = int(h.successRequests)
		failedRequests = int(h.failedRequests)
	}
	return map[string]any{
		"totalRequests":         totalRequests,
		"successRequests":       successRequests,
		"failedRequests":        failedRequests,
		"totalTokens":           totalTokens,
		"totalPromptTokens":     totalPrompt,
		"totalCompletionTokens": totalCompletion,
		"totalCost":             totalCost,
		"successRate":           successRate,
		"byModel":               byModel,
	}
}

func buildUsageChart(rangeKey string) []map[string]any {
	usageRecordsMu.Lock()
	defer usageRecordsMu.Unlock()
	now := time.Now()
	var bucketCount int
	var bucketDuration time.Duration
	var labelFmt string
	switch rangeKey {
	case "week":
		bucketCount = 7
		bucketDuration = 24 * time.Hour
		labelFmt = "Mon 02"
	case "month":
		bucketCount = 30
		bucketDuration = 24 * time.Hour
		labelFmt = "Jan 02"
	default:
		bucketCount = 24
		bucketDuration = time.Hour
		labelFmt = "15:04"
	}
	buckets := make([]map[string]any, bucketCount)
	for i := 0; i < bucketCount; i++ {
		t := now.Add(-time.Duration(bucketCount-1-i) * bucketDuration)
		buckets[i] = map[string]any{
			"timestamp":        t.UnixMilli(),
			"label":            t.Format(labelFmt),
			"requests":         0,
			"tokens":           0,
			"promptTokens":     0,
			"completionTokens": 0,
			"cost":             0.0,
			"successCount":     0,
			"failCount":        0,
		}
	}
	earliest := now.Add(-time.Duration(bucketCount) * bucketDuration)
	for _, rec := range usageBuffer {
		ts := time.UnixMilli(rec.Timestamp)
		if ts.Before(earliest) {
			continue
		}
		idx := int(ts.Sub(earliest) / bucketDuration)
		if idx < 0 || idx >= bucketCount {
			continue
		}
		b := buckets[idx]
		b["requests"] = b["requests"].(int) + 1
		b["tokens"] = b["tokens"].(int) + rec.TotalTokens
		b["promptTokens"] = b["promptTokens"].(int) + rec.PromptTokens
		b["completionTokens"] = b["completionTokens"].(int) + rec.CompletionTokens
		b["cost"] = b["cost"].(float64) + rec.Cost
		if rec.Success {
			b["successCount"] = b["successCount"].(int) + 1
		} else {
			b["failCount"] = b["failCount"].(int) + 1
		}
	}
	return buckets
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b)
}

type usageCtxKey struct{}

type usageCtx struct {
	Endpoint    string
	StartTime   time.Time
	RequestBody string
	Streaming   bool
	ResponseTee *responseTeeWriter
	Pending     *usageRecord
}

func withUsageCtx(r *http.Request, c *usageCtx) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), usageCtxKey{}, c))
}

func usageCtxFromRequest(r *http.Request) *usageCtx {
	if r == nil {
		return nil
	}
	v := r.Context().Value(usageCtxKey{})
	if v == nil {
		return nil
	}
	return v.(*usageCtx)
}

var (
	usageCtxByAccountMu sync.Mutex
	usageCtxByAccount   = map[string]*usageCtx{}
)

func setAccountUsageCtx(accountID string, c *usageCtx) {
	if accountID == "" {
		return
	}
	usageCtxByAccountMu.Lock()
	defer usageCtxByAccountMu.Unlock()
	if c == nil {
		delete(usageCtxByAccount, accountID)
		return
	}
	usageCtxByAccount[accountID] = c
}

func getAccountUsageCtx(accountID string) *usageCtx {
	if accountID == "" {
		return nil
	}
	usageCtxByAccountMu.Lock()
	defer usageCtxByAccountMu.Unlock()
	return usageCtxByAccount[accountID]
}

type responseTeeWriter struct {
	http.ResponseWriter
	buf    *strings.Builder
	max    int
	status int
}

func newResponseTee(w http.ResponseWriter, max int) *responseTeeWriter {
	return &responseTeeWriter{ResponseWriter: w, buf: &strings.Builder{}, max: max, status: 200}
}

func (rt *responseTeeWriter) WriteHeader(code int) {
	rt.status = code
	rt.ResponseWriter.WriteHeader(code)
}

func (rt *responseTeeWriter) Write(p []byte) (int, error) {
	if rt.buf.Len() < rt.max {
		remain := rt.max - rt.buf.Len()
		if remain >= len(p) {
			rt.buf.Write(p)
		} else {
			rt.buf.Write(p[:remain])
		}
	}
	return rt.ResponseWriter.Write(p)
}

func (rt *responseTeeWriter) Flush() {
	if f, ok := rt.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func normalizeKiroModel(model string) string {
	if model == "" {
		return ""
	}
	if strings.Contains(model, "/") {
		return model
	}
	return "kr/" + model
}

var _ = io.ReadAll
