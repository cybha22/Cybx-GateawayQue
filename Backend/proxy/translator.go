package proxy

import (
	"encoding/base64"
	"encoding/json"
	"kiro-go/config"
	"kiro-go/contentfilter"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

type modelMapping struct {
	key   string
	value string
}

var modelMapOrdered = []modelMapping{
	{"claude-sonnet-4-20250514", "claude-sonnet-4"},
	{"claude-sonnet-4-5", "claude-sonnet-4.5"},
	{"claude-sonnet-4.5", "claude-sonnet-4.5"},
	{"claude-sonnet-4-6", "claude-sonnet-4.6"},
	{"claude-sonnet-4.6", "claude-sonnet-4.6"},
	{"claude-opus-4-7", "claude-opus-4.7"},
	{"claude-opus-4.7", "claude-opus-4.7"},
	{"claude-haiku-4-5", "claude-haiku-4.5"},
	{"claude-haiku-4.5", "claude-haiku-4.5"},
	{"claude-opus-4-5", "claude-opus-4.5"},
	{"claude-opus-4.5", "claude-opus-4.5"},
	{"claude-opus-4-6", "claude-opus-4.6"},
	{"claude-opus-4.6", "claude-opus-4.6"},
	{"claude-sonnet-4", "claude-sonnet-4"},
	{"claude-3-5-sonnet", "claude-sonnet-4.5"},
	{"claude-3-opus", "claude-sonnet-4.5"},
	{"claude-3-sonnet", "claude-sonnet-4"},
	{"claude-3-haiku", "claude-haiku-4.5"},
	{"gpt-4-turbo", "claude-sonnet-4.5"},
	{"gpt-4o", "claude-sonnet-4.5"},
	{"gpt-4", "claude-sonnet-4.5"},
	{"gpt-3.5-turbo", "claude-sonnet-4.5"},
}

const ThinkingModePrompt = `<thinking_mode>enabled</thinking_mode>
<max_thinking_length>200000</max_thinking_length>`

const minimalFallbackUserContent = "."
const toolResultsContinuationPrefix = "Tool results:"

func ParseModelAndThinking(model string, thinkingSuffix string) (string, bool) {
	lower := strings.ToLower(model)
	thinking := false

	suffixLower := strings.ToLower(thinkingSuffix)
	if strings.HasSuffix(lower, suffixLower) {
		thinking = true
		model = model[:len(model)-len(thinkingSuffix)]
		lower = strings.ToLower(model)
	}

	for _, m := range modelMapOrdered {
		if strings.Contains(lower, m.key) {
			return m.value, thinking
		}
	}

	if strings.HasPrefix(lower, "claude-") {
		return model, thinking
	}

	return model, thinking
}

func resolveClaudeThinkingMode(model string, thinkingCfg *ClaudeThinkingConfig, thinkingSuffix string) (string, bool) {
	actualModel, suffixThinking := ParseModelAndThinking(model, thinkingSuffix)
	return actualModel, suffixThinking || isClaudeThinkingRequested(thinkingCfg)
}

func isClaudeThinkingRequested(thinkingCfg *ClaudeThinkingConfig) bool {
	if thinkingCfg == nil {
		return false
	}
	kind := strings.ToLower(strings.TrimSpace(thinkingCfg.Type))
	return kind == "enabled" || kind == "adaptive"
}

func MapModel(model string) string {
	mapped, _ := ParseModelAndThinking(model, "-thinking")
	return mapped
}

type ClaudeRequest struct {
	Model       string                `json:"model"`
	Messages    []ClaudeMessage       `json:"messages"`
	MaxTokens   int                   `json:"max_tokens"`
	Temperature float64               `json:"temperature,omitempty"`
	TopP        float64               `json:"top_p,omitempty"`
	Stream      bool                  `json:"stream,omitempty"`
	System      interface{}           `json:"system,omitempty"`
	Thinking    *ClaudeThinkingConfig `json:"thinking,omitempty"`
	Tools       []ClaudeTool          `json:"tools,omitempty"`
	ToolChoice  interface{}           `json:"tool_choice,omitempty"`
}

type ClaudeThinkingConfig struct {
	Type         string `json:"type,omitempty"`
	BudgetTokens int    `json:"budget_tokens,omitempty"`
	Display      string `json:"display,omitempty"`
}

type ClaudeMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type ClaudeContentBlock struct {
	Type      string       `json:"type"`
	Text      string       `json:"text,omitempty"`
	Thinking  string       `json:"thinking,omitempty"`
	Signature string       `json:"signature,omitempty"`
	ID        string       `json:"id,omitempty"`
	Name      string       `json:"name,omitempty"`
	Input     interface{}  `json:"input,omitempty"`
	ToolUseID string       `json:"tool_use_id,omitempty"`
	Content   interface{}  `json:"content,omitempty"`
	Source    *ImageSource `json:"source,omitempty"`
}

type ImageSource struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type ClaudeTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"input_schema"`
}

type ClaudeResponse struct {
	ID           string               `json:"id"`
	Type         string               `json:"type"`
	Role         string               `json:"role"`
	Content      []ClaudeContentBlock `json:"content"`
	Model        string               `json:"model"`
	StopReason   string               `json:"stop_reason"`
	StopSequence *string              `json:"stop_sequence"`
	Usage        ClaudeUsage          `json:"usage"`
}

type ClaudeCacheCreationUsage struct {
	Ephemeral5mInputTokens int `json:"ephemeral_5m_input_tokens,omitempty"`
	Ephemeral1hInputTokens int `json:"ephemeral_1h_input_tokens,omitempty"`
}

type ClaudeUsage struct {
	InputTokens              int                       `json:"input_tokens"`
	OutputTokens             int                       `json:"output_tokens"`
	CacheCreationInputTokens int                       `json:"cache_creation_input_tokens,omitempty"`
	CacheReadInputTokens     int                       `json:"cache_read_input_tokens,omitempty"`
	CacheCreation            *ClaudeCacheCreationUsage `json:"cache_creation,omitempty"`
}

const maxToolDescLen = 10237

func ClaudeToKiro(req *ClaudeRequest, thinking bool) *KiroPayload {
	modelID := MapModel(req.Model)
	origin := "AI_EDITOR"

	systemPrompt := contentfilter.Apply(buildClaudeSystemPrompt(req.System, thinking))

	history := make([]KiroHistoryMessage, 0)
	var currentContent string
	var currentImages []KiroImage
	var currentToolResults []KiroToolResult

	for i, msg := range req.Messages {
		isLast := i == len(req.Messages)-1

		if msg.Role == "user" {
			content, images, toolResults := extractClaudeUserContent(msg.Content)
			content = contentfilter.ApplyInSystemReminders(normalizeUserContent(content, len(images) > 0))

			if isLast {
				currentContent = content
				currentImages = images
				currentToolResults = toolResults
			} else {
				userMsg := KiroUserInputMessage{
					Content: content,
					ModelID: modelID,
					Origin:  origin,
				}
				if len(images) > 0 {
					userMsg.Images = images
				}
				if len(toolResults) > 0 {
					userMsg.UserInputMessageContext = &UserInputMessageContext{
						ToolResults: toolResults,
					}
				}
				history = append(history, KiroHistoryMessage{
					UserInputMessage: &userMsg,
				})
			}
		} else if msg.Role == "assistant" {
			content, toolUses := extractClaudeAssistantContent(msg.Content)
			content = contentfilter.ApplyInSystemReminders(content)
			history = append(history, KiroHistoryMessage{
				AssistantResponseMessage: &KiroAssistantResponseMessage{
					Content:  content,
					ToolUses: toolUses,
				},
			})
		}
	}

	history = trimLeadingAssistantHistory(history)

	finalContent := ""
	if systemPrompt != "" {
		finalContent = systemPrompt + "\n\n"
	}
	if currentContent != "" {
		finalContent += contentfilter.ApplyInSystemReminders(currentContent)
	} else if len(currentImages) > 0 {
		finalContent += normalizeUserContent("", true)
	} else if len(currentToolResults) > 0 {
		finalContent += buildToolResultsContinuation(currentToolResults)
	} else {
		finalContent += minimalFallbackUserContent
	}

	kiroTools, toolNameMap := convertClaudeTools(req.Tools)

	payload := &KiroPayload{}
	payload.ToolNameMap = toolNameMap
	payload.ConversationState.ChatTriggerType = "MANUAL"
	payload.ConversationState.AgentTaskType = "vibe"
	payload.ConversationState.AgentContinuationId = uuid.New().String()
	payload.ConversationState.ConversationID = buildConversationID(modelID, systemPrompt, firstClaudeConversationAnchor(req.Messages))
	payload.ConversationState.CurrentMessage.UserInputMessage = KiroUserInputMessage{
		Content: finalContent,
		ModelID: modelID,
		Origin:  origin,
		Images:  currentImages,
	}

	if len(kiroTools) > 0 || len(currentToolResults) > 0 {
		payload.ConversationState.CurrentMessage.UserInputMessage.UserInputMessageContext = &UserInputMessageContext{
			Tools:       kiroTools,
			ToolResults: currentToolResults,
		}
	}

	if len(history) > 0 {
		payload.ConversationState.History = history
	}

	if req.MaxTokens > 0 || req.Temperature > 0 || req.TopP > 0 {
		payload.InferenceConfig = &InferenceConfig{
			MaxTokens:   req.MaxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
		}
	}

	return payload
}

func buildClaudeSystemPrompt(system interface{}, thinking bool) string {
	systemPrompt := extractSystemPrompt(system)
	identity := config.GetIdentityPrompt()
	if thinking {
		if systemPrompt == "" {
			systemPrompt = ThinkingModePrompt
		} else {
			systemPrompt = ThinkingModePrompt + "\n\n" + systemPrompt
		}
	}
	if identity == "" {
		return systemPrompt
	}
	if systemPrompt == "" {
		return identity
	}
	return identity + "\n\n" + systemPrompt
}

func cloneClaudeRequestForThinking(req *ClaudeRequest, thinking bool) *ClaudeRequest {
	if req == nil {
		return nil
	}

	cloned := *req
	if thinking {
		cloned.System = prependThinkingSystem(req.System)
	}
	return &cloned
}

func prependThinkingSystem(system interface{}) interface{} {
	thinkingText := ThinkingModePrompt
	if hasClaudeSystemContent(system) {
		thinkingText += "\n"
	}
	thinkingBlock := map[string]interface{}{
		"type": "text",
		"text": thinkingText,
	}

	switch v := system.(type) {
	case nil:
		return []interface{}{thinkingBlock}
	case string:
		if v == "" {
			return []interface{}{thinkingBlock}
		}
		return []interface{}{
			thinkingBlock,
			map[string]interface{}{
				"type": "text",
				"text": v,
			},
		}
	case []interface{}:
		blocks := make([]interface{}, 0, len(v)+1)
		blocks = append(blocks, thinkingBlock)
		blocks = append(blocks, v...)
		return blocks
	case []string:
		blocks := make([]interface{}, 0, len(v)+1)
		blocks = append(blocks, thinkingBlock)
		for _, block := range v {
			blocks = append(blocks, map[string]interface{}{
				"type": "text",
				"text": block,
			})
		}
		return blocks
	default:
		return []interface{}{thinkingBlock}
	}
}

func hasClaudeSystemContent(system interface{}) bool {
	switch v := system.(type) {
	case nil:
		return false
	case string:
		return v != ""
	case []interface{}:
		return len(v) > 0
	case []string:
		return len(v) > 0
	default:
		return true
	}
}

func extractSystemPrompt(system interface{}) string {
	if system == nil {
		return ""
	}
	if s, ok := system.(string); ok {
		return s
	}
	if blocks, ok := system.([]interface{}); ok {
		var parts []string
		for _, b := range blocks {
			if block, ok := b.(map[string]interface{}); ok {
				if text, ok := block["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func extractClaudeUserContent(content interface{}) (string, []KiroImage, []KiroToolResult) {
	var text string
	var images []KiroImage
	var toolResults []KiroToolResult

	if s, ok := content.(string); ok {
		return s, nil, nil
	}

	if blocks, ok := content.([]interface{}); ok {
		for _, b := range blocks {
			block, ok := b.(map[string]interface{})
			if !ok {
				continue
			}

			blockType, _ := block["type"].(string)
			switch blockType {
			case "text", "input_text":
				if t, ok := block["text"].(string); ok {
					text += t
				}
			case "image", "image_url", "input_image":
				if img := extractImageFromClaudeBlock(block); img != nil {
					images = append(images, *img)
				}
			case "tool_result":
				toolUseID, _ := block["tool_use_id"].(string)
				resultContent := extractToolResultContent(block["content"])
				toolResults = append(toolResults, KiroToolResult{
					ToolUseID: toolUseID,
					Content:   []KiroResultContent{{Text: resultContent}},
					Status:    "success",
				})
			}
		}
	}

	return text, images, toolResults
}

func extractImageFromClaudeBlock(block map[string]interface{}) *KiroImage {
	if source, ok := block["source"].(map[string]interface{}); ok {
		if data, ok := source["data"].(string); ok {
			if img := parseDataURL(data); img != nil {
				return img
			}
			mediaType, _ := source["media_type"].(string)
			if mediaType == "" {
				mediaType, _ = source["mediaType"].(string)
			}
			if mediaType == "" {
				mediaType, _ = source["mime_type"].(string)
			}
			format := strings.TrimPrefix(strings.ToLower(mediaType), "image/")
			if img := parseBase64Image(data, format); img != nil {
				return img
			}
		}
		if url, ok := source["url"].(string); ok {
			if img := parseDataURL(url); img != nil {
				return img
			}
		}
	}

	if img := extractImageFromOpenAIPart(block); img != nil {
		return img
	}

	if data, ok := block["data"].(string); ok {
		if img := parseDataURL(data); img != nil {
			return img
		}
	}

	return nil
}

func extractToolResultContent(content interface{}) string {
	if s, ok := content.(string); ok {
		return s
	}
	if blocks, ok := content.([]interface{}); ok {
		var parts []string
		for _, b := range blocks {
			if block, ok := b.(map[string]interface{}); ok {
				if text, ok := block["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}

func extractClaudeAssistantContent(content interface{}) (string, []KiroToolUse) {
	var text string
	var toolUses []KiroToolUse

	if s, ok := content.(string); ok {
		return s, nil
	}

	if blocks, ok := content.([]interface{}); ok {
		for _, b := range blocks {
			block, ok := b.(map[string]interface{})
			if !ok {
				continue
			}

			blockType, _ := block["type"].(string)
			switch blockType {
			case "text":
				if t, ok := block["text"].(string); ok {
					text += t
				}
			case "tool_use":
				id, _ := block["id"].(string)
				name, _ := block["name"].(string)
				input, _ := block["input"].(map[string]interface{})
				if input == nil {
					input = make(map[string]interface{})
				}
				toolUses = append(toolUses, KiroToolUse{
					ToolUseID: id,
					Name:      name,
					Input:     input,
				})
			}
		}
	}

	return text, toolUses
}

func convertClaudeTools(tools []ClaudeTool) ([]KiroToolWrapper, map[string]string) {
	if len(tools) == 0 {
		return nil, nil
	}

	result := make([]KiroToolWrapper, 0, len(tools))
	nameMap := make(map[string]string)
	for _, tool := range tools {
		desc := tool.Description
		if len(desc) > maxToolDescLen {
			desc = desc[:maxToolDescLen] + "..."
		}
		sanitized := shortenToolName(sanitizeToolName(tool.Name))
		if sanitized != tool.Name {
			nameMap[sanitized] = tool.Name
		}
		w := KiroToolWrapper{}
		w.ToolSpecification.Name = sanitized
		w.ToolSpecification.Description = desc
		w.ToolSpecification.InputSchema = InputSchema{JSON: ensureObjectSchema(tool.InputSchema)}
		result = append(result, w)
	}
	return result, nameMap
}

func ensureObjectSchema(schema interface{}) interface{} {
	m, ok := schema.(map[string]interface{})
	if !ok {
		return map[string]interface{}{"type": "object"}
	}
	cleanSchema(m)
	if _, hasType := m["type"]; !hasType {
		m["type"] = "object"
	}
	return m
}

func cleanSchema(m map[string]interface{}) {
	if req, exists := m["required"]; exists {
		if req == nil {
			delete(m, "required")
		} else if arr, ok := req.([]interface{}); ok && len(arr) == 0 {
			delete(m, "required")
		}
	}

	if props, ok := m["properties"].(map[string]interface{}); ok {
		for _, v := range props {
			if sub, ok := v.(map[string]interface{}); ok {
				cleanSchema(sub)
			}
		}
	}

	if items, ok := m["items"].(map[string]interface{}); ok {
		cleanSchema(items)
	}

	for _, key := range []string{"additionalProperties"} {
		if sub, ok := m[key].(map[string]interface{}); ok {
			cleanSchema(sub)
		}
	}
	for _, key := range []string{"allOf", "oneOf", "anyOf"} {
		if arr, ok := m[key].([]interface{}); ok {
			for _, item := range arr {
				if sub, ok := item.(map[string]interface{}); ok {
					cleanSchema(sub)
				}
			}
		}
	}
}

func sanitizeToolName(name string) string {
	parts := strings.FieldsFunc(name, func(r rune) bool {
		return r == '_' || r == '-'
	})
	if len(parts) == 0 {
		return "tool"
	}
	var b strings.Builder
	for i, part := range parts {
		if part == "" {
			continue
		}
		if i == 0 {
			b.WriteString(strings.ToLower(part[:1]) + part[1:])
		} else {
			b.WriteString(strings.ToUpper(part[:1]) + part[1:])
		}
	}
	result := b.String()
	if result == "" {
		return "tool"
	}
	return result
}

func shortenToolName(name string) string {
	if len(name) <= 64 {
		return name
	}
	if strings.HasPrefix(name, "mcp__") {
		lastIdx := strings.LastIndex(name, "__")
		if lastIdx > 5 {
			shortened := "mcp__" + name[lastIdx+2:]
			if len(shortened) <= 64 {
				return shortened
			}
		}
	}
	return name[:64]
}

func KiroToClaudeResponse(content, thinkingContent string, includeEmptyThinkingBlock bool, toolUses []KiroToolUse, inputTokens, outputTokens int, model string) *ClaudeResponse {
	blocks := make([]ClaudeContentBlock, 0)

	if thinkingContent != "" || includeEmptyThinkingBlock {
		blocks = append(blocks, ClaudeContentBlock{
			Type:     "thinking",
			Thinking: thinkingContent,
		})
	}

	if content != "" {
		blocks = append(blocks, ClaudeContentBlock{
			Type: "text",
			Text: content,
		})
	}

	for _, tu := range toolUses {
		blocks = append(blocks, ClaudeContentBlock{
			Type:  "tool_use",
			ID:    tu.ToolUseID,
			Name:  tu.Name,
			Input: tu.Input,
		})
	}

	stopReason := "end_turn"
	if len(toolUses) > 0 {
		stopReason = "tool_use"
	}

	return &ClaudeResponse{
		ID:         "msg_" + uuid.New().String(),
		Type:       "message",
		Role:       "assistant",
		Content:    blocks,
		Model:      model,
		StopReason: stopReason,
		Usage: ClaudeUsage{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
		},
	}
}

type OpenAIRequest struct {
	Model       string          `json:"model"`
	Messages    []OpenAIMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
	TopP        float64         `json:"top_p,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
	Tools       []OpenAITool    `json:"tools,omitempty"`
}

type OpenAIMessage struct {
	Role       string      `json:"role"`
	Content    interface{} `json:"content"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type OpenAITool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string      `json:"name"`
		Description string      `json:"description"`
		Parameters  interface{} `json:"parameters"`
	} `json:"function"`
}

type OpenAIResponse struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Created int64          `json:"created"`
	Model   string         `json:"model"`
	Choices []OpenAIChoice `json:"choices"`
	Usage   OpenAIUsage    `json:"usage"`
}

type OpenAIChoice struct {
	Index        int           `json:"index"`
	Message      OpenAIMessage `json:"message"`
	FinishReason string        `json:"finish_reason"`
}

type OpenAIUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

func OpenAIToKiro(req *OpenAIRequest, thinking bool) *KiroPayload {
	modelID := MapModel(req.Model)
	origin := "AI_EDITOR"

	var systemPrompt string
	var nonSystemMessages []OpenAIMessage

	for _, msg := range req.Messages {
		if msg.Role == "system" {
			if s := extractOpenAIMessageText(msg.Content); s != "" {
				systemPrompt += s + "\n"
			}
		} else {
			nonSystemMessages = append(nonSystemMessages, msg)
		}
	}

	if thinking {
		systemPrompt = ThinkingModePrompt + "\n\n" + systemPrompt
	}

	if identity := config.GetIdentityPrompt(); identity != "" {
		if systemPrompt == "" {
			systemPrompt = identity
		} else {
			systemPrompt = identity + "\n\n" + systemPrompt
		}
	}

	history := make([]KiroHistoryMessage, 0)
	var currentContent string
	var currentImages []KiroImage
	var currentToolResults []KiroToolResult
	systemMerged := false

	for i, msg := range nonSystemMessages {
		isLast := i == len(nonSystemMessages)-1

		switch msg.Role {
		case "user":
			content, images := extractOpenAIUserContent(msg.Content)
			content = normalizeUserContent(content, len(images) > 0)

			if !systemMerged && systemPrompt != "" {
				content = systemPrompt + "\n" + content
				systemMerged = true
			}

			if isLast {
				currentContent = content
				currentImages = images
			} else {
				history = append(history, KiroHistoryMessage{
					UserInputMessage: &KiroUserInputMessage{
						Content: content,
						ModelID: modelID,
						Origin:  origin,
						Images:  images,
					},
				})
			}

		case "assistant":
			content := extractOpenAIMessageText(msg.Content)

			var toolUses []KiroToolUse
			for _, tc := range msg.ToolCalls {
				var input map[string]interface{}
				json.Unmarshal([]byte(tc.Function.Arguments), &input)
				if input == nil {
					input = make(map[string]interface{})
				}
				toolUses = append(toolUses, KiroToolUse{
					ToolUseID: tc.ID,
					Name:      tc.Function.Name,
					Input:     input,
				})
			}

			history = append(history, KiroHistoryMessage{
				AssistantResponseMessage: &KiroAssistantResponseMessage{
					Content:  content,
					ToolUses: toolUses,
				},
			})

		case "tool":
			content := extractOpenAIMessageText(msg.Content)
			currentToolResults = append(currentToolResults, KiroToolResult{
				ToolUseID: msg.ToolCallID,
				Content:   []KiroResultContent{{Text: content}},
				Status:    "success",
			})

			nextIdx := i + 1
			if nextIdx >= len(nonSystemMessages) || nonSystemMessages[nextIdx].Role != "tool" {
				if !isLast {
					history = append(history, KiroHistoryMessage{
						UserInputMessage: &KiroUserInputMessage{
							Content: buildToolResultsContinuation(currentToolResults),
							ModelID: modelID,
							Origin:  origin,
							UserInputMessageContext: &UserInputMessageContext{
								ToolResults: currentToolResults,
							},
						},
					})
					currentToolResults = nil
				}
			}
		}
	}

	finalContent := currentContent
	if finalContent == "" {
		if len(currentImages) > 0 {
			finalContent = normalizeUserContent("", true)
		} else if len(currentToolResults) > 0 {
			finalContent = buildToolResultsContinuation(currentToolResults)
		} else {
			finalContent = minimalFallbackUserContent
		}
	}
	if !systemMerged && systemPrompt != "" {
		finalContent = systemPrompt + "\n" + finalContent
	}

	kiroTools := convertOpenAITools(req.Tools)

	payload := &KiroPayload{}
	payload.ConversationState.ChatTriggerType = "MANUAL"
	payload.ConversationState.ConversationID = buildConversationID(modelID, systemPrompt, firstOpenAIConversationAnchor(nonSystemMessages))
	payload.ConversationState.CurrentMessage.UserInputMessage = KiroUserInputMessage{
		Content: finalContent,
		ModelID: modelID,
		Origin:  origin,
		Images:  currentImages,
	}

	if len(kiroTools) > 0 || len(currentToolResults) > 0 {
		payload.ConversationState.CurrentMessage.UserInputMessage.UserInputMessageContext = &UserInputMessageContext{
			Tools:       kiroTools,
			ToolResults: currentToolResults,
		}
	}

	if len(history) > 0 {
		payload.ConversationState.History = history
	}

	if req.MaxTokens > 0 || req.Temperature > 0 || req.TopP > 0 {
		payload.InferenceConfig = &InferenceConfig{
			MaxTokens:   req.MaxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
		}
	}

	return payload
}

func extractOpenAIUserContent(content interface{}) (string, []KiroImage) {
	if s, ok := content.(string); ok {
		return s, nil
	}

	var text string
	var images []KiroImage

	if part, ok := content.(map[string]interface{}); ok {
		if t, ok := extractOpenAITextPart(part); ok {
			text += t
		}
		if img := extractImageFromOpenAIPart(part); img != nil {
			images = append(images, *img)
		}
	}

	if parts, ok := content.([]interface{}); ok {
		for _, p := range parts {
			part, ok := p.(map[string]interface{})
			if !ok {
				continue
			}

			if t, ok := extractOpenAITextPart(part); ok {
				text += t
			}
			if img := extractImageFromOpenAIPart(part); img != nil {
				images = append(images, *img)
			}
		}
	}

	if len(images) > 0 {
		text = sanitizeImagePlaceholders(text)
	}

	return text, images
}

func extractOpenAIMessageText(content interface{}) string {
	if content == nil {
		return ""
	}

	if s, ok := content.(string); ok {
		return s
	}

	if text, _ := extractOpenAIUserContent(content); strings.TrimSpace(text) != "" {
		return text
	}

	switch v := content.(type) {
	case map[string]interface{}:
		if nested, ok := v["content"]; ok {
			if nestedText := extractOpenAIMessageText(nested); strings.TrimSpace(nestedText) != "" {
				return nestedText
			}
		}
		if raw, err := json.Marshal(v); err == nil {
			return string(raw)
		}
	case []interface{}:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			partText := extractOpenAIMessageText(item)
			if strings.TrimSpace(partText) != "" {
				parts = append(parts, partText)
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "")
		}
		if raw, err := json.Marshal(v); err == nil {
			return string(raw)
		}
	default:
		if raw, err := json.Marshal(v); err == nil {
			return string(raw)
		}
	}

	return ""
}

func buildToolResultsContinuation(toolResults []KiroToolResult) string {
	if len(toolResults) == 0 {
		return minimalFallbackUserContent
	}

	parts := make([]string, 0, len(toolResults))
	for _, tr := range toolResults {
		if len(tr.Content) == 0 {
			continue
		}
		for _, c := range tr.Content {
			if strings.TrimSpace(c.Text) != "" {
				parts = append(parts, c.Text)
			}
		}
	}

	if len(parts) == 0 {
		return minimalFallbackUserContent
	}

	joined := toolResultsContinuationPrefix + "\n\n" + strings.Join(parts, "\n\n")
	if len(joined) > 4000 {
		return joined[:4000]
	}
	return joined
}

func trimLeadingAssistantHistory(history []KiroHistoryMessage) []KiroHistoryMessage {
	idx := 0
	for idx < len(history) && history[idx].AssistantResponseMessage != nil {
		idx++
	}
	if idx == 0 {
		return history
	}
	if idx >= len(history) {
		return nil
	}
	return history[idx:]
}

func firstClaudeConversationAnchor(messages []ClaudeMessage) string {
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		text, _, toolResults := extractClaudeUserContent(msg.Content)
		if strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
		if len(toolResults) > 0 {
			continue
		}
	}

	return ""
}

func firstOpenAIConversationAnchor(messages []OpenAIMessage) string {
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		text := extractOpenAIMessageText(msg.Content)
		if strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}

	return ""
}

func buildConversationID(modelID, systemPrompt, anchor string) string {
	anchor = strings.TrimSpace(anchor)
	if isSyntheticConversationAnchor(anchor) {
		return uuid.New().String()
	}
	seed := strings.Join([]string{modelID, strings.TrimSpace(systemPrompt), anchor}, "\n")
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(seed)).String()
}

func isSyntheticConversationAnchor(anchor string) bool {
	if strings.TrimSpace(anchor) == "" {
		return true
	}

	normalized := strings.ToLower(strings.Join(strings.Fields(anchor), " "))
	switch normalized {
	case ".", "begin conversation", "please analyze the attached image.", strings.ToLower(minimalFallbackUserContent):
		return true
	default:
		return false
	}
}

func extractOpenAITextPart(part map[string]interface{}) (string, bool) {
	partType, _ := part["type"].(string)
	switch partType {
	case "text", "input_text":
		if t, ok := part["text"].(string); ok {
			return t, true
		}
	}

	if t, ok := part["text"].(string); ok {
		return t, true
	}

	return "", false
}

func extractImageFromOpenAIPart(part map[string]interface{}) *KiroImage {
	partType, _ := part["type"].(string)
	if partType != "" {
		switch partType {
		case "image", "image_url", "input_image", "file", "input_file":
		default:
			return nil
		}
	}

	if fileObj, ok := part["file"].(map[string]interface{}); ok {
		if img := extractImageFromOpenAIPart(fileObj); img != nil {
			return img
		}
	}

	if sourceObj, ok := part["source"].(map[string]interface{}); ok {
		if img := extractImageFromOpenAIPart(sourceObj); img != nil {
			return img
		}
	}

	if raw, ok := part["mime"].(string); ok && !strings.HasPrefix(strings.ToLower(raw), "image/") {
		return nil
	}
	if raw, ok := part["media_type"].(string); ok && !strings.HasPrefix(strings.ToLower(raw), "image/") {
		return nil
	}
	if raw, ok := part["mime_type"].(string); ok && !strings.HasPrefix(strings.ToLower(raw), "image/") {
		return nil
	}

	if raw, ok := part["url"].(string); ok {
		if img := parseDataURL(raw); img != nil {
			return img
		}
	}

	if raw, ok := part["b64_json"].(string); ok {
		if img := parseBase64Image(raw, "png"); img != nil {
			return img
		}
	}

	if raw, ok := part["image_url"]; ok {
		switch v := raw.(type) {
		case string:
			if img := parseDataURL(v); img != nil {
				return img
			}
		case map[string]interface{}:
			if u, ok := v["url"].(string); ok {
				if img := parseDataURL(u); img != nil {
					return img
				}
			}
		}
	}

	if raw, ok := part["image_base64"].(string); ok {
		if img := parseBase64Image(raw, "png"); img != nil {
			return img
		}
	}
	if raw, ok := part["data"].(string); ok {
		if img := parseDataURL(raw); img != nil {
			return img
		}
		if img := parseBase64Image(raw, "png"); img != nil {
			return img
		}
	}

	return nil
}

func sanitizeImagePlaceholders(text string) string {
	re := regexp.MustCompile(`\[Image\s+\d+\]`)
	cleaned := re.ReplaceAllString(text, "")
	cleaned = strings.Join(strings.Fields(cleaned), " ")
	return strings.TrimSpace(cleaned)
}

func normalizeUserContent(text string, hasImages bool) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" && hasImages {
		return "Please analyze the attached image."
	}
	return trimmed
}

func parseDataURL(url string) *KiroImage {
	cleaned := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(url, "\n", ""), "\r", ""))
	if strings.Contains(cleaned, "[Image") {
		return nil
	}
	re := regexp.MustCompile(`^data:image/([a-zA-Z0-9+.-]+)(;[a-zA-Z0-9=._:+-]+)*;base64,(.+)$`)
	matches := re.FindStringSubmatch(cleaned)
	if len(matches) == 4 {
		return parseBase64Image(matches[3], matches[1])
	}
	if len(matches) != 3 {
		return nil
	}

	return parseBase64Image(matches[2], matches[1])
}

func parseBase64Image(data, format string) *KiroImage {
	format = strings.ToLower(format)
	if format == "jpg" {
		format = "jpeg"
	}

	if _, err := base64.StdEncoding.DecodeString(data); err != nil {
		if _, errRaw := base64.RawStdEncoding.DecodeString(data); errRaw != nil {
			if _, errURL := base64.URLEncoding.DecodeString(data); errURL != nil {
				if _, errRawURL := base64.RawURLEncoding.DecodeString(data); errRawURL != nil {
					return nil
				}
			}
		}
	}

	if format == "" {
		format = "png"
	}

	return &KiroImage{
		Format: format,
		Source: struct {
			Bytes string `json:"bytes"`
		}{Bytes: data},
	}
}

func convertOpenAITools(tools []OpenAITool) []KiroToolWrapper {
	if len(tools) == 0 {
		return nil
	}

	result := make([]KiroToolWrapper, 0, len(tools))
	for _, tool := range tools {
		if tool.Type != "function" {
			continue
		}
		desc := tool.Function.Description
		if len(desc) > maxToolDescLen {
			desc = desc[:maxToolDescLen] + "..."
		}
		wrapper := KiroToolWrapper{}
		wrapper.ToolSpecification.Name = shortenToolName(tool.Function.Name)
		wrapper.ToolSpecification.Description = desc
		wrapper.ToolSpecification.InputSchema = InputSchema{JSON: tool.Function.Parameters}
		result = append(result, wrapper)
	}
	return result
}

func KiroToOpenAIResponse(content string, toolUses []KiroToolUse, inputTokens, outputTokens int, model string) *OpenAIResponse {
	msg := OpenAIMessage{
		Role: "assistant",
	}

	finishReason := "stop"

	if len(toolUses) > 0 {
		msg.Content = nil
		msg.ToolCalls = make([]ToolCall, len(toolUses))
		for i, tu := range toolUses {
			args, _ := json.Marshal(tu.Input)
			msg.ToolCalls[i] = ToolCall{
				ID:   tu.ToolUseID,
				Type: "function",
			}
			msg.ToolCalls[i].Function.Name = tu.Name
			msg.ToolCalls[i].Function.Arguments = string(args)
		}
		finishReason = "tool_calls"
	} else {
		msg.Content = content
	}

	return &OpenAIResponse{
		ID:      "chatcmpl-" + uuid.New().String(),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   model,
		Choices: []OpenAIChoice{{
			Index:        0,
			Message:      msg,
			FinishReason: finishReason,
		}},
		Usage: OpenAIUsage{
			PromptTokens:     inputTokens,
			CompletionTokens: outputTokens,
			TotalTokens:      inputTokens + outputTokens,
		},
	}
}

func extractThinkingFromContent(content string) (string, string) {
	var reasoning string
	result := content

	for {
		start := strings.Index(result, "<thinking>")
		if start == -1 {
			break
		}
		end := strings.Index(result[start:], "</thinking>")
		if end == -1 {
			break
		}
		end += start

		thinkingContent := result[start+10 : end]
		reasoning += thinkingContent

		result = result[:start] + result[end+11:]
	}

	return strings.TrimSpace(result), reasoning
}

func KiroToOpenAIResponseWithReasoning(content, reasoningContent string, toolUses []KiroToolUse, inputTokens, outputTokens int, model, thinkingFormat string) map[string]interface{} {
	finishReason := "stop"

	message := map[string]interface{}{
		"role": "assistant",
	}

	if len(toolUses) > 0 {
		message["content"] = nil
		toolCalls := make([]map[string]interface{}, len(toolUses))
		for i, tu := range toolUses {
			args, _ := json.Marshal(tu.Input)
			toolCalls[i] = map[string]interface{}{
				"id":   tu.ToolUseID,
				"type": "function",
				"function": map[string]string{
					"name":      tu.Name,
					"arguments": string(args),
				},
			}
		}
		message["tool_calls"] = toolCalls
		finishReason = "tool_calls"
	} else {
		if reasoningContent != "" {
			switch thinkingFormat {
			case "thinking":
				message["content"] = "<thinking>" + reasoningContent + "</thinking>" + content
			case "think":
				message["content"] = "<think>" + reasoningContent + "</think>" + content
			default:
				message["content"] = content
				message["reasoning_content"] = reasoningContent
			}
		} else {
			message["content"] = content
		}
	}

	return map[string]interface{}{
		"id":      "chatcmpl-" + uuid.New().String(),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []map[string]interface{}{{
			"index":         0,
			"message":       message,
			"finish_reason": finishReason,
		}},
		"usage": map[string]int{
			"prompt_tokens":     inputTokens,
			"completion_tokens": outputTokens,
			"total_tokens":      inputTokens + outputTokens,
		},
	}
}
