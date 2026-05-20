package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type ProxySource struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	URL    string `json:"url"`
	Format string `json:"format,omitempty"`
}

type ScrapedProxy struct {
	URL      string `json:"url"`
	Type     string `json:"type"`
	Source   string `json:"source"`
	Alive    bool   `json:"alive"`
	PingMs   *int   `json:"pingMs"`
	TestedAt int64  `json:"testedAt"`
}

type ScrapeJob struct {
	ID           string         `json:"id"`
	Status       string         `json:"status"`
	Sources      []string       `json:"sources"`
	TotalFetched int            `json:"totalFetched"`
	TotalTesting int            `json:"totalTesting"`
	TotalTested  int            `json:"totalTested"`
	TotalAlive   int            `json:"totalAlive"`
	TotalDead    int            `json:"totalDead"`
	Results      []ScrapedProxy `json:"results"`
	StartedAt    *int64         `json:"startedAt"`
	Error        string         `json:"error,omitempty"`
	Concurrency  int            `json:"concurrency"`
}

type ScrapeOptions struct {
	GeonodeCountry string `json:"geonodeCountry,omitempty"`
}

type rawProxy struct {
	URL    string
	Type   string
	Source string
}

const (
	scraperHealthURL    = "http://httpbin.org/ip"
	scraperTestTimeout  = 8 * time.Second
	scraperFetchTimeout = 15 * time.Second
)

var (
	scraperHostPortRe       = regexp.MustCompile(`^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$`)
	scraperGeonodeCountryRe = regexp.MustCompile(`^[A-Z]{2}$`)
)

var scrapeSources = []ProxySource{
	{ID: "speedx-socks5", Name: "TheSpeedX SOCKS5", Type: "socks5", URL: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt"},
	{ID: "speedx-socks4", Name: "TheSpeedX SOCKS4", Type: "socks4", URL: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt"},
	{ID: "speedx-http", Name: "TheSpeedX HTTP", Type: "http", URL: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt"},
	{ID: "geonode-http", Name: "Geonode SG HTTP/SOCKS5", Type: "http", URL: "https://proxylist.geonode.com/api/proxy-list?country=SG&protocols=http%2Csocks5&limit=500&page=1&sort_by=lastChecked&sort_type=desc", Format: "geonode"},
	{ID: "clarketm-http", Name: "clarketm HTTP", Type: "http", URL: "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"},
	{ID: "monosans-http", Name: "monosans HTTP", Type: "http", URL: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt"},
	{ID: "monosans-socks5", Name: "monosans SOCKS5", Type: "socks5", URL: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt"},
	{ID: "hookzof-socks5", Name: "hookzof SOCKS5", Type: "socks5", URL: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt"},
}

var (
	scrapeMu     sync.Mutex
	currentJob   = ScrapeJob{ID: "", Status: "idle", Sources: []string{}, Results: []ScrapedProxy{}, Concurrency: 50}
	cancelFlag   bool
	scrapeCtx    context.Context
	scrapeCancel context.CancelFunc
)

func GetSources() []ProxySource {
	out := make([]ProxySource, len(scrapeSources))
	copy(out, scrapeSources)
	return out
}

func GetScrapeStatus() ScrapeJob {
	scrapeMu.Lock()
	defer scrapeMu.Unlock()
	job := currentJob
	job.Sources = append([]string{}, currentJob.Sources...)
	job.Results = append([]ScrapedProxy{}, currentJob.Results...)
	return job
}

func StartScrape(sourceIDs []string, concurrency int, options ScrapeOptions) error {
	scrapeMu.Lock()
	if currentJob.Status == "fetching" || currentJob.Status == "testing" {
		scrapeMu.Unlock()
		return fmt.Errorf("a scrape job is already running")
	}

	var selected []ProxySource
	if len(sourceIDs) == 0 {
		selected = make([]ProxySource, len(scrapeSources))
		copy(selected, scrapeSources)
	} else {
		idSet := make(map[string]struct{}, len(sourceIDs))
		for _, id := range sourceIDs {
			idSet[id] = struct{}{}
		}
		for _, src := range scrapeSources {
			if _, ok := idSet[src.ID]; ok {
				selected = append(selected, src)
			}
		}
	}
	if len(selected) == 0 {
		scrapeMu.Unlock()
		return fmt.Errorf("no valid source IDs provided")
	}
	if concurrency <= 0 {
		concurrency = 50
	}

	cancelFlag = false
	if scrapeCancel != nil {
		scrapeCancel()
	}
	scrapeCtx, scrapeCancel = context.WithCancel(context.Background())

	now := time.Now().UnixMilli()
	sourceList := make([]string, 0, len(selected))
	for _, s := range selected {
		sourceList = append(sourceList, s.ID)
	}
	currentJob = ScrapeJob{
		ID:          uuid.NewString(),
		Status:      "fetching",
		Sources:     sourceList,
		Results:     []ScrapedProxy{},
		StartedAt:   &now,
		Concurrency: concurrency,
	}
	ctx := scrapeCtx
	scrapeMu.Unlock()

	go runScrapeJob(ctx, selected, concurrency, options)
	return nil
}

func CancelScrape() {
	scrapeMu.Lock()
	defer scrapeMu.Unlock()
	if currentJob.Status == "fetching" || currentJob.Status == "testing" {
		cancelFlag = true
		currentJob.Status = "done"
		currentJob.Error = "Cancelled by user"
		if scrapeCancel != nil {
			scrapeCancel()
		}
	}
}

func IntegrateResults(proxyURLs []string) (proxyBatchResult, error) {
	scrapeMu.Lock()
	alive := make([]ScrapedProxy, 0, len(currentJob.Results))
	for _, r := range currentJob.Results {
		if r.Alive {
			alive = append(alive, r)
		}
	}
	scrapeMu.Unlock()

	if len(alive) == 0 {
		return proxyBatchResult{}, nil
	}

	var toIntegrate []ScrapedProxy
	if len(proxyURLs) > 0 {
		urlSet := make(map[string]struct{}, len(proxyURLs))
		for _, u := range proxyURLs {
			urlSet[u] = struct{}{}
		}
		for _, p := range alive {
			if _, ok := urlSet[p.URL]; ok {
				toIntegrate = append(toIntegrate, p)
			}
		}
	} else {
		toIntegrate = alive
	}

	if len(toIntegrate) == 0 {
		return proxyBatchResult{}, nil
	}

	var sb strings.Builder
	for i, p := range toIntegrate {
		if i > 0 {
			sb.WriteByte('\n')
		}
		sb.WriteString(p.URL)
	}
	return BatchAddProxies(sb.String())
}

func runScrapeJob(ctx context.Context, sources []ProxySource, concurrency int, options ScrapeOptions) {
	defer func() {
		if r := recover(); r != nil {
			scrapeMu.Lock()
			currentJob.Status = "error"
			currentJob.Error = fmt.Sprintf("panic: %v", r)
			scrapeMu.Unlock()
		}
	}()

	rawList := make([]rawProxy, 0, 1024)
	for _, source := range sources {
		select {
		case <-ctx.Done():
			scrapeMu.Lock()
			currentJob.Status = "done"
			if currentJob.Error == "" {
				currentJob.Error = "Cancelled by user"
			}
			scrapeMu.Unlock()
			return
		default:
		}

		fetchURL := buildScrapeSourceURL(source, options)
		fetched, err := fetchSource(ctx, source, fetchURL)
		if err != nil {
			continue
		}
		rawList = append(rawList, fetched...)
	}

	scrapeMu.Lock()
	currentJob.TotalFetched = len(rawList)
	scrapeMu.Unlock()

	seen := make(map[string]struct{}, len(rawList))
	unique := rawList[:0]
	for _, r := range rawList {
		if _, dup := seen[r.URL]; dup {
			continue
		}
		seen[r.URL] = struct{}{}
		unique = append(unique, r)
	}

	scrapeMu.Lock()
	currentJob.Status = "testing"
	currentJob.TotalTesting = len(unique)
	scrapeMu.Unlock()

	for i := 0; i < len(unique); i += concurrency {
		select {
		case <-ctx.Done():
			scrapeMu.Lock()
			currentJob.Status = "done"
			if currentJob.Error == "" {
				currentJob.Error = "Cancelled by user"
			}
			scrapeMu.Unlock()
			return
		default:
		}

		end := i + concurrency
		if end > len(unique) {
			end = len(unique)
		}
		batch := unique[i:end]

		var wg sync.WaitGroup
		results := make([]ScrapedProxy, len(batch))
		for j, p := range batch {
			wg.Add(1)
			go func(idx int, rp rawProxy) {
				defer wg.Done()
				results[idx] = testScraperProxy(ctx, rp.URL, rp.Type, rp.Source)
			}(j, p)
		}
		wg.Wait()

		scrapeMu.Lock()
		for _, res := range results {
			if res.Alive {
				currentJob.TotalAlive++
				currentJob.Results = append(currentJob.Results, res)
			} else {
				currentJob.TotalDead++
			}
		}
		currentJob.TotalTested += len(batch)
		scrapeMu.Unlock()
	}

	scrapeMu.Lock()
	if currentJob.Status != "done" {
		currentJob.Status = "done"
	}
	scrapeMu.Unlock()
}

func buildScrapeSourceURL(source ProxySource, options ScrapeOptions) string {
	if source.Format != "geonode" || options.GeonodeCountry == "" {
		return source.URL
	}
	country := strings.ToUpper(strings.TrimSpace(options.GeonodeCountry))
	if !scraperGeonodeCountryRe.MatchString(country) {
		return source.URL
	}
	parsed, err := url.Parse(source.URL)
	if err != nil {
		return source.URL
	}
	q := parsed.Query()
	q.Set("country", country)
	parsed.RawQuery = q.Encode()
	return parsed.String()
}

func fetchSource(ctx context.Context, source ProxySource, fetchURL string) ([]rawProxy, error) {
	reqCtx, cancel := context.WithTimeout(ctx, scraperFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, fetchURL, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: scraperFetchTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if source.Format == "geonode" {
		return parseGeonodeResponse(body, source)
	}
	return parseTextResponse(body, source), nil
}

func parseTextResponse(body []byte, source ProxySource) []rawProxy {
	text := string(body)
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	out := make([]rawProxy, 0, len(lines))
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		hostPort := strings.Fields(line)
		if len(hostPort) == 0 {
			continue
		}
		hp := hostPort[0]
		if !scraperHostPortRe.MatchString(hp) {
			continue
		}
		out = append(out, rawProxy{
			URL:    fmt.Sprintf("%s://%s", source.Type, hp),
			Type:   source.Type,
			Source: source.ID,
		})
	}
	return out
}

type geonodeProxyItem struct {
	IP        string      `json:"ip"`
	Port      json.Number `json:"port"`
	Protocols []string    `json:"protocols"`
}

type geonodeResponse struct {
	Data []geonodeProxyItem `json:"data"`
}

func parseGeonodeResponse(body []byte, source ProxySource) ([]rawProxy, error) {
	var resp geonodeResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	out := make([]rawProxy, 0, len(resp.Data))
	for _, item := range resp.Data {
		if item.IP == "" || item.Port == "" {
			continue
		}
		protocol := chooseGeonodeProtocol(item.Protocols)
		if protocol == "" {
			continue
		}
		hp := fmt.Sprintf("%s:%s", item.IP, item.Port.String())
		if !scraperHostPortRe.MatchString(hp) {
			continue
		}
		out = append(out, rawProxy{
			URL:    fmt.Sprintf("%s://%s", protocol, hp),
			Type:   protocol,
			Source: source.ID,
		})
	}
	return out, nil
}

func chooseGeonodeProtocol(protocols []string) string {
	for _, p := range protocols {
		if p == "socks5" {
			return "socks5"
		}
	}
	for _, p := range protocols {
		if p == "http" {
			return "http"
		}
	}
	return ""
}

func testScraperProxy(ctx context.Context, proxyURL, proxyType, source string) ScrapedProxy {
	out := ScrapedProxy{
		URL:      proxyURL,
		Type:     proxyType,
		Source:   source,
		TestedAt: time.Now().UnixMilli(),
	}
	client, err := newProxyHTTPClient(proxyURL, scraperTestTimeout)
	if err != nil {
		return out
	}
	reqCtx, cancel := context.WithTimeout(ctx, scraperTestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, scraperHealthURL, nil)
	if err != nil {
		return out
	}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return out
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return out
	}
	ping := int(time.Since(start).Milliseconds())
	out.Alive = true
	out.PingMs = &ping
	return out
}
