package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	xproxy "golang.org/x/net/proxy"
)

type ProxyEntry struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Status      string `json:"status"`
	PingMs      *int   `json:"pingMs"`
	LastChecked *int64 `json:"lastChecked"`
	FailCount   int    `json:"failCount"`
	AddedAt     int64  `json:"addedAt"`
	Label       string `json:"label,omitempty"`
}

type ProxyApplyTo struct {
	Kiro       bool `json:"kiro"`
	CbUpstream bool `json:"cb-upstream"`
	Cline      bool `json:"cline"`
	Qoder      bool `json:"qoder"`
	Codex      bool `json:"codex"`
	AutoLogin  bool `json:"auto-login"`
}

type ProxyAutoTest struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"intervalMinutes"`
}

type ProxySettings struct {
	ProxyURL         string          `json:"proxyURL,omitempty"`
	ApplyTo          map[string]bool `json:"applyTo"`
	AutoTest         ProxyAutoTest   `json:"autoTest"`
	AutoDeleteFailed bool            `json:"autoDeleteFailed"`
}

type proxyDbSchema struct {
	Proxies []ProxyEntry `json:"proxies"`
}

type proxyBatchResult struct {
	Added      int `json:"added"`
	Duplicates int `json:"duplicates"`
	Invalid    int `json:"invalid"`
}

const (
	proxyPoolFile      = "data/proxies.json"
	proxySettingsFile  = "data/proxy-settings.json"
	proxyHealthURL     = "http://httpbin.org/ip"
	proxyHealthTimeout = 10 * time.Second
	proxyMaxFailCount  = 3
)

var (
	proxyURLRe          = regexp.MustCompile(`^(http|https|socks4|socks5)://.+`)
	proxyAuthHostPortRe = regexp.MustCompile(`^[^\s:@]+:[^\s@]+@[^\s:@]+:\d{1,5}$`)
)

var (
	proxyMu       sync.Mutex
	proxyCache    *proxyDbSchema
	proxySettings *ProxySettings
	proxyStateMu  sync.Mutex
)

func defaultProxySettings() *ProxySettings {
	return &ProxySettings{
		ApplyTo: map[string]bool{
			"kiro":        true,
			"cb-upstream": false,
			"cline":       false,
			"qoder":       false,
			"codex":       false,
			"auto-login":  false,
		},
		AutoTest:         ProxyAutoTest{Enabled: false, IntervalMinutes: 5},
		AutoDeleteFailed: false,
	}
}

func ensureProxyDataDir() error {
	return os.MkdirAll(filepath.Dir(proxyPoolFile), 0755)
}

func LoadProxies() ([]ProxyEntry, error) {
	proxyMu.Lock()
	defer proxyMu.Unlock()
	if proxyCache != nil {
		out := make([]ProxyEntry, len(proxyCache.Proxies))
		copy(out, proxyCache.Proxies)
		return out, nil
	}
	if err := ensureProxyDataDir(); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(proxyPoolFile)
	if err != nil {
		if os.IsNotExist(err) {
			proxyCache = &proxyDbSchema{Proxies: []ProxyEntry{}}
			return []ProxyEntry{}, nil
		}
		return nil, err
	}
	var schema proxyDbSchema
	if err := json.Unmarshal(data, &schema); err != nil {
		proxyCache = &proxyDbSchema{Proxies: []ProxyEntry{}}
		return []ProxyEntry{}, nil
	}
	if schema.Proxies == nil {
		schema.Proxies = []ProxyEntry{}
	}
	proxyCache = &schema
	out := make([]ProxyEntry, len(schema.Proxies))
	copy(out, schema.Proxies)
	return out, nil
}

func SaveProxies() error {
	if proxyCache == nil {
		proxyCache = &proxyDbSchema{Proxies: []ProxyEntry{}}
	}
	if err := ensureProxyDataDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(proxyCache, "", "  ")
	if err != nil {
		return err
	}
	tmp := proxyPoolFile + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, proxyPoolFile)
}

func saveProxiesLocked() error {
	return SaveProxies()
}

func isValidProxyURL(s string) bool {
	return proxyURLRe.MatchString(s)
}

func normalizeProxyURL(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}
	if isValidProxyURL(trimmed) {
		return trimmed, true
	}
	if proxyAuthHostPortRe.MatchString(trimmed) {
		return "http://" + trimmed, true
	}
	return "", false
}

func GetProxies() []ProxyEntry {
	entries, _ := LoadProxies()
	return entries
}

func AddProxy(rawURL, label string) (ProxyEntry, error) {
	normalized, ok := normalizeProxyURL(rawURL)
	if !ok {
		return ProxyEntry{}, fmt.Errorf("invalid proxy URL: %s", strings.TrimSpace(rawURL))
	}
	if _, err := LoadProxies(); err != nil {
		return ProxyEntry{}, err
	}
	proxyMu.Lock()
	defer proxyMu.Unlock()
	for _, existing := range proxyCache.Proxies {
		if existing.URL == normalized {
			return existing, nil
		}
	}
	entry := ProxyEntry{
		ID:        uuid.NewString(),
		URL:       normalized,
		Status:    "active",
		FailCount: 0,
		AddedAt:   time.Now().UnixMilli(),
		Label:     strings.TrimSpace(label),
	}
	proxyCache.Proxies = append(proxyCache.Proxies, entry)
	if err := saveProxiesLocked(); err != nil {
		return ProxyEntry{}, err
	}
	return entry, nil
}

func BatchAddProxies(text string) (proxyBatchResult, error) {
	if _, err := LoadProxies(); err != nil {
		return proxyBatchResult{}, err
	}
	proxyMu.Lock()
	defer proxyMu.Unlock()
	result := proxyBatchResult{}
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	existing := make(map[string]struct{}, len(proxyCache.Proxies))
	for _, p := range proxyCache.Proxies {
		existing[p.URL] = struct{}{}
	}
	now := time.Now().UnixMilli()
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		normalized, ok := normalizeProxyURL(line)
		if !ok {
			result.Invalid++
			continue
		}
		if _, dup := existing[normalized]; dup {
			result.Duplicates++
			continue
		}
		existing[normalized] = struct{}{}
		entry := ProxyEntry{
			ID:        uuid.NewString(),
			URL:       normalized,
			Status:    "active",
			FailCount: 0,
			AddedAt:   now,
		}
		proxyCache.Proxies = append(proxyCache.Proxies, entry)
		result.Added++
	}
	if result.Added > 0 {
		if err := saveProxiesLocked(); err != nil {
			return result, err
		}
	}
	return result, nil
}

func RemoveProxy(id string) error {
	if _, err := LoadProxies(); err != nil {
		return err
	}
	proxyMu.Lock()
	defer proxyMu.Unlock()
	out := proxyCache.Proxies[:0]
	for _, p := range proxyCache.Proxies {
		if p.ID != id {
			out = append(out, p)
		}
	}
	proxyCache.Proxies = out
	return saveProxiesLocked()
}

func RemoveDeadProxies() (int, error) {
	if _, err := LoadProxies(); err != nil {
		return 0, err
	}
	proxyMu.Lock()
	defer proxyMu.Unlock()
	before := len(proxyCache.Proxies)
	out := proxyCache.Proxies[:0]
	for _, p := range proxyCache.Proxies {
		if p.Status != "dead" {
			out = append(out, p)
		}
	}
	proxyCache.Proxies = out
	removed := before - len(proxyCache.Proxies)
	if removed > 0 {
		if err := saveProxiesLocked(); err != nil {
			return removed, err
		}
	}
	return removed, nil
}

func RemoveAllProxies() (int, error) {
	if _, err := LoadProxies(); err != nil {
		return 0, err
	}
	proxyMu.Lock()
	defer proxyMu.Unlock()
	count := len(proxyCache.Proxies)
	proxyCache.Proxies = []ProxyEntry{}
	if count > 0 {
		if err := saveProxiesLocked(); err != nil {
			return count, err
		}
	}
	return count, nil
}

func GetRandomProxy() string {
	entries, _ := LoadProxies()
	active := make([]ProxyEntry, 0, len(entries))
	for _, p := range entries {
		if p.Status == "active" {
			active = append(active, p)
		}
	}
	if len(active) == 0 {
		return ""
	}
	idx := int(time.Now().UnixNano()) % len(active)
	if idx < 0 {
		idx = -idx
	}
	return active[idx].URL
}

func newProxyHTTPClient(proxyURL string, timeout time.Duration) (*http.Client, error) {
	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}
	transport := &http.Transport{
		ResponseHeaderTimeout: timeout,
		TLSHandshakeTimeout:   timeout,
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
		transport.Proxy = http.ProxyURL(parsed)
	case "socks5", "socks4":
		var auth *xproxy.Auth
		if parsed.User != nil {
			pwd, _ := parsed.User.Password()
			auth = &xproxy.Auth{User: parsed.User.Username(), Password: pwd}
		}
		dialer, err := xproxy.SOCKS5("tcp", parsed.Host, auth, &net.Dialer{Timeout: timeout})
		if err != nil {
			return nil, err
		}
		transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			if cd, ok := dialer.(xproxy.ContextDialer); ok {
				return cd.DialContext(ctx, network, addr)
			}
			return dialer.Dial(network, addr)
		}
	default:
		return nil, fmt.Errorf("unsupported proxy scheme: %s", parsed.Scheme)
	}
	return &http.Client{Transport: transport, Timeout: timeout}, nil
}

func runProxyHealthCheck(proxyURL string, timeout time.Duration) (bool, int) {
	client, err := newProxyHTTPClient(proxyURL, timeout)
	if err != nil {
		return false, 0
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, proxyHealthURL, nil)
	if err != nil {
		return false, 0
	}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return false, 0
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, 0
	}
	return true, int(time.Since(start).Milliseconds())
}

func CheckProxy(id string) (bool, *int, error) {
	if _, err := LoadProxies(); err != nil {
		return false, nil, err
	}
	proxyMu.Lock()
	idx := -1
	for i, p := range proxyCache.Proxies {
		if p.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		proxyMu.Unlock()
		return false, nil, fmt.Errorf("proxy not found: %s", id)
	}
	proxyCache.Proxies[idx].Status = "checking"
	url := proxyCache.Proxies[idx].URL
	if err := saveProxiesLocked(); err != nil {
		proxyMu.Unlock()
		return false, nil, err
	}
	proxyMu.Unlock()

	alive, ping := runProxyHealthCheck(url, proxyHealthTimeout)

	proxyMu.Lock()
	defer proxyMu.Unlock()
	idx = -1
	for i, p := range proxyCache.Proxies {
		if p.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return alive, nil, nil
	}
	now := time.Now().UnixMilli()
	proxyCache.Proxies[idx].LastChecked = &now
	if alive {
		p := ping
		proxyCache.Proxies[idx].PingMs = &p
		proxyCache.Proxies[idx].Status = "active"
		proxyCache.Proxies[idx].FailCount = 0
	} else {
		proxyCache.Proxies[idx].PingMs = nil
		proxyCache.Proxies[idx].FailCount++
		if proxyCache.Proxies[idx].FailCount >= proxyMaxFailCount {
			proxyCache.Proxies[idx].Status = "dead"
		} else {
			proxyCache.Proxies[idx].Status = "active"
		}
	}
	if err := saveProxiesLocked(); err != nil {
		return alive, nil, err
	}
	if alive {
		p := ping
		return true, &p, nil
	}
	return false, nil, nil
}

func CheckAllProxies() error {
	entries, err := LoadProxies()
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}

	proxyMu.Lock()
	for i := range proxyCache.Proxies {
		proxyCache.Proxies[i].Status = "checking"
	}
	if err := saveProxiesLocked(); err != nil {
		proxyMu.Unlock()
		return err
	}
	snapshot := make([]ProxyEntry, len(proxyCache.Proxies))
	copy(snapshot, proxyCache.Proxies)
	proxyMu.Unlock()

	type result struct {
		id    string
		alive bool
		ping  int
	}
	resultsCh := make(chan result, len(snapshot))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 50)
	for _, entry := range snapshot {
		wg.Add(1)
		sem <- struct{}{}
		go func(e ProxyEntry) {
			defer wg.Done()
			defer func() { <-sem }()
			alive, ping := runProxyHealthCheck(e.URL, proxyHealthTimeout)
			resultsCh <- result{id: e.ID, alive: alive, ping: ping}
		}(entry)
	}
	wg.Wait()
	close(resultsCh)

	resultsMap := make(map[string]result, len(snapshot))
	for r := range resultsCh {
		resultsMap[r.id] = r
	}

	proxyMu.Lock()
	defer proxyMu.Unlock()
	now := time.Now().UnixMilli()
	for i := range proxyCache.Proxies {
		r, ok := resultsMap[proxyCache.Proxies[i].ID]
		if !ok {
			continue
		}
		proxyCache.Proxies[i].LastChecked = &now
		if r.alive {
			p := r.ping
			proxyCache.Proxies[i].PingMs = &p
			proxyCache.Proxies[i].Status = "active"
			proxyCache.Proxies[i].FailCount = 0
		} else {
			proxyCache.Proxies[i].PingMs = nil
			proxyCache.Proxies[i].FailCount++
			if proxyCache.Proxies[i].FailCount >= proxyMaxFailCount {
				proxyCache.Proxies[i].Status = "dead"
			} else {
				proxyCache.Proxies[i].Status = "active"
			}
		}
	}
	return saveProxiesLocked()
}

func LoadProxySettings() *ProxySettings {
	proxyStateMu.Lock()
	defer proxyStateMu.Unlock()
	if proxySettings != nil {
		return cloneProxySettings(proxySettings)
	}
	if err := os.MkdirAll(filepath.Dir(proxySettingsFile), 0755); err != nil {
		proxySettings = defaultProxySettings()
		return cloneProxySettings(proxySettings)
	}
	data, err := os.ReadFile(proxySettingsFile)
	if err != nil {
		proxySettings = defaultProxySettings()
		return cloneProxySettings(proxySettings)
	}
	var s ProxySettings
	if err := json.Unmarshal(data, &s); err != nil {
		proxySettings = defaultProxySettings()
		return cloneProxySettings(proxySettings)
	}
	merged := defaultProxySettings()
	if s.ApplyTo != nil {
		for k, v := range s.ApplyTo {
			merged.ApplyTo[k] = v
		}
	}
	if s.AutoTest.IntervalMinutes > 0 {
		merged.AutoTest.IntervalMinutes = s.AutoTest.IntervalMinutes
	}
	merged.AutoTest.Enabled = s.AutoTest.Enabled
	merged.AutoDeleteFailed = s.AutoDeleteFailed
	merged.ProxyURL = s.ProxyURL
	proxySettings = merged
	return cloneProxySettings(proxySettings)
}

func cloneProxySettings(s *ProxySettings) *ProxySettings {
	if s == nil {
		return defaultProxySettings()
	}
	cp := &ProxySettings{
		ProxyURL:         s.ProxyURL,
		AutoTest:         s.AutoTest,
		AutoDeleteFailed: s.AutoDeleteFailed,
		ApplyTo:          make(map[string]bool, len(s.ApplyTo)),
	}
	for k, v := range s.ApplyTo {
		cp.ApplyTo[k] = v
	}
	return cp
}

type ProxySettingsUpdate struct {
	ProxyURL         *string         `json:"proxyURL,omitempty"`
	ApplyTo          map[string]bool `json:"applyTo,omitempty"`
	AutoTest         *ProxyAutoTest  `json:"autoTest,omitempty"`
	AutoDeleteFailed *bool           `json:"autoDeleteFailed,omitempty"`
}

func SaveProxySettings(update ProxySettingsUpdate) (*ProxySettings, error) {
	current := LoadProxySettings()
	if update.ProxyURL != nil {
		current.ProxyURL = *update.ProxyURL
	}
	if update.ApplyTo != nil {
		for k, v := range update.ApplyTo {
			current.ApplyTo[k] = v
		}
	}
	if update.AutoTest != nil {
		current.AutoTest = *update.AutoTest
	}
	if update.AutoDeleteFailed != nil {
		current.AutoDeleteFailed = *update.AutoDeleteFailed
	}

	proxyStateMu.Lock()
	proxySettings = cloneProxySettings(current)
	data, err := json.MarshalIndent(proxySettings, "", "  ")
	if err != nil {
		proxyStateMu.Unlock()
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(proxySettingsFile), 0755); err != nil {
		proxyStateMu.Unlock()
		return nil, err
	}
	tmp := proxySettingsFile + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		proxyStateMu.Unlock()
		return nil, err
	}
	if err := os.Rename(tmp, proxySettingsFile); err != nil {
		proxyStateMu.Unlock()
		return nil, err
	}
	out := cloneProxySettings(proxySettings)
	proxyStateMu.Unlock()
	return out, nil
}
