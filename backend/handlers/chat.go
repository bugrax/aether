package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ── Request/Response DTOs ───────────────────────────

type chatRequest struct {
	Message   string `json:"message" binding:"required"`
	SessionID string `json:"session_id" binding:"required"`
	Language  string `json:"language"`
}

type feedbackRequest struct {
	Feedback int16 `json:"feedback" binding:"required"`
}

// ── Chat Message (SSE Streaming) ────────────────────

// ChatMessage handles a user chat message and streams an AI response via SSE.
// POST /api/v1/chat
func ChatMessage(c *gin.Context) {
	user := middleware.GetUser(c)
	vault := middleware.GetVault(c)
	if user == nil || vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session_id"})
		return
	}

	lang := req.Language
	if lang == "" {
		lang = user.Language
	}
	if lang == "" {
		lang = "en"
	}

	// Save user message to DB
	userMsg := models.ChatMessage{
		UserID:    user.ID,
		VaultID:   vault.ID,
		SessionID: sessionID,
		Role:      "user",
		Content:   req.Message,
	}
	database.DB.Create(&userMsg)

	// Gather vault context
	vaultContext := buildVaultContext(user, vault, req.Message)

	// Load conversation history: the 10 most recent messages of this session
	// (including the one just saved), oldest first.
	var history []models.ChatMessage
	database.DB.Where("vault_id = ? AND session_id = ?", vault.ID, sessionID).
		Order("created_at DESC").
		Limit(10).
		Find(&history)
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	systemPrompt := buildSystemPrompt(user, lang, vaultContext)

	// Stream response via SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Transfer-Encoding", "chunked")

	// Send initial SSE comment to establish the stream connection
	fmt.Fprintf(c.Writer, ": stream opened\n\n")
	c.Writer.Flush()

	// Primary: Claude CLI on the host. Fallback: Gemini, but only if Claude failed
	// before streaming anything (otherwise the user would see two answers spliced).
	fullResponse, err := streamClaudeResponse(c, buildClaudePrompt(systemPrompt, history))
	if err != nil {
		log.Printf("❌ Chat Claude error: %v", err)
		if apiKey := os.Getenv("GEMINI_API_KEY"); fullResponse == "" && apiKey != "" {
			fullResponse, err = streamGeminiResponse(c, apiKey, buildGeminiMessages(systemPrompt, history))
			if err != nil {
				log.Printf("❌ Chat Gemini error: %v", err)
			}
		}
	}
	if err != nil {
		errMsg := "AI is temporarily unavailable. Please try again in a moment."
		if strings.Contains(err.Error(), "429") {
			errMsg = "AI rate limit reached. Please wait a minute and try again."
		}
		errJSON, _ := json.Marshal(map[string]string{"error": errMsg})
		sendSSE(c, "error", string(errJSON))
		return
	}

	// Save assistant response to DB (only if non-empty)
	if fullResponse == "" {
		log.Printf("⚠️ Chat: AI returned empty response for session %s", sessionID)
		errJSON, _ := json.Marshal(map[string]string{"error": "AI returned empty response. Please try again."})
		sendSSE(c, "error", string(errJSON))
		c.Writer.Flush()
		return
	}

	assistantMsg := models.ChatMessage{
		UserID:    user.ID,
		VaultID:   vault.ID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   fullResponse,
	}
	database.DB.Create(&assistantMsg)

	// Send final event with message ID
	sendSSE(c, "done", fmt.Sprintf(`{"id":"%s"}`, assistantMsg.ID.String()))
	c.Writer.Flush()
}

// ── Chat Feedback ───────────────────────────────────

// ChatFeedback updates thumbs up/down on a chat message.
// POST /api/v1/chat/:id/feedback
func ChatFeedback(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	msgID := c.Param("id")
	var req feedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := database.DB.Model(&models.ChatMessage{}).
		Where("id = ? AND vault_id = ?", msgID, vault.ID).
		Update("feedback", req.Feedback)

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Feedback saved"})
}

// ── Chat History ────────────────────────────────────

// ChatSessions returns recent chat sessions.
// GET /api/v1/chat/sessions
func ChatSessions(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	type SessionPreview struct {
		SessionID string    `json:"session_id"`
		Preview   string    `json:"preview"`
		CreatedAt time.Time `json:"created_at"`
	}

	var sessions []SessionPreview
	database.DB.Raw(`
		SELECT DISTINCT ON (session_id)
			session_id, content AS preview, created_at
		FROM chat_messages
		WHERE vault_id = ? AND role = 'user'
		ORDER BY session_id, created_at ASC
	`, vault.ID).Scan(&sessions)

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// ChatSessionMessages returns all messages for a session.
// GET /api/v1/chat/sessions/:session_id
func ChatSessionMessages(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	sessionID := c.Param("session_id")
	var messages []models.ChatMessage
	database.DB.Where("vault_id = ? AND session_id = ?", vault.ID, sessionID).
		Order("created_at ASC").
		Find(&messages)

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// ── Vault Context Builder ───────────────────────────

type vaultContext struct {
	RelevantNotes []noteSnippet
	RecentNotes   []noteSnippet
	Labels        []string
	TotalNotes    int
}

type noteSnippet struct {
	ID        string
	Title     string
	Insight   string
	UpdatedAt time.Time
}

func buildVaultContext(user *models.User, vault *models.Vault, query string) vaultContext {
	ctx := vaultContext{}

	// Total note count
	var count int64
	database.DB.Model(&models.Note{}).Where("vault_id = ? AND deleted_at IS NULL", vault.ID).Count(&count)
	ctx.TotalNotes = int(count)

	// Labels
	var labels []models.Label
	database.DB.Where("vault_id = ? AND deleted_at IS NULL", vault.ID).Find(&labels)
	for _, l := range labels {
		ctx.Labels = append(ctx.Labels, l.Name)
	}

	// Recent 5 notes
	var recentNotes []models.Note
	database.DB.Where("vault_id = ? AND deleted_at IS NULL", vault.ID).
		Order("updated_at DESC").Limit(5).Find(&recentNotes)
	for _, n := range recentNotes {
		insight := n.AIInsight
		if len(insight) > 300 {
			insight = insight[:150] + "..."
		}
		ctx.RecentNotes = append(ctx.RecentNotes, noteSnippet{
			ID: n.ID.String(), Title: n.Title, Insight: insight, UpdatedAt: n.UpdatedAt,
		})
	}

	// Semantic search for relevant notes
	embeddingURL := os.Getenv("EMBEDDING_URL")
	if embeddingURL == "" {
		embeddingURL = "http://localhost:8100"
	}
	embedding, err := getEmbedding(embeddingURL, query)
	if err == nil {
		vecStr := formatVector(embedding)
		var relevant []models.Note
		database.DB.
			Where("vault_id = ? AND embedding IS NOT NULL AND deleted_at IS NULL", vault.ID).
			Order(fmt.Sprintf("embedding <=> '%s'", vecStr)).
			Limit(5).
			Find(&relevant)
		for _, n := range relevant {
			insight := n.AIInsight
			if len(insight) > 300 {
				insight = insight[:150] + "..."
			}
			ctx.RelevantNotes = append(ctx.RelevantNotes, noteSnippet{
				ID: n.ID.String(), Title: n.Title, Insight: insight, UpdatedAt: n.UpdatedAt,
			})
		}
	}

	return ctx
}

func buildSystemPrompt(user *models.User, lang string, ctx vaultContext) string {
	langName := "English"
	if lang == "tr" {
		langName = "Turkish"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`You are Aether AI, an intelligent assistant for a personal knowledge vault app called Aether.
You help the user understand, connect, and explore their saved notes and content.
RESPOND ENTIRELY IN %s. Be concise, helpful, and conversational.
Use markdown formatting for clarity.

IMPORTANT: When referencing notes, use this link format so users can click to open them:
[Note Title](aether://note/NOTE_ID)
Each note in the context below includes its ID. Always link to notes when mentioning them.

`, langName))

	sb.WriteString(fmt.Sprintf("The user's vault contains %d notes", ctx.TotalNotes))
	if len(ctx.Labels) > 0 {
		sb.WriteString(fmt.Sprintf(" organized with labels: %s", strings.Join(ctx.Labels, ", ")))
	}
	sb.WriteString(".\n\n")

	if len(ctx.RelevantNotes) > 0 {
		sb.WriteString("RELEVANT NOTES (based on current question):\n")
		for _, n := range ctx.RelevantNotes {
			sb.WriteString(fmt.Sprintf("- ID: %s | Title: %s | %s\n", n.ID, n.Title, n.Insight))
		}
		sb.WriteString("\n")
	}

	if len(ctx.RecentNotes) > 0 {
		sb.WriteString("RECENT ACTIVITY:\n")
		for _, n := range ctx.RecentNotes {
			sb.WriteString(fmt.Sprintf("- ID: %s | [%s] Title: %s | %s\n", n.ID, n.UpdatedAt.Format("Jan 2"), n.Title, n.Insight))
		}
		sb.WriteString("\n")
	}

	// Include user's custom AI rules
	if user.AIRules != "" {
		sb.WriteString(fmt.Sprintf("\nUSER'S CUSTOM RULES:\n%s\n\n", user.AIRules))
	}

	sb.WriteString(`Reference specific notes by title when relevant. Keep responses focused and actionable.

SPECIAL COMMANDS you can handle:
- If user asks to "analyze vault" or "vault health" or "vault'umu analiz et": Analyze the notes context for contradictions, knowledge gaps, stale content, and suggest improvements.
- If user asks for "weekly summary" or "haftalık özet": Summarize recent activity grouped by topic with cross-connections.
- If user asks to "find contradictions" or "çelişkileri bul": Compare notes and highlight opposing claims.`)
	return sb.String()
}

// ── Claude CLI (primary) ────────────────────────────

// chatClaudeSystemPrompt replaces Claude Code's default agent prompt. It holds no
// user data; the vault context and conversation go in through stdin.
const chatClaudeSystemPrompt = `You are Aether AI, the assistant inside Aether, a personal knowledge vault app. ` +
	`You have no tools and no file, shell, or web access. Answer only from the vault context and conversation ` +
	`in the user's message, and never claim to have opened files, run commands, or browsed. ` +
	`Follow the guidance in the <instructions> block of the message.`

func buildClaudePrompt(systemPrompt string, history []models.ChatMessage) string {
	var sb strings.Builder
	sb.WriteString("<instructions>\n")
	sb.WriteString(systemPrompt)
	sb.WriteString("\n</instructions>\n\n<conversation>\n")
	for _, msg := range history {
		role := "User"
		if msg.Role == "assistant" {
			role = "Assistant"
		}
		fmt.Fprintf(&sb, "%s: %s\n\n", role, msg.Content)
	}
	sb.WriteString("</conversation>\n\nWrite the Assistant's reply to the last User message. Output only the reply itself.")
	return sb.String()
}

// shellQuote quotes s for a POSIX shell.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// claudeCLICommand builds the Claude CLI command from CLAUDE_CLI_PATH, which is
// either a local binary or an ssh prefix ending in the remote binary path.
func claudeCLICommand(ctx context.Context, args ...string) (*exec.Cmd, error) {
	base := strings.Fields(os.Getenv("CLAUDE_CLI_PATH"))
	if len(base) == 0 {
		return nil, fmt.Errorf("CLAUDE_CLI_PATH not configured")
	}
	if filepath.Base(base[0]) == "ssh" {
		// ssh joins the remote command's words with spaces and the remote shell
		// re-splits them, so every argument must be quoted (and "" survives).
		quoted := make([]string, len(args))
		for i, a := range args {
			quoted[i] = shellQuote(a)
		}
		args = quoted
	}
	return exec.CommandContext(ctx, base[0], append(base[1:], args...)...), nil
}

// streamClaudeResponse runs `claude -p` with all tools disabled and forwards its
// text deltas to the client as SSE "token" events. It returns the full text; on
// error the text is whatever was streamed before the failure.
func streamClaudeResponse(c *gin.Context, prompt string) (string, error) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()

	model := os.Getenv("CLAUDE_MODEL")
	if model == "" {
		model = "sonnet"
	}
	// --tools "" is a hard requirement: chat input is untrusted and the CLI runs
	// as root on the host, so it must not be able to read files or run commands.
	cmd, err := claudeCLICommand(ctx,
		"-p",
		"--tools", "",
		"--strict-mcp-config",
		"--no-session-persistence",
		"--model", model,
		"--system-prompt", chatClaudeSystemPrompt,
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
	)
	if err != nil {
		return "", err
	}
	cmd.Stdin = strings.NewReader(prompt)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start claude: %w", err)
	}

	var full strings.Builder
	var resultText string
	var resultIsError, gotResult bool

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		var ev struct {
			Type  string `json:"type"`
			Event struct {
				Type  string `json:"type"`
				Delta struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"delta"`
			} `json:"event"`
			IsError bool   `json:"is_error"`
			Result  string `json:"result"`
		}
		if json.Unmarshal(scanner.Bytes(), &ev) != nil {
			continue
		}
		switch ev.Type {
		case "stream_event":
			// Only text deltas; thinking deltas are not shown to the user.
			if ev.Event.Type == "content_block_delta" && ev.Event.Delta.Type == "text_delta" && ev.Event.Delta.Text != "" {
				full.WriteString(ev.Event.Delta.Text)
				tokenJSON, _ := json.Marshal(map[string]string{"text": ev.Event.Delta.Text})
				sendSSE(c, "token", string(tokenJSON))
				c.Writer.Flush()
			}
		case "result":
			gotResult = true
			resultText = ev.Result
			resultIsError = ev.IsError
		}
	}
	waitErr := cmd.Wait()

	if resultIsError {
		return full.String(), fmt.Errorf("claude returned error: %.300s", resultText)
	}
	if !gotResult || (waitErr != nil && full.Len() == 0) {
		return full.String(), fmt.Errorf("claude cli failed (%v): %.300s", waitErr, strings.TrimSpace(stderr.String()))
	}
	// No partial messages were streamed (older CLI): send the final text at once.
	if full.Len() == 0 && resultText != "" {
		full.WriteString(resultText)
		tokenJSON, _ := json.Marshal(map[string]string{"text": resultText})
		sendSSE(c, "token", string(tokenJSON))
		c.Writer.Flush()
	}
	return full.String(), nil
}

// ── Gemini API (fallback) ───────────────────────────

type geminiContent struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiSafety struct {
	Category  string `json:"category"`
	Threshold string `json:"threshold"`
}

type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	SafetySettings    []geminiSafety  `json:"safetySettings,omitempty"`
}

func buildGeminiMessages(systemPrompt string, history []models.ChatMessage) geminiRequest {
	req := geminiRequest{
		SystemInstruction: &geminiContent{
			Role:  "user",
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		SafetySettings: []geminiSafety{
			{Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_ONLY_HIGH"},
			{Category: "HARM_CATEGORY_HATE_SPEECH", Threshold: "BLOCK_ONLY_HIGH"},
			{Category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", Threshold: "BLOCK_ONLY_HIGH"},
			{Category: "HARM_CATEGORY_DANGEROUS_CONTENT", Threshold: "BLOCK_ONLY_HIGH"},
		},
	}

	for _, msg := range history {
		role := "user"
		if msg.Role == "assistant" {
			role = "model"
		}
		req.Contents = append(req.Contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: msg.Content}},
		})
	}

	return req
}

func streamGeminiResponse(c *gin.Context, apiKey string, messages geminiRequest) (string, error) {
	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=%s",
		apiKey,
	)

	body, err := json.Marshal(messages)
	if err != nil {
		return "", fmt.Errorf("marshal error: %w", err)
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini %d: %s", resp.StatusCode, string(b))
	}

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		if lineCount <= 3 {
			log.Printf("📡 Chat SSE line %d: %s", lineCount, line[:min(len(line), 200)])
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		// Log first data chunk
		if fullResponse.Len() == 0 {
			log.Printf("📡 Chat first data chunk: %s", data[:min(len(data), 300)])
		}

		var chunk struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
			PromptFeedback struct {
				BlockReason string `json:"blockReason"`
			} `json:"promptFeedback"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		// Check if blocked by safety
		if chunk.PromptFeedback.BlockReason != "" {
			log.Printf("⚠️ Chat blocked by Gemini safety: %s", chunk.PromptFeedback.BlockReason)
			// Return a friendly message instead of empty
			fallback := "I can help you explore your vault. Could you rephrase your question?"
			fullResponse.WriteString(fallback)
			tokenJSON, _ := json.Marshal(map[string]string{"text": fallback})
			sendSSE(c, "token", string(tokenJSON))
			c.Writer.Flush()
			break
		}

		for _, candidate := range chunk.Candidates {
			for _, part := range candidate.Content.Parts {
				if part.Text != "" {
					fullResponse.WriteString(part.Text)
					tokenJSON, _ := json.Marshal(map[string]string{"text": part.Text})
					sendSSE(c, "token", string(tokenJSON))
					c.Writer.Flush()
				}
			}
		}
	}

	return fullResponse.String(), nil
}

func sendSSE(c *gin.Context, event, data string) {
	fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, data)
}
