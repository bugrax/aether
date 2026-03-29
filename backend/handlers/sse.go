package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// SSENoteStatus streams note status updates via Server-Sent Events.
// The client connects to GET /api/v1/notes/:id/stream and receives
// status updates every 2 seconds until the note reaches "ready" or "error".
func SSENoteStatus(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	// Verify ownership
	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).
		First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming not supported"})
		return
	}

	// Poll the database for status changes
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Send initial status
	sendSSEEvent(c, string(note.Status), note.Title)
	flusher.Flush()

	timeout := time.After(5 * time.Minute) // Max 5 minutes

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-timeout:
			sendSSEEvent(c, "timeout", "")
			flusher.Flush()
			return
		case <-ticker.C:
			var updated models.Note
			database.DB.Where("id = ?", noteID).First(&updated)

			sendSSEEvent(c, string(updated.Status), updated.Title)
			flusher.Flush()

			// Stop streaming when processing is complete
			if string(updated.Status) == string(models.StatusReady) || string(updated.Status) == string(models.StatusError) {
				return
			}
		}
	}
}

func sendSSEEvent(c *gin.Context, status, title string) {
	fmt.Fprintf(c.Writer, "data: {\"status\":\"%s\",\"title\":\"%s\"}\n\n", status, title)
}
