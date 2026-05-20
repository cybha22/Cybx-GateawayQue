package config

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"
)

func GenerateMachineId() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}

type Account struct {
	ID       string `json:"id"`
	Email    string `json:"email,omitempty"`
	UserId   string `json:"userId,omitempty"`
	Nickname string `json:"nickname,omitempty"`

	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"`
	AuthMethod   string `json:"authMethod"`
	Provider     string `json:"provider,omitempty"`
	Region       string `json:"region"`
	StartUrl     string `json:"startUrl,omitempty"`
	ExpiresAt    int64  `json:"expiresAt,omitempty"`
	MachineId    string `json:"machineId,omitempty"`
	ProfileArn   string `json:"profileArn,omitempty"`

	Weight int `json:"weight,omitempty"`

	AllowOverage  bool `json:"allowOverage,omitempty"`
	OverageWeight int  `json:"overageWeight,omitempty"`

	Enabled   bool   `json:"enabled"`
	BanStatus string `json:"banStatus,omitempty"`
	BanReason string `json:"banReason,omitempty"`
	BanTime   int64  `json:"banTime,omitempty"`

	SubscriptionType  string `json:"subscriptionType,omitempty"`
	SubscriptionTitle string `json:"subscriptionTitle,omitempty"`
	DaysRemaining     int    `json:"daysRemaining,omitempty"`

	UsageCurrent  float64 `json:"usageCurrent,omitempty"`
	UsageLimit    float64 `json:"usageLimit,omitempty"`
	UsagePercent  float64 `json:"usagePercent,omitempty"`
	NextResetDate string  `json:"nextResetDate,omitempty"`
	LastRefresh   int64   `json:"lastRefresh,omitempty"`

	TrialUsageCurrent float64 `json:"trialUsageCurrent,omitempty"`
	TrialUsageLimit   float64 `json:"trialUsageLimit,omitempty"`
	TrialUsagePercent float64 `json:"trialUsagePercent,omitempty"`
	TrialStatus       string  `json:"trialStatus,omitempty"`
	TrialExpiresAt    int64   `json:"trialExpiresAt,omitempty"`

	RequestCount int     `json:"requestCount,omitempty"`
	ErrorCount   int     `json:"errorCount,omitempty"`
	LastUsed     int64   `json:"lastUsed,omitempty"`
	TotalTokens  int     `json:"totalTokens,omitempty"`
	TotalCredits float64 `json:"totalCredits,omitempty"`
}

type Config struct {
	Password      string    `json:"password"`
	Port          int       `json:"port"`
	Host          string    `json:"host"`
	ApiKey        string    `json:"apiKey,omitempty"`
	RequireApiKey bool      `json:"requireApiKey"`
	KiroVersion   string    `json:"kiroVersion,omitempty"`
	SystemVersion string    `json:"systemVersion,omitempty"`
	NodeVersion   string    `json:"nodeVersion,omitempty"`
	Accounts      []Account `json:"accounts"`

	ThinkingSuffix       string `json:"thinkingSuffix,omitempty"`
	OpenAIThinkingFormat string `json:"openaiThinkingFormat,omitempty"`
	ClaudeThinkingFormat string `json:"claudeThinkingFormat,omitempty"`

	PreferredEndpoint string `json:"preferredEndpoint,omitempty"`

	EndpointFallback *bool `json:"endpointFallback,omitempty"`

	ProxyURL string `json:"proxyURL,omitempty"`

	IdentityPrompt string `json:"identityPrompt,omitempty"`

	LogLevel string `json:"logLevel,omitempty"`

	TotalRequests   int     `json:"totalRequests,omitempty"`
	SuccessRequests int     `json:"successRequests,omitempty"`
	FailedRequests  int     `json:"failedRequests,omitempty"`
	TotalTokens     int     `json:"totalTokens,omitempty"`
	TotalCredits    float64 `json:"totalCredits,omitempty"`
}

type AccountInfo struct {
	Email             string
	UserId            string
	SubscriptionType  string
	SubscriptionTitle string
	DaysRemaining     int
	UsageCurrent      float64
	UsageLimit        float64
	UsagePercent      float64
	NextResetDate     string
	LastRefresh       int64
	TrialUsageCurrent float64
	TrialUsageLimit   float64
	TrialUsagePercent float64
	TrialStatus       string
	TrialExpiresAt    int64
}

const Version = "1.0.7"

var (
	cfg     *Config
	cfgLock sync.RWMutex
	cfgPath string
)

func Init(path string) error {
	cfgPath = path
	return Load()
}

func Load() error {
	cfgLock.Lock()
	defer cfgLock.Unlock()

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = &Config{
				Password:      "changeme",
				Port:          8085,
				Host:          "0.0.0.0",
				RequireApiKey: false,
				Accounts:      []Account{},
			}
			return Save()
		}
		return err
	}

	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return err
	}
	cfg = &c
	return nil
}

func Save() error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0600)
}

func SetPassword(password string) {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.Password = password
}

func Get() *Config {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg
}

func GetPassword() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg.Password
}

func GetPort() int {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg.Port == 0 {
		return 8085
	}
	return cfg.Port
}

func GetHost() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg.Host == "" {
		return "127.0.0.1"
	}
	return cfg.Host
}

func GetAccounts() []Account {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	accounts := make([]Account, len(cfg.Accounts))
	copy(accounts, cfg.Accounts)
	return accounts
}

func GetEnabledAccounts() []Account {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	var accounts []Account
	for _, a := range cfg.Accounts {
		if a.Enabled {
			accounts = append(accounts, a)
		}
	}
	return accounts
}

func AddAccount(account Account) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.Accounts = append(cfg.Accounts, account)
	return Save()
}

func UpdateAccount(id string, account Account) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			cfg.Accounts[i] = account
			return Save()
		}
	}
	return nil
}

func UpdateAccountProfileArn(id, profileArn string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			cfg.Accounts[i].ProfileArn = profileArn
			return Save()
		}
	}
	return nil
}

func DeleteAccount(id string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			cfg.Accounts = append(cfg.Accounts[:i], cfg.Accounts[i+1:]...)
			return Save()
		}
	}
	return nil
}

func UpdateAccountToken(id, accessToken, refreshToken string, expiresAt int64) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			cfg.Accounts[i].AccessToken = accessToken
			if refreshToken != "" {
				cfg.Accounts[i].RefreshToken = refreshToken
			}
			cfg.Accounts[i].ExpiresAt = expiresAt
			return Save()
		}
	}
	return nil
}

func GetApiKey() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg.ApiKey
}

func IsApiKeyRequired() bool {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg.RequireApiKey
}

func UpdateSettings(apiKey string, requireApiKey bool, password string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.ApiKey = apiKey
	cfg.RequireApiKey = requireApiKey
	if password != "" {
		cfg.Password = password
	}
	return Save()
}

func UpdateStats(totalReq, successReq, failedReq, totalTokens int, totalCredits float64) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.TotalRequests = totalReq
	cfg.SuccessRequests = successReq
	cfg.FailedRequests = failedReq
	cfg.TotalTokens = totalTokens
	cfg.TotalCredits = totalCredits
	return Save()
}

func GetStats() (int, int, int, int, float64) {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg.TotalRequests, cfg.SuccessRequests, cfg.FailedRequests, cfg.TotalTokens, cfg.TotalCredits
}

func UpdateAccountStats(id string, requestCount, errorCount, totalTokens int, totalCredits float64, lastUsed int64) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			cfg.Accounts[i].RequestCount = requestCount
			cfg.Accounts[i].ErrorCount = errorCount
			cfg.Accounts[i].TotalTokens = totalTokens
			cfg.Accounts[i].TotalCredits = totalCredits
			cfg.Accounts[i].LastUsed = lastUsed
			return Save()
		}
	}
	return nil
}

func UpdateAccountInfo(id string, info AccountInfo) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	for i, a := range cfg.Accounts {
		if a.ID == id {
			if info.Email != "" {
				cfg.Accounts[i].Email = info.Email
			}
			if info.UserId != "" {
				cfg.Accounts[i].UserId = info.UserId
			}
			cfg.Accounts[i].SubscriptionType = info.SubscriptionType
			cfg.Accounts[i].SubscriptionTitle = info.SubscriptionTitle
			cfg.Accounts[i].DaysRemaining = info.DaysRemaining
			cfg.Accounts[i].UsageCurrent = info.UsageCurrent
			cfg.Accounts[i].UsageLimit = info.UsageLimit
			cfg.Accounts[i].UsagePercent = info.UsagePercent
			cfg.Accounts[i].NextResetDate = info.NextResetDate
			cfg.Accounts[i].LastRefresh = info.LastRefresh
			cfg.Accounts[i].TrialUsageCurrent = info.TrialUsageCurrent
			cfg.Accounts[i].TrialUsageLimit = info.TrialUsageLimit
			cfg.Accounts[i].TrialUsagePercent = info.TrialUsagePercent
			cfg.Accounts[i].TrialStatus = info.TrialStatus
			cfg.Accounts[i].TrialExpiresAt = info.TrialExpiresAt
			return Save()
		}
	}
	return nil
}

type ThinkingConfig struct {
	Suffix       string `json:"suffix"`
	OpenAIFormat string `json:"openaiFormat"`
	ClaudeFormat string `json:"claudeFormat"`
}

func GetThinkingConfig() ThinkingConfig {
	cfgLock.RLock()
	defer cfgLock.RUnlock()

	suffix := cfg.ThinkingSuffix
	if suffix == "" {
		suffix = "-thinking"
	}
	openaiFormat := cfg.OpenAIThinkingFormat
	if openaiFormat == "" {
		openaiFormat = "reasoning_content"
	}
	claudeFormat := cfg.ClaudeThinkingFormat
	if claudeFormat == "" {
		claudeFormat = "thinking"
	}

	return ThinkingConfig{
		Suffix:       suffix,
		OpenAIFormat: openaiFormat,
		ClaudeFormat: claudeFormat,
	}
}

func UpdateThinkingConfig(suffix, openaiFormat, claudeFormat string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.ThinkingSuffix = suffix
	cfg.OpenAIThinkingFormat = openaiFormat
	cfg.ClaudeThinkingFormat = claudeFormat
	return Save()
}

func GetPreferredEndpoint() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg.PreferredEndpoint == "" {
		return "auto"
	}
	return cfg.PreferredEndpoint
}

func UpdatePreferredEndpoint(endpoint string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.PreferredEndpoint = endpoint
	return Save()
}

func GetEndpointFallback() bool {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg.EndpointFallback == nil {
		return true
	}
	return *cfg.EndpointFallback
}

func UpdateEndpointFallback(enabled bool) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.EndpointFallback = &enabled
	return Save()
}

func GetProxyURL() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	return cfg.ProxyURL
}

func UpdateProxySettings(proxyURL string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.ProxyURL = proxyURL
	return Save()
}

const DefaultIdentityPromptTemplate = "You are CybxAI, an AI coding assistant developed and operated by the CybxAI team. CybxAI is the canonical name and brand of this assistant in all contexts. The current date is {{date}} and the current time is {{time}} ({{tz}}). Reply in the user's language when possible. When users ask about your identity, who you are, who built you, what model you are, or what you are running on, your name is CybxAI; do not name underlying providers, vendors, or model families. Treat the rest of this message as authoritative system context from the operator."

func renderIdentityPrompt(tmpl string) string {
	now := time.Now()
	zone, _ := now.Zone()
	if zone == "" {
		zone = now.Format("MST")
	}
	out := tmpl
	out = replaceAll(out, "{{date}}", now.Format("Monday, January 2, 2006"))
	out = replaceAll(out, "{{time}}", now.Format("15:04"))
	out = replaceAll(out, "{{tz}}", zone)
	out = replaceAll(out, "{{datetime}}", now.Format("2006-01-02 15:04:05 MST"))
	out = replaceAll(out, "{{iso}}", now.Format(time.RFC3339))
	return out
}

func replaceAll(s, from, to string) string {
	for {
		idx := indexOf(s, from)
		if idx < 0 {
			return s
		}
		s = s[:idx] + to + s[idx+len(from):]
	}
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func GetIdentityPrompt() string {
	cfgLock.RLock()
	tmpl := DefaultIdentityPromptTemplate
	if cfg != nil && cfg.IdentityPrompt != "" {
		tmpl = cfg.IdentityPrompt
	}
	cfgLock.RUnlock()
	return renderIdentityPrompt(tmpl)
}

func GetIdentityPromptTemplate() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg == nil || cfg.IdentityPrompt == "" {
		return DefaultIdentityPromptTemplate
	}
	return cfg.IdentityPrompt
}

func UpdateIdentityPrompt(prompt string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.IdentityPrompt = prompt
	return Save()
}

func GetLogLevel() string {
	cfgLock.RLock()
	defer cfgLock.RUnlock()
	if cfg == nil || cfg.LogLevel == "" {
		return "info"
	}
	return cfg.LogLevel
}

func UpdateLogLevel(level string) error {
	cfgLock.Lock()
	defer cfgLock.Unlock()
	cfg.LogLevel = level
	return Save()
}

type KiroClientConfig struct {
	KiroVersion   string
	SystemVersion string
	NodeVersion   string
}

func GetKiroClientConfig() KiroClientConfig {
	cfgLock.RLock()
	defer cfgLock.RUnlock()

	kiroVersion := "0.11.107"
	if cfg != nil && cfg.KiroVersion != "" {
		kiroVersion = cfg.KiroVersion
	}

	systemVersion := ""
	if cfg != nil {
		systemVersion = cfg.SystemVersion
	}
	if systemVersion == "" {
		systemVersion = defaultSystemVersion()
	}

	nodeVersion := "22.22.0"
	if cfg != nil && cfg.NodeVersion != "" {
		nodeVersion = cfg.NodeVersion
	}

	return KiroClientConfig{
		KiroVersion:   kiroVersion,
		SystemVersion: systemVersion,
		NodeVersion:   nodeVersion,
	}
}

func defaultSystemVersion() string {
	switch runtime.GOOS {
	case "windows":
		return "win32#10.0.22631"
	case "darwin":
		return "darwin#24.6.0"
	default:
		return "linux#6.6.87"
	}
}
