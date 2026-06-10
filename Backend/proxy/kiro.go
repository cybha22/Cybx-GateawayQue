package proxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"kiro-go/config"
	"kiro-go/logger"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

type kiroEndpoint struct {
	URL       string
	Origin    string
	AmzTarget string
	Name      string
	Runtime   bool
}

var kiroEndpoints = []kiroEndpoint{
	{
		URL:       "https://runtime.{region}.kiro.dev/generateAssistantResponse",
		Origin:    "AI_EDITOR",
		AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
		Name:      "Kiro Runtime",
		Runtime:   true,
	},
	{
		URL:       "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
		Origin:    "AI_EDITOR",
		AmzTarget: "",
		Name:      "Kiro IDE",
	},
	{
		URL:       "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
		Origin:    "AI_EDITOR",
		AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
		Name:      "CodeWhisperer",
	},
	{
		URL:       "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
		Origin:    "AI_EDITOR",
		AmzTarget: "AmazonQDeveloperStreamingService.SendMessage",
		Name:      "AmazonQ",
	},
}

type kiroHTTPError struct {
	StatusCode int
	Endpoint   string
	Body       string
	RetryAfter time.Duration
}

func (e *kiroHTTPError) Error() string {
	if e == nil {
		return ""
	}
	body := strings.TrimSpace(e.Body)
	if len(body) > 500 {
		body = body[:500] + "..."
	}
	if body != "" {
		return fmt.Sprintf("HTTP %d from %s: %s", e.StatusCode, e.Endpoint, body)
	}
	return fmt.Sprintf("HTTP %d from %s", e.StatusCode, e.Endpoint)
}

func parseRetryAfterHeader(value string) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		if seconds <= 0 {
			return 0
		}
		return time.Duration(seconds) * time.Second
	}
	parsed, err := http.ParseTime(value)
	if err != nil {
		return 0
	}
	delay := time.Until(parsed)
	if delay <= 0 {
		return 0
	}
	return delay
}

func capRetryDelay(delay time.Duration) time.Duration {
	if delay > 30*time.Second {
		return 30 * time.Second
	}
	return delay
}

func isKiroRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode == http.StatusTooManyRequests
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "429") || strings.Contains(lower, "rate-limited")
}

func isKiroQuotaError(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) {
		return containsKiroQuotaSignal(httpErr.Body)
	}
	return containsKiroQuotaSignal(err.Error())
}

func isKiroTemporaryLimitError(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) {
		return containsKiroTemporaryLimitSignal(httpErr.Body)
	}
	return containsKiroTemporaryLimitSignal(err.Error())
}

func containsKiroQuotaSignal(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "quota") ||
		strings.Contains(lower, "exhaust") ||
		strings.Contains(lower, "usage limit") ||
		strings.Contains(lower, "limit_exceeded") ||
		strings.Contains(lower, "subscription limit")
}

func containsKiroTemporaryLimitSignal(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "suspicious activity") ||
		strings.Contains(lower, "temporary limits") ||
		strings.Contains(lower, "temporarily limited")
}

func kiroRetryAfter(err error) time.Duration {
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.RetryAfter
	}
	return 0
}

func kiroErrorStatus(err error, fallback int) int {
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) && httpErr.StatusCode > 0 {
		return httpErr.StatusCode
	}
	if isKiroRateLimitError(err) {
		return http.StatusTooManyRequests
	}
	return fallback
}

func kiroOpenAIErrorType(err error) string {
	if isKiroRateLimitError(err) {
		return "rate_limit_error"
	}
	return "server_error"
}

func kiroClaudeErrorType(err error) string {
	if isKiroRateLimitError(err) {
		return "rate_limit_error"
	}
	return "api_error"
}

func kiroAccountCooldown(err error) time.Duration {
	if retryAfter := kiroRetryAfter(err); retryAfter > 0 {
		return retryAfter
	}
	if isKiroTemporaryLimitError(err) {
		return 10 * time.Minute
	}
	if isKiroRateLimitError(err) {
		return time.Minute
	}
	if isKiroQuotaError(err) {
		return time.Hour
	}
	return 0
}

func isKiroAccountFailoverError(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *kiroHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode == http.StatusTooManyRequests ||
			httpErr.StatusCode == http.StatusPaymentRequired ||
			httpErr.StatusCode == http.StatusUnauthorized ||
			httpErr.StatusCode == http.StatusForbidden ||
			httpErr.StatusCode >= http.StatusInternalServerError
	}
	if isKiroRateLimitError(err) || isKiroTemporaryLimitError(err) || isKiroQuotaError(err) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "unauthorized") ||
		strings.Contains(lower, "forbidden") ||
		strings.Contains(lower, "overage") ||
		strings.Contains(lower, "status 401") ||
		strings.Contains(lower, "status 403") ||
		strings.Contains(lower, "status 402") ||
		strings.Contains(lower, "status 5") ||
		strings.Contains(lower, "http 5")
}

var kiroHttpStore atomic.Pointer[http.Client]
var kiroRestHttpStore atomic.Pointer[http.Client]
var proxyClientCache sync.Map

func init() {
	InitKiroHttpClient("")
}

func GetClientForProxy(proxyURL string) *http.Client {
	if proxyURL == "" {
		return kiroHttpStore.Load()
	}
	if cached, ok := proxyClientCache.Load(proxyURL); ok {
		return cached.(*http.Client)
	}
	client := &http.Client{
		Timeout:   5 * time.Minute,
		Transport: buildKiroTransport(proxyURL),
	}
	proxyClientCache.Store(proxyURL, client)
	return client
}

func GetRestClientForProxy(proxyURL string) *http.Client {
	if proxyURL == "" {
		return kiroRestHttpStore.Load()
	}
	cacheKey := "rest:" + proxyURL
	if cached, ok := proxyClientCache.Load(cacheKey); ok {
		return cached.(*http.Client)
	}
	client := &http.Client{
		Timeout:   30 * time.Second,
		Transport: buildKiroTransport(proxyURL),
	}
	proxyClientCache.Store(cacheKey, client)
	return client
}

func ResolveAccountProxyURL(account *config.Account) string {
	if account != nil && strings.TrimSpace(account.ProxyURL) != "" {
		return strings.TrimSpace(account.ProxyURL)
	}
	return config.GetProxyURL()
}

func buildKiroTransport(proxyURL string) *http.Transport {
	t := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
		ForceAttemptHTTP2:   true,
	}
	if proxyURL != "" {
		if u, err := url.Parse(proxyURL); err == nil {
			t.Proxy = http.ProxyURL(u)
			t.ForceAttemptHTTP2 = false
		}
	} else {
		t.Proxy = http.ProxyFromEnvironment
	}
	return t
}

func InitKiroHttpClient(proxyURL string) {
	client := &http.Client{
		Timeout:   5 * time.Minute,
		Transport: buildKiroTransport(proxyURL),
	}
	kiroHttpStore.Store(client)

	restClient := &http.Client{
		Timeout:   30 * time.Second,
		Transport: buildKiroTransport(proxyURL),
	}
	kiroRestHttpStore.Store(restClient)
}

type KiroPayload struct {
	ConversationState struct {
		AgentContinuationId string `json:"agentContinuationId,omitempty"`
		AgentTaskType       string `json:"agentTaskType,omitempty"`
		ChatTriggerType     string `json:"chatTriggerType"`
		ConversationID      string `json:"conversationId"`
		CurrentMessage      struct {
			UserInputMessage KiroUserInputMessage `json:"userInputMessage"`
		} `json:"currentMessage"`
		History []KiroHistoryMessage `json:"history,omitempty"`
	} `json:"conversationState"`
	ProfileArn      string           `json:"profileArn,omitempty"`
	InferenceConfig *InferenceConfig `json:"inferenceConfig,omitempty"`

	ToolNameMap map[string]string `json:"-"`
}

type KiroUserInputMessage struct {
	Content                 string                   `json:"content"`
	ModelID                 string                   `json:"modelId,omitempty"`
	Origin                  string                   `json:"origin"`
	Images                  []KiroImage              `json:"images,omitempty"`
	UserInputMessageContext *UserInputMessageContext `json:"userInputMessageContext,omitempty"`
}

type UserInputMessageContext struct {
	Tools       []KiroToolWrapper `json:"tools,omitempty"`
	ToolResults []KiroToolResult  `json:"toolResults,omitempty"`
}

type KiroToolWrapper struct {
	ToolSpecification struct {
		Name        string      `json:"name"`
		Description string      `json:"description"`
		InputSchema InputSchema `json:"inputSchema"`
	} `json:"toolSpecification"`
}

type InputSchema struct {
	JSON interface{} `json:"json"`
}

type KiroToolResult struct {
	ToolUseID string              `json:"toolUseId"`
	Content   []KiroResultContent `json:"content"`
	Status    string              `json:"status"`
}

type KiroResultContent struct {
	Text string `json:"text"`
}

type KiroImage struct {
	Format string `json:"format"`
	Source struct {
		Bytes string `json:"bytes"`
	} `json:"source"`
}

type KiroHistoryMessage struct {
	UserInputMessage         *KiroUserInputMessage         `json:"userInputMessage,omitempty"`
	AssistantResponseMessage *KiroAssistantResponseMessage `json:"assistantResponseMessage,omitempty"`
}

type KiroAssistantResponseMessage struct {
	Content  string        `json:"content"`
	ToolUses []KiroToolUse `json:"toolUses,omitempty"`
}

type KiroToolUse struct {
	ToolUseID string                 `json:"toolUseId"`
	Name      string                 `json:"name"`
	Input     map[string]interface{} `json:"input"`
}

type InferenceConfig struct {
	MaxTokens   int     `json:"maxTokens,omitempty"`
	Temperature float64 `json:"temperature,omitempty"`
	TopP        float64 `json:"topP,omitempty"`
}

type KiroStreamCallback struct {
	OnText         func(text string, isThinking bool)
	OnToolUse      func(toolUse KiroToolUse)
	OnComplete     func(inputTokens, outputTokens int)
	OnError        func(err error)
	OnCredits      func(credits float64)
	OnContextUsage func(percentage float64)
}

func getSortedEndpoints(preferred string) []kiroEndpoint {
	fallback := config.GetEndpointFallback()

	var primary int
	switch preferred {
	case "runtime":
		primary = 0
	case "kiro":
		primary = 1
	case "codewhisperer":
		primary = 2
	case "amazonq":
		primary = 3
	default:
		return []kiroEndpoint{kiroEndpoints[0]}
	}

	if !fallback || primary == 0 {
		return []kiroEndpoint{kiroEndpoints[primary]}
	}

	result := []kiroEndpoint{kiroEndpoints[primary]}
	for i, ep := range kiroEndpoints {
		if i != primary {
			if i == 3 && primary != 3 {
				continue
			}
			result = append(result, ep)
		}
	}
	return result
}

func getTemporaryLimitFallbackEndpoint(current kiroEndpoint) (kiroEndpoint, bool) {
	if !current.Runtime {
		return kiroEndpoint{}, false
	}
	for _, ep := range kiroEndpoints {
		if ep.Runtime {
			continue
		}
		if strings.Contains(strings.ToLower(ep.URL), "codewhisperer.") {
			return ep, true
		}
	}
	return kiroEndpoint{}, false
}

func resolveKiroEndpointURL(ep kiroEndpoint, account *config.Account) string {
	region := "us-east-1"
	if account != nil && strings.TrimSpace(account.Region) != "" {
		region = strings.TrimSpace(account.Region)
	}
	return strings.ReplaceAll(ep.URL, "{region}", region)
}

func CallKiroAPI(account *config.Account, payload *KiroPayload, callback *KiroStreamCallback) error {
	if _, err := json.Marshal(payload); err != nil {
		return err
	}

	if payloadJSON, err := json.Marshal(payload); err == nil {
		logger.Debugf("[KiroAPI] Request payload: %s", string(payloadJSON))
	}

	if callback != nil && callback.OnToolUse != nil && len(payload.ToolNameMap) > 0 {
		originalOnToolUse := callback.OnToolUse
		nameMap := payload.ToolNameMap
		wrapped := *callback
		wrapped.OnToolUse = func(tu KiroToolUse) {
			if original, ok := nameMap[tu.Name]; ok {
				tu.Name = original
			}
			originalOnToolUse(tu)
		}
		callback = &wrapped
	}

	if payload != nil && strings.TrimSpace(payload.ProfileArn) == "" {
		if profileArn, err := ResolveProfileArn(account); err == nil {
			payload.ProfileArn = profileArn
		} else {
			accountEmail := "<nil>"
			if account != nil {
				accountEmail = account.Email
			}
			logger.Warnf("[ProfileArn] Failed to resolve profile ARN for %s: %v", accountEmail, err)
		}
	}

	endpoints := getSortedEndpoints(config.GetPreferredEndpoint())

	var lastErr error
	for _, ep := range endpoints {
		err := callKiroEndpoint(account, payload, callback, ep)
		if err == nil {
			return nil
		}
		lastErr = err
		if isKiroTemporaryLimitError(err) {
			if fallbackEndpoint, ok := getTemporaryLimitFallbackEndpoint(ep); ok {
				logger.Warnf("[KiroAPI] Endpoint %s temporarily limited, trying %s with the same account", ep.Name, fallbackEndpoint.Name)
				fallbackErr := callKiroEndpoint(account, payload, callback, fallbackEndpoint)
				if fallbackErr == nil {
					return nil
				}
				return fallbackErr
			}
		}
		if isKiroRateLimitError(err) {
			return err
		}
		var httpErr *kiroHTTPError
		if errors.As(err, &httpErr) && (httpErr.StatusCode == 401 || httpErr.StatusCode == 402 || httpErr.StatusCode == 403) {
			return err
		}
	}

	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("all endpoints failed")
}

func callKiroEndpoint(account *config.Account, payload *KiroPayload, callback *KiroStreamCallback, ep kiroEndpoint) error {
	const maxAttempts = 3
	var lastErr error
	endpointURL := resolveKiroEndpointURL(ep, account)

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		payload.ConversationState.CurrentMessage.UserInputMessage.Origin = ep.Origin

		reqBody, _ := json.Marshal(payload)
		req, err := http.NewRequest("POST", endpointURL, bytes.NewReader(reqBody))
		if err != nil {
			return err
		}

		host := ""
		if parsedURL, parseErr := url.Parse(endpointURL); parseErr == nil {
			host = parsedURL.Host
		}
		applyKiroRequestHeaders(req, account, ep, host, attempt, maxAttempts)

		resp, err := GetClientForProxy(ResolveAccountProxyURL(account)).Do(req)
		if err != nil {
			lastErr = err
			logger.Warnf("[KiroAPI] Endpoint %s failed: %v", ep.Name, err)
			if attempt < maxAttempts {
				sleepKiroRetry(ep.Name, attempt, maxAttempts, 0)
				continue
			}
			return err
		}

		if resp.StatusCode == 429 {
			errBody, _ := io.ReadAll(resp.Body)
			retryAfter := parseRetryAfterHeader(resp.Header.Get("Retry-After"))
			resp.Body.Close()
			lastErr = &kiroHTTPError{
				StatusCode: resp.StatusCode,
				Endpoint:   ep.Name,
				Body:       string(errBody),
				RetryAfter: retryAfter,
			}
			if attempt >= maxAttempts || containsKiroTemporaryLimitSignal(string(errBody)) {
				logger.Warnf("[KiroAPI] Endpoint %s rate-limited (429), no endpoint fanout", ep.Name)
				return lastErr
			}
			sleepKiroRetry(ep.Name, attempt, maxAttempts, retryAfter)
			continue
		}

		if resp.StatusCode >= 500 && attempt < maxAttempts {
			errBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastErr = &kiroHTTPError{
				StatusCode: resp.StatusCode,
				Endpoint:   ep.Name,
				Body:       string(errBody),
			}
			logger.Warnf("[KiroAPI] Response HTTP %d from %s: %s", resp.StatusCode, ep.Name, string(errBody))
			sleepKiroRetry(ep.Name, attempt, maxAttempts, 0)
			continue
		}

		if resp.StatusCode != 200 {
			errBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			logger.Warnf("[KiroAPI] Response HTTP %d from %s: %s", resp.StatusCode, ep.Name, string(errBody))
			return &kiroHTTPError{
				StatusCode: resp.StatusCode,
				Endpoint:   ep.Name,
				Body:       string(errBody),
			}
		}

		err = parseEventStream(resp.Body, callback)
		resp.Body.Close()
		return err
	}

	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("endpoint %s failed", ep.Name)
}

func applyKiroRequestHeaders(req *http.Request, account *config.Account, ep kiroEndpoint, host string, attempt, maxAttempts int) {
	headerValues := buildStreamingHeaderValues(account, host)
	contentType := "application/json"
	if ep.Runtime {
		headerValues = buildGatewayStreamingHeaderValues(account, host)
		contentType = "application/x-amz-json-1.0"
	}

	req.Header.Set("Content-Type", contentType)
	if ep.Runtime {
		req.Header.Set("Accept", "*/*")
	} else {
		req.Header.Set("Accept", "application/vnd.amazon.eventstream")
	}
	if ep.AmzTarget != "" {
		req.Header.Set("X-Amz-Target", ep.AmzTarget)
	}
	applyKiroBaseHeaders(req, account, headerValues)
	req.Header.Set("x-amzn-kiro-agent-mode", "vibe")
	req.Header.Set("x-amzn-codewhisperer-optout", "true")
	req.Header.Set("Amz-Sdk-Request", fmt.Sprintf("attempt=%d; max=%d", attempt, maxAttempts))
	req.Header.Set("Amz-Sdk-Invocation-Id", uuid.New().String())
}

func sleepKiroRetry(endpointName string, attempt, maxAttempts int, retryAfter time.Duration) {
	backoff := time.Duration(1<<uint(attempt-1)) * time.Second
	if retryAfter > backoff {
		backoff = retryAfter
	}
	backoff = capRetryDelay(backoff)
	logger.Warnf("[KiroAPI] Endpoint %s retry %d/%d after %v...", endpointName, attempt+1, maxAttempts, backoff)
	time.Sleep(backoff)
}

func parseEventStream(body io.Reader, callback *KiroStreamCallback) error {
	var inputTokens, outputTokens int
	var totalCredits float64
	var currentToolUse *toolUseState
	var lastAssistantContent string
	var lastReasoningContent string

	for {
		prelude := make([]byte, 12)
		_, err := io.ReadFull(body, prelude)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		totalLength := int(prelude[0])<<24 | int(prelude[1])<<16 | int(prelude[2])<<8 | int(prelude[3])
		headersLength := int(prelude[4])<<24 | int(prelude[5])<<16 | int(prelude[6])<<8 | int(prelude[7])

		if totalLength < 16 {
			continue
		}

		remaining := totalLength - 12
		msgBuf := make([]byte, remaining)
		_, err = io.ReadFull(body, msgBuf)
		if err != nil {
			return err
		}

		if headersLength > len(msgBuf)-4 {
			continue
		}

		eventType := extractEventType(msgBuf[0:headersLength])
		payloadBytes := msgBuf[headersLength : len(msgBuf)-4]
		if len(payloadBytes) == 0 {
			continue
		}

		var event map[string]interface{}
		if err := json.Unmarshal(payloadBytes, &event); err != nil {
			continue
		}

		inputTokens, outputTokens = updateTokensFromEvent(event, inputTokens, outputTokens)

		switch eventType {
		case "assistantResponseEvent":
			if content, ok := event["content"].(string); ok && content != "" {
				normalized := normalizeChunk(content, &lastAssistantContent)
				if normalized != "" {
					logger.Debugf("[KiroAPI] Response text: %.200s", normalized)
					callback.OnText(normalized, false)
				}
			}
		case "reasoningContentEvent":
			if text, ok := event["text"].(string); ok && text != "" {
				normalized := normalizeChunk(text, &lastReasoningContent)
				if normalized != "" {
					callback.OnText(normalized, true)
				}
			}
		case "toolUseEvent":
			currentToolUse = handleToolUseEvent(event, currentToolUse, callback)
		case "meteringEvent":
			if usage, ok := event["usage"].(float64); ok {
				totalCredits += usage
			}
		case "contextUsageEvent":
			if pct, ok := event["contextUsagePercentage"].(float64); ok {
				if callback.OnContextUsage != nil {
					callback.OnContextUsage(pct)
				}
			}
		}
	}

	if callback.OnCredits != nil && totalCredits > 0 {
		callback.OnCredits(totalCredits)
	}

	callback.OnComplete(inputTokens, outputTokens)
	return nil
}

func updateTokensFromEvent(event map[string]interface{}, currentInputTokens, currentOutputTokens int) (int, int) {
	candidates := []map[string]interface{}{event}
	collectUsageMaps(event, &candidates)

	inputTokens := currentInputTokens
	outputTokens := currentOutputTokens

	for _, usage := range candidates {
		if usage == nil {
			continue
		}

		if v, ok := readTokenNumber(usage,
			"outputTokens", "completionTokens", "totalOutputTokens",
			"output_tokens", "completion_tokens", "total_output_tokens",
		); ok {
			outputTokens = v
		}

		if v, ok := readTokenNumber(usage,
			"inputTokens", "promptTokens", "totalInputTokens",
			"input_tokens", "prompt_tokens", "total_input_tokens",
		); ok {
			inputTokens = v
			continue
		}

		uncached, _ := readTokenNumber(usage, "uncachedInputTokens", "uncached_input_tokens")
		cacheRead, _ := readTokenNumber(usage, "cacheReadInputTokens", "cache_read_input_tokens")
		cacheWrite, _ := readTokenNumber(usage, "cacheWriteInputTokens", "cache_write_input_tokens", "cacheCreationInputTokens", "cache_creation_input_tokens")
		if uncached+cacheRead+cacheWrite > 0 {
			inputTokens = uncached + cacheRead + cacheWrite
			continue
		}

		total, ok := readTokenNumber(usage, "totalTokens", "total_tokens")
		if ok && total > 0 {
			candidateOutput := outputTokens
			if v, vok := readTokenNumber(usage,
				"outputTokens", "completionTokens", "totalOutputTokens",
				"output_tokens", "completion_tokens", "total_output_tokens",
			); vok {
				candidateOutput = v
			}
			if total-candidateOutput > 0 {
				inputTokens = total - candidateOutput
			}
		}
	}

	return inputTokens, outputTokens
}

func getContextWindowSize(model string) int {
	m := strings.ToLower(model)
	if claudeMillionContext(m) {
		return 1_000_000
	}
	return 200_000
}

func claudeMillionContext(model string) bool {
	m := strings.TrimPrefix(strings.TrimSuffix(strings.ToLower(model), "-thinking"), "kr/")
	parts := strings.Split(m, "-")
	if len(parts) < 3 || parts[0] != "claude" {
		return false
	}
	family := parts[1]
	if family != "opus" && family != "sonnet" {
		return false
	}
	var major int
	var minor int
	var err error
	if strings.Contains(parts[2], ".") {
		version := strings.SplitN(parts[2], ".", 2)
		if len(version) != 2 {
			return false
		}
		major, err = strconv.Atoi(version[0])
		if err != nil {
			return false
		}
		minor, err = strconv.Atoi(version[1])
		if err != nil {
			return false
		}
	} else {
		if len(parts) < 4 {
			return false
		}
		major, err = strconv.Atoi(parts[2])
		if err != nil {
			return false
		}
		minor, err = strconv.Atoi(parts[3])
		if err != nil {
			return false
		}
	}
	return major > 4 || major == 4 && minor >= 6
}

func collectUsageMaps(v interface{}, out *[]map[string]interface{}) {
	switch t := v.(type) {
	case map[string]interface{}:
		for k, child := range t {
			lk := strings.ToLower(k)
			if lk == "usage" || lk == "tokenusage" || lk == "token_usage" {
				if m, ok := child.(map[string]interface{}); ok {
					*out = append(*out, m)
				}
			}
			collectUsageMaps(child, out)
		}
	case []interface{}:
		for _, child := range t {
			collectUsageMaps(child, out)
		}
	}
}

func normalizeChunk(chunk string, previous *string) string {
	if chunk == "" {
		return ""
	}

	prev := *previous
	if prev == "" {
		*previous = chunk
		return chunk
	}

	if chunk == prev {
		return ""
	}

	if strings.HasPrefix(chunk, prev) {
		delta := chunk[len(prev):]
		*previous = chunk
		return delta
	}

	if strings.HasPrefix(prev, chunk) {
		return ""
	}

	maxOverlap := 0
	maxLen := len(prev)
	if len(chunk) < maxLen {
		maxLen = len(chunk)
	}
	for i := maxLen; i > 0; i-- {
		if strings.HasSuffix(prev, chunk[:i]) {
			maxOverlap = i
			break
		}
	}

	*previous = chunk
	if maxOverlap > 0 {
		return chunk[maxOverlap:]
	}

	return chunk
}

func readTokenNumber(m map[string]interface{}, keys ...string) (int, bool) {
	for _, k := range keys {
		v, ok := m[k]
		if !ok {
			continue
		}
		switch n := v.(type) {
		case float64:
			return int(n), true
		case int:
			return n, true
		case int64:
			return int(n), true
		case json.Number:
			if parsed, err := n.Int64(); err == nil {
				return int(parsed), true
			}
		case string:
			if parsed, err := strconv.Atoi(n); err == nil {
				return parsed, true
			}
			if parsed, err := strconv.ParseFloat(n, 64); err == nil {
				return int(parsed), true
			}
		}
	}
	return 0, false
}

type toolUseState struct {
	ToolUseID   string
	Name        string
	InputBuffer strings.Builder
}

func handleToolUseEvent(event map[string]interface{}, current *toolUseState, callback *KiroStreamCallback) *toolUseState {
	toolUseID, _ := event["toolUseId"].(string)
	name, _ := event["name"].(string)
	isStop, _ := event["stop"].(bool)

	if toolUseID != "" && name != "" {
		if current == nil {
			current = &toolUseState{ToolUseID: toolUseID, Name: name}
		} else if current.ToolUseID != toolUseID {
			finishToolUse(current, callback)
			current = &toolUseState{ToolUseID: toolUseID, Name: name}
		}
	}

	if current != nil {
		if input, ok := event["input"].(string); ok {
			current.InputBuffer.WriteString(input)
		} else if inputObj, ok := event["input"].(map[string]interface{}); ok {
			data, _ := json.Marshal(inputObj)
			current.InputBuffer.Reset()
			current.InputBuffer.Write(data)
		}
	}

	if isStop && current != nil {
		finishToolUse(current, callback)
		return nil
	}

	return current
}

func finishToolUse(state *toolUseState, callback *KiroStreamCallback) {
	var input map[string]interface{}
	if state.InputBuffer.Len() > 0 {
		json.Unmarshal([]byte(state.InputBuffer.String()), &input)
	}
	if input == nil {
		input = make(map[string]interface{})
	}
	callback.OnToolUse(KiroToolUse{
		ToolUseID: state.ToolUseID,
		Name:      state.Name,
		Input:     input,
	})
}

func extractEventType(headers []byte) string {
	offset := 0
	for offset < len(headers) {
		if offset >= len(headers) {
			break
		}
		nameLen := int(headers[offset])
		offset++
		if offset+nameLen > len(headers) {
			break
		}
		name := string(headers[offset : offset+nameLen])
		offset += nameLen
		if offset >= len(headers) {
			break
		}
		valueType := headers[offset]
		offset++

		if valueType == 7 {
			if offset+2 > len(headers) {
				break
			}
			valueLen := int(headers[offset])<<8 | int(headers[offset+1])
			offset += 2
			if offset+valueLen > len(headers) {
				break
			}
			value := string(headers[offset : offset+valueLen])
			offset += valueLen
			if name == ":event-type" {
				return value
			}
			continue
		}

		skipSizes := map[byte]int{0: 0, 1: 0, 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16}
		if valueType == 6 {
			if offset+2 > len(headers) {
				break
			}
			l := int(headers[offset])<<8 | int(headers[offset+1])
			offset += 2 + l
		} else if skip, ok := skipSizes[valueType]; ok {
			offset += skip
		} else {
			break
		}
	}
	return ""
}
