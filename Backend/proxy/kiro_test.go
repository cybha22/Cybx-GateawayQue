package proxy

import (
	"fmt"
	"kiro-go/config"
	"kiro-go/pool"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestNormalizeChunkBasicProgression(t *testing.T) {
	prev := ""

	if got := normalizeChunk("abc", &prev); got != "abc" {
		t.Fatalf("expected first chunk to pass through, got %q", got)
	}
	if got := normalizeChunk("abcde", &prev); got != "de" {
		t.Fatalf("expected appended delta, got %q", got)
	}
}

func TestNormalizeChunkPrefixRewindDoesNotReplay(t *testing.T) {
	prev := ""

	_ = normalizeChunk("abcde", &prev)
	if got := normalizeChunk("abc", &prev); got != "" {
		t.Fatalf("expected rewind chunk to be ignored, got %q", got)
	}
	if prev != "abcde" {
		t.Fatalf("expected previous snapshot to remain longest version, got %q", prev)
	}
	if got := normalizeChunk("abcdef", &prev); got != "f" {
		t.Fatalf("expected only unseen suffix after rewind, got %q", got)
	}
}

func TestNormalizeChunkOverlapDelta(t *testing.T) {
	prev := "hello world"

	if got := normalizeChunk("world!!!", &prev); got != "!!!" {
		t.Fatalf("expected overlap suffix delta, got %q", got)
	}
}

func TestBuildKiroTransportUsesExplicitProxyURL(t *testing.T) {
	transport := buildKiroTransport("http://proxy.local:8080")
	req := &http.Request{URL: mustParseURL(t, "https://q.us-east-1.amazonaws.com")}

	got, err := transport.Proxy(req)
	if err != nil {
		t.Fatalf("unexpected proxy error: %v", err)
	}
	assertProxyURL(t, got, "http://proxy.local:8080")
}

func TestBuildKiroTransportFallsBackToEnvironmentProxy(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://env-proxy.local:2323")
	t.Setenv("NO_PROXY", "")
	t.Setenv("no_proxy", "")

	transport := buildKiroTransport("")
	req := &http.Request{URL: mustParseURL(t, "https://q.us-east-1.amazonaws.com")}

	got, err := transport.Proxy(req)
	if err != nil {
		t.Fatalf("unexpected proxy error: %v", err)
	}
	assertProxyURL(t, got, "http://env-proxy.local:2323")
}

func TestInitKiroHttpClientKeepsShortRestTimeout(t *testing.T) {
	InitKiroHttpClient("")
	t.Cleanup(func() { InitKiroHttpClient("") })

	streamClient := kiroHttpStore.Load()
	restClient := kiroRestHttpStore.Load()

	if streamClient.Timeout != 5*time.Minute {
		t.Fatalf("expected streaming timeout to be 5m, got %s", streamClient.Timeout)
	}
	if restClient.Timeout != 30*time.Second {
		t.Fatalf("expected REST timeout to stay 30s, got %s", restClient.Timeout)
	}
}

func TestResolveKiroRuntimeEndpointUsesAccountRegion(t *testing.T) {
	ep := kiroEndpoint{URL: "https://runtime.{region}.kiro.dev/generateAssistantResponse"}
	account := &config.Account{Region: "eu-central-1"}

	got := resolveKiroEndpointURL(ep, account)
	want := "https://runtime.eu-central-1.kiro.dev/generateAssistantResponse"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestApplyKiroRequestHeadersUsesRuntimeGatewayHeaders(t *testing.T) {
	req := httptest.NewRequest("POST", "https://runtime.us-east-1.kiro.dev/generateAssistantResponse", nil)
	account := &config.Account{AccessToken: "token", MachineId: "machine-123"}
	ep := kiroEndpoint{
		AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
		Runtime:   true,
	}

	applyKiroRequestHeaders(req, account, ep, "runtime.us-east-1.kiro.dev", 1, 3)

	if got := req.Header.Get("Content-Type"); got != "application/x-amz-json-1.0" {
		t.Fatalf("expected runtime content type, got %q", got)
	}
	if got := req.Header.Get("X-Amz-Target"); got != "AmazonCodeWhispererStreamingService.GenerateAssistantResponse" {
		t.Fatalf("expected x-amz-target, got %q", got)
	}
	if got := req.Header.Get("Authorization"); got != "Bearer token" {
		t.Fatalf("expected authorization header, got %q", got)
	}
}

func TestCallKiroEndpointDoesNotFanoutOrRetrySuspicious429(t *testing.T) {
	if err := config.Init(filepath.Join(t.TempDir(), "config.json")); err != nil {
		t.Fatalf("config init failed: %v", err)
	}

	count := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"message":"Due to suspicious activity, we are imposing temporary limits on how frequently your account can send a request to Kiro while we investigate.","reason":null}`))
	}))
	defer server.Close()

	err := callKiroEndpoint(&config.Account{AccessToken: "token"}, minimalKiroPayload(), &KiroStreamCallback{}, kiroEndpoint{
		URL:       server.URL,
		Origin:    "AI_EDITOR",
		AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
		Name:      "Kiro Runtime",
		Runtime:   true,
	})
	if err == nil {
		t.Fatalf("expected error")
	}
	if count != 1 {
		t.Fatalf("expected one upstream call, got %d", count)
	}
	if !isKiroTemporaryLimitError(err) {
		t.Fatalf("expected temporary limit error, got %v", err)
	}
}

func TestCallKiroAPIFallsBackFromRuntimeTemporaryLimitToCodeWhisperer(t *testing.T) {
	if err := config.Init(filepath.Join(t.TempDir(), "config.json")); err != nil {
		t.Fatalf("config init failed: %v", err)
	}

	runtimeCalls := 0
	runtimeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		runtimeCalls++
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"message":"Due to suspicious activity, we are imposing temporary limits on how frequently your account can send a request to Kiro while we investigate.","reason":"USER_REQUEST_RATE_EXCEEDED"}`))
	}))
	defer runtimeServer.Close()

	codeWhispererCalls := 0
	var codeWhispererAuthorization string
	var codeWhispererAccept string
	var codeWhispererTarget string
	codeWhispererServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		codeWhispererCalls++
		codeWhispererAuthorization = r.Header.Get("Authorization")
		codeWhispererAccept = r.Header.Get("Accept")
		codeWhispererTarget = r.Header.Get("X-Amz-Target")
		w.WriteHeader(http.StatusOK)
	}))
	defer codeWhispererServer.Close()

	oldEndpoints := kiroEndpoints
	kiroEndpoints = []kiroEndpoint{
		{
			URL:       runtimeServer.URL,
			Origin:    "AI_EDITOR",
			AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
			Name:      "Kiro Runtime",
			Runtime:   true,
		},
		{
			URL:       codeWhispererServer.URL + "/codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
			Origin:    "AI_EDITOR",
			AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
			Name:      "CodeWhisperer",
		},
	}
	t.Cleanup(func() { kiroEndpoints = oldEndpoints })

	payload := minimalKiroPayload()
	payload.ProfileArn = "arn:test"
	err := CallKiroAPI(&config.Account{AccessToken: "same-account-token"}, payload, &KiroStreamCallback{
		OnComplete: func(int, int) {},
	})
	if err != nil {
		t.Fatalf("expected CodeWhisperer fallback success, got %v", err)
	}
	if runtimeCalls != 1 {
		t.Fatalf("expected one Runtime call, got %d", runtimeCalls)
	}
	if codeWhispererCalls != 1 {
		t.Fatalf("expected one CodeWhisperer call, got %d", codeWhispererCalls)
	}
	if codeWhispererAuthorization != "Bearer same-account-token" {
		t.Fatalf("expected same account token, got %q", codeWhispererAuthorization)
	}
	if codeWhispererAccept != "application/vnd.amazon.eventstream" {
		t.Fatalf("expected event stream accept header, got %q", codeWhispererAccept)
	}
	if codeWhispererTarget != "AmazonCodeWhispererStreamingService.GenerateAssistantResponse" {
		t.Fatalf("expected CodeWhisperer target, got %q", codeWhispererTarget)
	}
}

func TestKiroAccountFailoverAcceptsString429(t *testing.T) {
	err := fmt.Errorf("HTTP 429 from Kiro Runtime: {\"message\":\"Due to suspicious activity, we are imposing temporary limits\"}")

	if !isKiroAccountFailoverError(err) {
		t.Fatalf("expected string 429 to trigger account failover")
	}
}

func TestCallKiroAPIWithAccountFailoverRetriesAnotherAccount(t *testing.T) {
	if err := config.Init(filepath.Join(t.TempDir(), "config.json")); err != nil {
		t.Fatalf("config init failed: %v", err)
	}
	if err := config.AddAccount(config.Account{ID: "a1", Email: "a1@example.com", AccessToken: "token-a1", ProfileArn: "arn:a1", Enabled: true}); err != nil {
		t.Fatalf("add account a1 failed: %v", err)
	}
	if err := config.AddAccount(config.Account{ID: "a2", Email: "a2@example.com", AccessToken: "token-a2", ProfileArn: "arn:a2", Enabled: true}); err != nil {
		t.Fatalf("add account a2 failed: %v", err)
	}

	var mu sync.Mutex
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls = append(calls, r.Header.Get("Authorization"))
		callCount := len(calls)
		mu.Unlock()

		if callCount == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"message":"Due to suspicious activity, we are imposing temporary limits"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	oldEndpoints := kiroEndpoints
	kiroEndpoints = []kiroEndpoint{{
		URL:       server.URL,
		Origin:    "AI_EDITOR",
		AmzTarget: "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
		Name:      "Kiro Runtime",
		Runtime:   true,
	}}
	t.Cleanup(func() { kiroEndpoints = oldEndpoints })

	p := pool.GetPool()
	p.Reload()
	handler := &Handler{pool: p}
	payload := minimalKiroPayload()
	payload.ProfileArn = "arn:test"

	used, err := handler.callKiroAPIWithAccountFailover("claude-opus-4.7", nil, payload, &KiroStreamCallback{
		OnComplete: func(int, int) {},
	})
	if err != nil {
		t.Fatalf("expected failover success, got %v", err)
	}
	if used == nil {
		t.Fatalf("expected used account")
	}
	if len(calls) != 2 {
		t.Fatalf("expected two upstream calls, got %d", len(calls))
	}
	if calls[0] == calls[1] {
		t.Fatalf("expected failover to use a different account")
	}
}

func TestGetContextWindowSizeHandlesFutureClaudeVersions(t *testing.T) {
	tests := map[string]int{
		"claude-opus-4.8":          1_000_000,
		"claude-opus-4-8":          1_000_000,
		"claude-sonnet-5-0":        1_000_000,
		"claude-haiku-4.5":         200_000,
		"claude-sonnet-4.5":        200_000,
		"claude-opus-4.8-thinking": 1_000_000,
	}

	for model, want := range tests {
		if got := getContextWindowSize(model); got != want {
			t.Fatalf("%s: expected %d, got %d", model, want, got)
		}
	}
}

func minimalKiroPayload() *KiroPayload {
	payload := &KiroPayload{}
	payload.ConversationState.ChatTriggerType = "MANUAL"
	payload.ConversationState.ConversationID = "conversation"
	payload.ConversationState.CurrentMessage.UserInputMessage = KiroUserInputMessage{
		Content: "hello",
		ModelID: "claude-opus-4.7",
		Origin:  "AI_EDITOR",
	}
	return payload
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("invalid test URL: %v", err)
	}
	return parsed
}

func assertProxyURL(t *testing.T, got *url.URL, want string) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected proxy URL %q, got nil", want)
	}
	if got.String() != want {
		t.Fatalf("expected proxy URL %q, got %q", want, got.String())
	}
}
