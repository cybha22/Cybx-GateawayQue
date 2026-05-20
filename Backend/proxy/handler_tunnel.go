package proxy

import (
	"encoding/json"
	"net/http"
)

func (h *Handler) handleCybxAITunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	state := GetTunnelState()
	installed := IsCloudflaredInstalled()
	version := ""
	if installed {
		version = GetCloudflaredVersion()
	}
	out := map[string]any{
		"status":              state.Status,
		"url":                 state.URL,
		"mode":                state.Mode,
		"hostname":            state.Hostname,
		"tunnelName":          state.TunnelName,
		"pid":                 state.PID,
		"startedAt":           state.StartedAt,
		"error":               state.Error,
		"installed":           installed,
		"version":             version,
		"installInstructions": GetInstallInstructionsURL(),
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handleCybxAITunnelStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		Port       int    `json:"port"`
		Mode       string `json:"mode"`
		Hostname   string `json:"hostname"`
		TunnelName string `json:"tunnelName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}
	if body.Port <= 0 {
		body.Port = 8085
	}
	if body.Mode == "" {
		body.Mode = "quick"
	}
	var (
		state TunnelState
		err   error
	)
	if body.Mode == "named" {
		state, err = StartNamedTunnel(body.Port, body.Hostname, body.TunnelName)
	} else {
		state, err = StartQuickTunnel(body.Port)
	}
	if err != nil {
		writeJSON(w, http.StatusOK, tunnelStateResponse(state))
		return
	}
	writeJSON(w, http.StatusOK, tunnelStateResponse(state))
}

func (h *Handler) handleCybxAITunnelStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	state := StopTunnel()
	writeJSON(w, http.StatusOK, tunnelStateResponse(state))
}

func (h *Handler) handleCybxAITunnelConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cfg, detected := GetTunnelConfig()
		var binaryPath any
		if cfg.BinaryPath == "" {
			binaryPath = nil
		} else {
			binaryPath = cfg.BinaryPath
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"binaryPath":    binaryPath,
			"detectedPaths": detected,
		})
	case http.MethodPost:
		var body struct {
			BinaryPath *string `json:"binaryPath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
			writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
			return
		}
		path := ""
		if body.BinaryPath != nil {
			path = *body.BinaryPath
		}
		result := ValidateCloudflaredPath(path)
		out := map[string]any{
			"valid": result.Valid,
		}
		if result.Version != "" {
			out["version"] = result.Version
		}
		if result.Error != "" {
			out["error"] = result.Error
		}
		writeJSON(w, http.StatusOK, out)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func tunnelStateResponse(state TunnelState) map[string]any {
	installed := IsCloudflaredInstalled()
	version := ""
	if installed {
		version = GetCloudflaredVersion()
	}
	return map[string]any{
		"status":              state.Status,
		"url":                 state.URL,
		"mode":                state.Mode,
		"hostname":            state.Hostname,
		"tunnelName":          state.TunnelName,
		"pid":                 state.PID,
		"startedAt":           state.StartedAt,
		"error":               state.Error,
		"installed":           installed,
		"version":             version,
		"installInstructions": GetInstallInstructionsURL(),
	}
}
