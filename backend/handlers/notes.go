package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

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
		Select("id, user_id, title, source_url, thumbnail_url, status, share_token, created_at, updated_at, deleted_at").
		Preload("Labels").
		Order("created_at DESC")

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

	// Pagination
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// Get total count before pagination
	var total int64
	countQuery := database.DB.Model(&models.Note{}).Where("user_id = ?", user.ID)
	if status := c.Query("status"); status != "" {
		countQuery = countQuery.Where("status = ?", status)
	}
	if labelID := c.Query("label_id"); labelID != "" {
		countQuery = countQuery.Joins("JOIN note_labels ON note_labels.note_id = notes.id").
			Where("note_labels.label_id = ?", labelID)
	}
	countQuery.Count(&total)

	query = query.Limit(limit).Offset(offset)

	if err := query.Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notes"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"notes":    notes,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
		"has_more": int64(offset+limit) < total,
	})
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

// GetRelatedNotes returns notes related to the given note.
func GetRelatedNotes(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	var relations []models.NoteRelation
	database.DB.Where("note_id_a = ? OR note_id_b = ?", noteID, noteID).
		Order("score DESC").
		Limit(5).
		Find(&relations)

	type RelatedNote struct {
		models.Note
		RelationType string `json:"relation_type"`
		Description  string `json:"relation_description"`
	}

	var results []RelatedNote
	for _, rel := range relations {
		relatedID := rel.NoteIDB.String()
		if relatedID == noteID {
			relatedID = rel.NoteIDA.String()
		}
		var note models.Note
		if err := database.DB.Where("id = ? AND user_id = ?", relatedID, user.ID).
			Preload("Labels").First(&note).Error; err == nil {
			results = append(results, RelatedNote{
				Note:         note,
				RelationType: rel.RelationType,
				Description:  rel.Description,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"related": results})
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
	processingTitle := "Processing..."
	if user.Language == "tr" {
		processingTitle = "İşleniyor..."
	}
	note := models.Note{
		UserID:    user.ID,
		Title:     processingTitle,
		SourceURL: req.URL,
		Status:    models.StatusProcessing,
	}

	if err := database.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create note"})
		return
	}

	// Enqueue job to Redis in Celery-compatible format
	taskID := uuid.New().String()
	aiLang := user.AILanguage
	if aiLang == "" {
		aiLang = user.Language
	}
	body := []interface{}{
		[]interface{}{note.ID.String(), req.URL}, // args
		map[string]interface{}{"language": aiLang}, // kwargs
		map[string]interface{}{"callbacks": nil, "errbacks": nil, "chain": nil, "chord": nil},
	}
	bodyJSON, _ := json.Marshal(body)

	kwargsRepr := "{'language': '" + aiLang + "'}"

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

// ToggleShare creates or removes a public share token for a note.
func ToggleShare(c *gin.Context) {
	user := middleware.GetUser(c)
	noteID := c.Param("id")

	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	if note.ShareToken != "" {
		// Remove share
		database.DB.Model(&note).Update("share_token", "")
		c.JSON(http.StatusOK, gin.H{"shared": false, "share_token": ""})
	} else {
		// Create share token
		token := uuid.New().String()[:8] + uuid.New().String()[:8]
		database.DB.Model(&note).Update("share_token", token)
		c.JSON(http.StatusOK, gin.H{"shared": true, "share_token": token})
	}
}

// GetSharedNote returns a note by its public share token (no auth required).
func GetSharedNote(c *gin.Context) {
	token := c.Param("token")

	var note models.Note
	if err := database.DB.Where("share_token = ? AND share_token != ''", token).
		Preload("Labels").First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shared note not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"title":         note.Title,
		"content":       note.Content,
		"ai_insight":    note.AIInsight,
		"source_url":    note.SourceURL,
		"thumbnail_url": note.ThumbnailURL,
		"labels":        note.Labels,
		"created_at":    note.CreatedAt,
		"status":        note.Status,
	})
}

// GetSharedNoteOG returns an HTML page with OG meta tags for link previews.
func GetSharedNoteOG(c *gin.Context) {
	token := c.Param("token")

	var note models.Note
	if err := database.DB.Where("share_token = ? AND share_token != ''", token).
		First(&note).Error; err != nil {
		c.Redirect(302, "https://aether.relayhaus.org")
		return
	}

	// Extract first ~200 chars of AI insight as description
	desc := note.AIInsight
	if len(desc) > 200 {
		desc = desc[:200] + "..."
	}
	// Strip markdown
	for _, ch := range []string{"#", "*", "|", "`", ">", "---"} {
		desc = strings.ReplaceAll(desc, ch, "")
	}

	thumbnail := note.ThumbnailURL
	if strings.HasPrefix(thumbnail, "data:") {
		thumbnail = "" // Can't use data URI in og:image
	}

	appURL := "https://app.aether.relayhaus.org/shared/" + token

	html := fmt.Sprintf(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>%s — Aether</title>
<meta property="og:title" content="%s" />
<meta property="og:description" content="%s" />
<meta property="og:type" content="article" />
<meta property="og:url" content="%s" />
<meta property="og:site_name" content="Aether" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="%s" />
<meta name="twitter:description" content="%s" />
%s
<meta http-equiv="refresh" content="0;url=%s" />
</head><body>Redirecting...</body></html>`,
		escapeHTML(note.Title), escapeHTML(note.Title), escapeHTML(desc),
		appURL, escapeHTML(note.Title), escapeHTML(desc),
		ogImage(thumbnail), appURL)

	c.Data(200, "text/html; charset=utf-8", []byte(html))
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func ogImage(url string) string {
	if url == "" {
		return ""
	}
	return fmt.Sprintf(`<meta property="og:image" content="%s" />`, escapeHTML(url))
}
