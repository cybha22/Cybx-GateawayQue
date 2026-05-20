package proxy

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	tunnelConfigFile = "data/tunnel-config.json"
	tunnelStateFile  = "data/tunnel-state.json"
	tunnelStartURLRe = `https://[a-z0-9-]+\.trycloudflare\.com`
	tunnelStartTO    = 30 * time.Second
)

type TunnelConfig struct {
	BinaryPath string `json:"binaryPath"`
}

type TunnelState struct {
	Status     string  `json:"status"`
	URL        *string `json:"url"`
	Mode       string  `json:"mode"`
	Hostname   string  `json:"hostname,omitempty"`
	TunnelName string  `json:"tunnelName,omitempty"`
	PID        *int    `json:"pid"`
	StartedAt  *int64  `json:"startedAt"`
	Error      *string `json:"error"`
}

type tunnelValidateResult struct {
	Valid   bool   `json:"valid"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

var (
	tunnelMu        sync.Mutex
	tunnelConfig    TunnelConfig
	tunnelState     TunnelState
	tunnelCmd       *exec.Cmd
	tunnelCancel    context.CancelFunc
	tunnelLoaded    bool
	tunnelURLRegexp = regexp.MustCompile(tunnelStartURLRe)
)

func ensureTunnelDataDir() error {
	return os.MkdirAll(filepath.Dir(tunnelConfigFile), 0755)
}

func ensureTunnelLoaded() {
	if tunnelLoaded {
		return
	}
	tunnelLoaded = true
	loadTunnelConfigLocked()
	loadTunnelStateLocked()
}

func loadTunnelConfigLocked() {
	tunnelConfig = TunnelConfig{}
	data, err := os.ReadFile(tunnelConfigFile)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &tunnelConfig)
}

func saveTunnelConfigLocked() error {
	if err := ensureTunnelDataDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(tunnelConfig, "", "  ")
	if err != nil {
		return err
	}
	tmp := tunnelConfigFile + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, tunnelConfigFile)
}

func loadTunnelStateLocked() {
	tunnelState = TunnelState{Status: "stopped", Mode: "quick"}
	data, err := os.ReadFile(tunnelStateFile)
	if err != nil {
		return
	}
	var s TunnelState
	if err := json.Unmarshal(data, &s); err != nil {
		return
	}
	if s.Status == "running" || s.Status == "starting" {
		s.Status = "stopped"
		s.URL = nil
		s.PID = nil
	}
	if s.Mode == "" {
		s.Mode = "quick"
	}
	tunnelState = s
}

func saveTunnelStateLocked() error {
	if err := ensureTunnelDataDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(tunnelState, "", "  ")
	if err != nil {
		return err
	}
	tmp := tunnelStateFile + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, tunnelStateFile)
}

func GetTunnelState() TunnelState {
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	ensureTunnelLoaded()
	return cloneTunnelState(tunnelState)
}

func cloneTunnelState(s TunnelState) TunnelState {
	out := TunnelState{
		Status:     s.Status,
		Mode:       s.Mode,
		Hostname:   s.Hostname,
		TunnelName: s.TunnelName,
	}
	if s.URL != nil {
		v := *s.URL
		out.URL = &v
	}
	if s.PID != nil {
		v := *s.PID
		out.PID = &v
	}
	if s.StartedAt != nil {
		v := *s.StartedAt
		out.StartedAt = &v
	}
	if s.Error != nil {
		v := *s.Error
		out.Error = &v
	}
	return out
}

func GetTunnelConfig() (TunnelConfig, []string) {
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	ensureTunnelLoaded()
	return tunnelConfig, DetectCloudflared()
}

func GetCloudflaredBin() string {
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	ensureTunnelLoaded()
	return getCloudflaredBinLocked()
}

func getCloudflaredBinLocked() string {
	if tunnelConfig.BinaryPath != "" {
		if _, err := os.Stat(tunnelConfig.BinaryPath); err == nil {
			return tunnelConfig.BinaryPath
		}
	}
	return "cloudflared"
}

func DetectCloudflared() []string {
	home, _ := os.UserHomeDir()
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" && home != "" {
			localAppData = filepath.Join(home, "AppData", "Local")
		}
		programFiles := os.Getenv("ProgramFiles")
		if programFiles == "" {
			programFiles = `C:\Program Files`
		}
		programFiles86 := os.Getenv("ProgramFiles(x86)")
		if programFiles86 == "" {
			programFiles86 = `C:\Program Files (x86)`
		}
		candidates = []string{
			filepath.Join(programFiles, "cloudflared", "cloudflared.exe"),
			filepath.Join(programFiles86, "cloudflared", "cloudflared.exe"),
			filepath.Join(localAppData, "cloudflared", "cloudflared.exe"),
		}
		if home != "" {
			candidates = append(candidates,
				filepath.Join(home, "scoop", "apps", "cloudflared", "current", "cloudflared.exe"),
				filepath.Join(home, ".cloudflared", "cloudflared.exe"),
				filepath.Join(home, ".cloudflared", "bin", "cloudflared.exe"),
			)
		}
	case "darwin":
		candidates = []string{
			"/usr/local/bin/cloudflared",
			"/opt/homebrew/bin/cloudflared",
			"/usr/bin/cloudflared",
		}
		if home != "" {
			candidates = append(candidates, filepath.Join(home, "bin", "cloudflared"))
		}
	default:
		candidates = []string{
			"/usr/local/bin/cloudflared",
			"/usr/bin/cloudflared",
			"/snap/bin/cloudflared",
		}
		if home != "" {
			candidates = append(candidates,
				filepath.Join(home, "bin", "cloudflared"),
				filepath.Join(home, ".local", "bin", "cloudflared"),
			)
		}
	}

	found := make([]string, 0, len(candidates))
	seen := make(map[string]bool)
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			if !seen[p] {
				seen[p] = true
				found = append(found, p)
			}
		}
	}
	if path, err := exec.LookPath("cloudflared"); err == nil {
		if _, err := os.Stat(path); err == nil {
			abs, _ := filepath.Abs(path)
			if !seen[abs] && !seen[path] {
				found = append(found, path)
			}
		}
	}
	return found
}

func ValidateCloudflaredPath(path string) tunnelValidateResult {
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	ensureTunnelLoaded()

	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		tunnelConfig.BinaryPath = ""
		if err := saveTunnelConfigLocked(); err != nil {
			return tunnelValidateResult{Valid: false, Error: err.Error()}
		}
		return tunnelValidateResult{Valid: true}
	}
	if _, err := os.Stat(trimmed); err != nil {
		return tunnelValidateResult{Valid: false, Error: "File not found: " + trimmed}
	}
	out, err := runCommandCapture(trimmed, []string{"--version"}, 5*time.Second)
	if err != nil {
		return tunnelValidateResult{Valid: false, Error: "File is not executable or not cloudflared: " + err.Error()}
	}
	combined := strings.TrimSpace(out)
	if !strings.Contains(strings.ToLower(combined), "cloudflared") {
		return tunnelValidateResult{Valid: false, Error: "Binary does not appear to be cloudflared"}
	}
	tunnelConfig.BinaryPath = trimmed
	if err := saveTunnelConfigLocked(); err != nil {
		return tunnelValidateResult{Valid: false, Error: err.Error()}
	}
	version := strings.SplitN(combined, "\n", 2)[0]
	return tunnelValidateResult{Valid: true, Version: version}
}

func IsCloudflaredInstalled() bool {
	bin := GetCloudflaredBin()
	out, err := runCommandCapture(bin, []string{"--version"}, 5*time.Second)
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(out), "cloudflared")
}

func GetCloudflaredVersion() string {
	bin := GetCloudflaredBin()
	out, err := runCommandCapture(bin, []string{"--version"}, 5*time.Second)
	if err != nil {
		return ""
	}
	line := strings.SplitN(strings.TrimSpace(out), "\n", 2)[0]
	return line
}

func runCommandCapture(name string, args []string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	configurePlatformProc(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if len(out) > 0 {
			return string(out), err
		}
		return "", err
	}
	return string(out), nil
}

func runCommandSync(name string, args []string, timeout time.Duration) (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	configurePlatformProc(cmd)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func StartQuickTunnel(port int) (TunnelState, error) {
	tunnelMu.Lock()
	ensureTunnelLoaded()
	if tunnelCmd != nil {
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, nil
	}
	if !cloudflaredInstalledLocked() {
		tunnelState.Status = "error"
		errMsg := "cloudflared not found. Set the binary path or install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
		tunnelState.Error = &errMsg
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, errors.New(errMsg)
	}
	tunnelState = TunnelState{Status: "starting", Mode: "quick"}
	_ = saveTunnelStateLocked()

	bin := getCloudflaredBinLocked()
	args := []string{"tunnel", "--url", fmt.Sprintf("http://localhost:%d", port), "--no-autoupdate"}
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, bin, args...)
	configurePlatformProc(cmd)
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		errMsg := err.Error()
		tunnelState.Status = "error"
		tunnelState.Error = &errMsg
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, err
	}
	stdoutPipe, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		cancel()
		errMsg := err.Error()
		tunnelState.Status = "error"
		tunnelState.Error = &errMsg
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, err
	}
	pid := cmd.Process.Pid
	tunnelState.PID = &pid
	_ = saveTunnelStateLocked()

	tunnelCmd = cmd
	tunnelCancel = cancel

	urlCh := make(chan string, 1)
	errCh := make(chan string, 1)
	bufRef := &strings.Builder{}
	go scanForTunnelURL(stderrPipe, urlCh, errCh, bufRef)
	if stdoutPipe != nil {
		go scanForTunnelURL(stdoutPipe, urlCh, errCh, bufRef)
	}
	tunnelMu.Unlock()

	select {
	case url := <-urlCh:
		tunnelMu.Lock()
		now := time.Now().UnixMilli()
		urlCopy := url
		tunnelState = TunnelState{
			Status:    "running",
			URL:       &urlCopy,
			Mode:      "quick",
			PID:       &pid,
			StartedAt: &now,
		}
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		go monitorTunnelExit(cmd, cancel)
		return state, nil
	case errMsg := <-errCh:
		tunnelMu.Lock()
		_ = killTunnelLocked()
		msg := errMsg
		tunnelState = TunnelState{Status: "error", Mode: "quick", Error: &msg}
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, errors.New(msg)
	case <-time.After(tunnelStartTO):
		tunnelMu.Lock()
		_ = killTunnelLocked()
		buf := bufRef.String()
		if len(buf) > 400 {
			buf = buf[len(buf)-400:]
		}
		msg := "Timeout waiting for tunnel URL (30s). Output: " + strings.TrimSpace(buf)
		tunnelState = TunnelState{Status: "error", Mode: "quick", Error: &msg}
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, errors.New(msg)
	}
}

func StartNamedTunnel(port int, hostname, tunnelName string) (TunnelState, error) {
	hostname = strings.TrimSpace(hostname)
	tunnelName = strings.TrimSpace(tunnelName)
	if hostname == "" {
		return GetTunnelState(), errors.New("hostname is required")
	}
	if tunnelName == "" {
		tunnelName = "kiro-cybxai"
	}

	tunnelMu.Lock()
	ensureTunnelLoaded()
	if tunnelCmd != nil {
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, nil
	}
	if !cloudflaredInstalledLocked() {
		errMsg := "cloudflared not found. Set the binary path or install cloudflared first."
		tunnelState.Status = "error"
		tunnelState.Error = &errMsg
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, errors.New(errMsg)
	}
	tunnelState = TunnelState{
		Status:     "starting",
		Mode:       "named",
		Hostname:   hostname,
		TunnelName: tunnelName,
	}
	_ = saveTunnelStateLocked()
	bin := getCloudflaredBinLocked()
	tunnelMu.Unlock()

	_, createErr, err := runCommandSync(bin, []string{"tunnel", "create", tunnelName}, 30*time.Second)
	if err != nil && !strings.Contains(strings.ToLower(createErr), "already exists") {
		if strings.Contains(strings.ToLower(createErr), "login") || strings.Contains(strings.ToLower(createErr), "certificate") {
			tunnelMu.Lock()
			msg := "Not authenticated. Run 'cloudflared login' first to authenticate with Cloudflare."
			tunnelState.Status = "error"
			tunnelState.Error = &msg
			_ = saveTunnelStateLocked()
			state := cloneTunnelState(tunnelState)
			tunnelMu.Unlock()
			return state, errors.New(msg)
		}
	}

	_, _, _ = runCommandSync(bin, []string{"tunnel", "route", "dns", tunnelName, hostname}, 30*time.Second)

	tunnelMu.Lock()
	ctx, cancel := context.WithCancel(context.Background())
	args := []string{"tunnel", "--url", fmt.Sprintf("http://localhost:%d", port), "--no-autoupdate", "run", tunnelName}
	cmd := exec.CommandContext(ctx, bin, args...)
	configurePlatformProc(cmd)
	if err := cmd.Start(); err != nil {
		cancel()
		errMsg := err.Error()
		tunnelState.Status = "error"
		tunnelState.Error = &errMsg
		_ = saveTunnelStateLocked()
		state := cloneTunnelState(tunnelState)
		tunnelMu.Unlock()
		return state, err
	}
	pid := cmd.Process.Pid
	now := time.Now().UnixMilli()
	url := "https://" + hostname
	tunnelState = TunnelState{
		Status:     "running",
		URL:        &url,
		Mode:       "named",
		Hostname:   hostname,
		TunnelName: tunnelName,
		PID:        &pid,
		StartedAt:  &now,
	}
	_ = saveTunnelStateLocked()
	tunnelCmd = cmd
	tunnelCancel = cancel
	state := cloneTunnelState(tunnelState)
	tunnelMu.Unlock()
	go monitorTunnelExit(cmd, cancel)
	return state, nil
}

func StopTunnel() TunnelState {
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	ensureTunnelLoaded()
	_ = killTunnelLocked()
	tunnelState.Status = "stopped"
	tunnelState.URL = nil
	tunnelState.PID = nil
	tunnelState.Error = nil
	_ = saveTunnelStateLocked()
	return cloneTunnelState(tunnelState)
}

func killTunnelLocked() error {
	if tunnelCancel != nil {
		tunnelCancel()
		tunnelCancel = nil
	}
	if tunnelCmd != nil && tunnelCmd.Process != nil {
		_ = tunnelCmd.Process.Kill()
	}
	tunnelCmd = nil
	return nil
}

func cloudflaredInstalledLocked() bool {
	bin := getCloudflaredBinLocked()
	out, err := runCommandCapture(bin, []string{"--version"}, 5*time.Second)
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(out), "cloudflared")
}

func scanForTunnelURL(reader io.Reader, urlCh chan<- string, errCh chan<- string, buf *strings.Builder) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		buf.WriteString(line)
		buf.WriteByte('\n')
		if match := tunnelURLRegexp.FindString(line); match != "" {
			select {
			case urlCh <- match:
			default:
			}
		}
	}
}

func monitorTunnelExit(cmd *exec.Cmd, cancel context.CancelFunc) {
	err := cmd.Wait()
	tunnelMu.Lock()
	defer tunnelMu.Unlock()
	if tunnelCmd != cmd {
		return
	}
	tunnelCmd = nil
	if tunnelCancel != nil {
		tunnelCancel()
		tunnelCancel = nil
	}
	_ = cancel
	tunnelState.Status = "stopped"
	tunnelState.URL = nil
	tunnelState.PID = nil
	if err != nil {
		msg := fmt.Sprintf("Process exited: %v", err)
		tunnelState.Error = &msg
	}
	_ = saveTunnelStateLocked()
}

func GetInstallInstructionsURL() string {
	return "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}
