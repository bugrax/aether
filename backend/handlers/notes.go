package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// RedisClient is set from main.go
var RedisClient *redis.Client

// ── Request / Response DTOs ───────────────────────────

type CreateNoteRequest struct {
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	SourceURL string   `json:"source_url,omitempty"`
	LabelIDs  []string `json:"label_ids,omitempty"`
}

type UpdateNoteRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type ShareURLRequest struct {
	URL string `json:"url" binding:"required"`
}

// ── Handlers ──────────────────────────────────────────

// ListNotes returns all notes for the authenticated user.
func ListNotes(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var notes []models.Note
	query := database.DB.Where("user_id = ?", user.ID).
		Preload("Labels").
		Order("updated_at DESC")

	// Optional status filter
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	// Optional label filter
	if labelID := c.Query("label_id"); labelID != "" {
		query = query.Joins("JOIN note_labels ON note_labels.note_id = notes.id").
			Where("note_labels.label_id = ?", labelID)
	}

	// Search
	if search := c.Query("q"); search != "" {
		query = query.Where("title ILIKE ? OR content ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if err := query.Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notes"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"notes": notes})
}

// GetNote returns a single note by ID.
func GetNote(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).
		Preload("Labels").
		First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	c.JSON(http.StatusOK, note)
}

// CreateNote creates a new note.
func CreateNote(c *gin.Context) {
	user := middleware.GetUser(c)
	var req CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note := models.Note{
		UserID:    user.ID,
		Title:     req.Title,
		Content:   req.Content,
		SourceURL: req.SourceURL,
		Status:    models.StatusDraft,
	}

	if err := database.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create note"})
		return
	}

	// Attach labels if provided
	if len(req.LabelIDs) > 0 {
		var labels []models.Label
		database.DB.Where("id IN ? AND user_id = ?", req.LabelIDs, user.ID).Find(&labels)
		database.DB.Model(&note).Association("Labels").Append(&labels)
	}

	// Reload with labels
	database.DB.Preload("Labels").First(&note, "id = ?", note.ID)

	c.JSON(http.StatusCreated, note)
}

// UpdateNote updates an existing note (triggers version history via BeforeUpdate hook).
func UpdateNote(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).
		First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	var req UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note.Title = req.Title
	note.Content = req.Content

	if err := database.DB.Save(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update note"})
		return
	}

	database.DB.Preload("Labels").First(&note, "id = ?", note.ID)
	c.JSON(http.StatusOK, note)
}

// DeleteNote soft-deletes a note.
func DeleteNote(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	result := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).Delete(&models.Note{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note deleted"})
}

// GetNoteRevisions returns the version history for a note.
func GetNoteRevisions(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	// Verify ownership
	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).
		First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	var revisions []models.NoteRevision
	database.DB.Where("note_id = ?", noteID).Order("version DESC").Find(&revisions)

	c.JSON(http.StatusOK, gin.H{"revisions": revisions})
}

// ShareURL creates a note from a shared URL and enqueues it for AI processing.
func ShareURL(c *gin.Context) {
	user := middleware.GetUser(c)
	var req ShareURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create note with "processing" status
	note := models.Note{
		UserID:    user.ID,
		Title:     "Processing...",
		SourceURL: req.URL,
		Status:    models.StatusProcessing,
	}

	if err := database.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create note"})
		return
	}

	// Enqueue job to Redis in Celery-compatible format
	taskID := uuid.New().String()
	body := []interface{}{
		[]interface{}{note.ID.String(), req.URL}, // args
		map[string]interface{}{"language": user.Language}, // kwargs
		map[string]interface{}{"callbacks": nil, "errbacks": nil, "chain": nil, "chord": nil},
	}
	bodyJSON, _ := json.Marshal(body)

	kwargsRepr := "{'language': '" + user.Language + "'}"

	celeryMsg := map[string]interface{}{
		"body":             string(bodyJSON),
		"content-encoding": "utf-8",
		"content-type":     "application/json",
		"headers": map[string]interface{}{
			"lang":       "py",
			"task":       "tasks.process_url",
			"id":         taskID,
			"root_id":    taskID,
			"parent_id":  nil,
			"group":      nil,
			"argsrepr":   "(" + note.ID.String() + ", " + req.URL + ")",
			"kwargsrepr": kwargsRepr,
			"origin":     "aether-api@go",
		},
		"properties": map[string]interface{}{
			"correlation_id": taskID,
			"reply_to":       "",
			"delivery_mode":  2,
			"delivery_info": map[string]interface{}{
				"exchange":    "",
				"routing_key": "celery",
			},
			"priority":    0,
			"body_encoding": "utf-8",
			"delivery_tag": taskID,
		},
	}
	celeryJSON, _ := json.Marshal(celeryMsg)

	if err := RedisClient.LPush(context.Background(), "celery", celeryJSON).Err(); err != nil {
		// Don't fail the request — the note is saved, just not enqueued
		note.Status = models.StatusError
		database.DB.Save(&note)
		c.JSON(http.StatusCreated, gin.H{
			"note":    note,
			"warning": "Job enqueue failed, note saved as error",
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"note":    note,
		"message": "URL shared and queued for processing",
	})
}

// UpdateNoteLabels replaces all labels on a note.
func UpdateNoteLabels(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).
		First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	var req struct {
		LabelIDs []string `json:"label_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Clear existing labels
	database.DB.Model(&note).Association("Labels").Clear()

	// Set new labels
	if len(req.LabelIDs) > 0 {
		var labels []models.Label
		database.DB.Where("id IN ? AND user_id = ?", req.LabelIDs, user.ID).Find(&labels)
		database.DB.Model(&note).Association("Labels").Append(&labels)
	}

	database.DB.Preload("Labels").First(&note, "id = ?", note.ID)
	c.JSON(http.StatusOK, note)
}
