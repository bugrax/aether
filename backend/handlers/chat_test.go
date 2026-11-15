package handlers

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// fakeSSH emulates how ssh runs a remote command: it drops its own options and
// the host, joins the remaining words with spaces, and hands them to a shell.
const fakeSSH = `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -o|-i) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
shift
exec sh -c "$*"
`

// fakeClaude checks that tools are disabled, then emits stream-json like
// `claude -p --output-format stream-json --include-partial-messages`.
const fakeClaude = `#!/bin/sh
tools_ok=no
sys=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tools) [ "$2" = "" ] && tools_ok=yes; shift 2 ;;
    --system-prompt) sys="$2"; shift 2 ;;
    *) shift ;;
  esac
done
cat > /dev/null
if [ "$tools_ok" != yes ]; then
  echo '{"type":"result","is_error":true,"result":"tools not disabled"}'
  exit 1
fi
case "$sys" in *"no tools"*) ;; *) echo '{"type":"result","is_error":true,"result":"system prompt lost"}'; exit 1 ;; esac
echo '{"type":"system","subtype":"init","tools":[]}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Merhaba "}}}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"dünya"}}}'
echo '{"type":"result","subtype":"success","is_error":false,"result":"Merhaba dünya"}'
`

func writeScript(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func newSSEContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/v1/chat", nil)
	return c, w
}

func TestStreamClaudeResponseOverSSH(t *testing.T) {
	dir := t.TempDir()
	ssh := writeScript(t, dir, "ssh", fakeSSH)
	claude := writeScript(t, dir, "claude", fakeClaude)
	t.Setenv("CLAUDE_CLI_PATH", ssh+" -o StrictHostKeyChecking=no -i /dev/null root@host "+claude)

	c, w := newSSEContext()
	got, err := streamClaudeResponse(c, "<instructions>it's a test</instructions>")
	if err != nil {
		t.Fatalf("streamClaudeResponse: %v", err)
	}
	if got != "Merhaba dünya" {
		t.Fatalf("got %q, want %q", got, "Merhaba dünya")
	}
	body := w.Body.String()
	if strings.Count(body, "event: token") != 2 {
		t.Fatalf("want 2 token events (thinking excluded), body:\n%s", body)
	}
	if strings.Contains(body, "hmm") {
		t.Fatalf("thinking text leaked to client:\n%s", body)
	}
}

func TestStreamClaudeResponseErrorResult(t *testing.T) {
	dir := t.TempDir()
	claude := writeScript(t, dir, "claude", "#!/bin/sh\ncat >/dev/null\necho '{\"type\":\"result\",\"is_error\":true,\"result\":\"usage limit\"}'\n")
	t.Setenv("CLAUDE_CLI_PATH", claude)

	c, _ := newSSEContext()
	got, err := streamClaudeResponse(c, "hi")
	if err == nil || got != "" {
		t.Fatalf("want error and no text, got %q, %v", got, err)
	}
}

func TestStreamClaudeResponseNotConfigured(t *testing.T) {
	t.Setenv("CLAUDE_CLI_PATH", "")
	c, _ := newSSEContext()
	if _, err := streamClaudeResponse(c, "hi"); err == nil {
		t.Fatal("want error when CLAUDE_CLI_PATH is empty")
	}
}

func TestBuildClaudePromptOrder(t *testing.T) {
	history := []models.ChatMessage{
		{Role: "user", Content: "first"},
		{Role: "assistant", Content: "answer"},
		{Role: "user", Content: "latest question"},
	}
	p := buildClaudePrompt("SYS", history)
	if !strings.Contains(p, "<instructions>\nSYS\n</instructions>") {
		t.Fatalf("instructions missing:\n%s", p)
	}
	if strings.Index(p, "first") > strings.Index(p, "latest question") {
		t.Fatalf("history out of order:\n%s", p)
	}
}
