package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/bugracakmak/aether-api/database"
	"github.com/gin-gonic/gin"
)

// Admin endpoints — owner-only (gated by middleware.AdminRequired). All queries
// intentionally bypass per-user/per-vault scoping so the admin sees everything.

func adminPaginate(c *gin.Context) (int, int) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if limit <= 0 || limit > 200 {
		limit = 30
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// AdminStats returns global counts across all users.
func AdminStats(c *gin.Context) {
	var s struct {
		TotalUsers    int64 `gorm:"column:total_users" json:"total_users"`
		TotalNotes    int64 `gorm:"column:total_notes" json:"total_notes"`
		NotesToday    int64 `gorm:"column:notes_today" json:"notes_today"`
		NotesWeek     int64 `gorm:"column:notes_week" json:"notes_week"`
		Processing    int64 `gorm:"column:processing" json:"processing"`
		Errored       int64 `gorm:"column:errored" json:"errored"`
		TotalEntities int64 `gorm:"column:total_entities" json:"total_entities"`
		TotalVaults   int64 `gorm:"column:total_vaults" json:"total_vaults"`
	}
	database.DB.Raw(`SELECT
		(SELECT count(*) FROM users WHERE deleted_at IS NULL) AS total_users,
		(SELECT count(*) FROM notes WHERE deleted_at IS NULL) AS total_notes,
		(SELECT count(*) FROM notes WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '1 day') AS notes_today,
		(SELECT count(*) FROM notes WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '7 days') AS notes_week,
		(SELECT count(*) FROM notes WHERE deleted_at IS NULL AND status = 'processing') AS processing,
		(SELECT count(*) FROM notes WHERE deleted_at IS NULL AND status = 'error') AS errored,
		(SELECT count(*) FROM entities) AS total_entities,
		(SELECT count(*) FROM vaults WHERE deleted_at IS NULL) AS total_vaults
	`).Scan(&s)
	c.JSON(http.StatusOK, s)
}

// AdminListUsers lists every user with their note counts and last activity.
func AdminListUsers(c *gin.Context) {
	type userRow struct {
		ID        string     `gorm:"column:id" json:"id"`
		Email     string     `gorm:"column:email" json:"email"`
		Username  string     `gorm:"column:username" json:"username"`
		AvatarURL string     `gorm:"column:avatar_url" json:"avatar_url"`
		CreatedAt time.Time  `gorm:"column:created_at" json:"created_at"`
		NoteCount int64      `gorm:"column:note_count" json:"note_count"`
		LastNote  *time.Time `gorm:"column:last_note" json:"last_note_at"`
	}
	var rows []userRow
	database.DB.Raw(`
		SELECT u.id::text AS id, u.email, u.username, u.avatar_url, u.created_at,
		       count(n.id) AS note_count, max(n.created_at) AS last_note
		FROM users u
		LEFT JOIN notes n ON n.user_id = u.id AND n.deleted_at IS NULL
		WHERE u.deleted_at IS NULL
		GROUP BY u.id
		ORDER BY note_count DESC, u.created_at DESC
	`).Scan(&rows)
	c.JSON(http.StatusOK, gin.H{"users": rows})
}

type adminNoteRow struct {
	ID         string    `gorm:"column:id" json:"id"`
	Title      string    `gorm:"column:title" json:"title"`
	SourceURL  string    `gorm:"column:source_url" json:"source_url"`
	Status     string    `gorm:"column:status" json:"status"`
	Thumbnail  string    `gorm:"column:thumbnail_url" json:"thumbnail_url"`
	CreatedAt  time.Time `gorm:"column:created_at" json:"created_at"`
	OwnerEmail string    `gorm:"column:owner_email" json:"owner_email,omitempty"`
	OwnerName  string    `gorm:"column:owner_name" json:"owner_username,omitempty"`
}

// AdminUserNotes returns one user's saved notes (paginated).
func AdminUserNotes(c *gin.Context) {
	userID := c.Param("id")
	limit, offset := adminPaginate(c)
	var rows []adminNoteRow
	database.DB.Raw(`
		SELECT id::text AS id, title, source_url, status, thumbnail_url, created_at
		FROM notes WHERE user_id = ?::uuid AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT ? OFFSET ?
	`, userID, limit, offset).Scan(&rows)
	c.JSON(http.StatusOK, gin.H{"notes": rows})
}

// AdminFeed returns the most recently saved notes across ALL users.
func AdminFeed(c *gin.Context) {
	limit, offset := adminPaginate(c)
	var rows []adminNoteRow
	database.DB.Raw(`
		SELECT n.id::text AS id, n.title, n.source_url, n.status, n.thumbnail_url, n.created_at,
		       u.email AS owner_email, u.username AS owner_name
		FROM notes n JOIN users u ON u.id = n.user_id
		WHERE n.deleted_at IS NULL
		ORDER BY n.created_at DESC LIMIT ? OFFSET ?
	`, limit, offset).Scan(&rows)
	c.JSON(http.StatusOK, gin.H{"notes": rows})
}

// AdminGetNote returns the full content of any note (admin can read any user's note).
func AdminGetNote(c *gin.Context) {
	noteID := c.Param("id")
	var r struct {
		ID         string    `gorm:"column:id" json:"id"`
		Title      string    `gorm:"column:title" json:"title"`
		Content    string    `gorm:"column:content" json:"content"`
		AIInsight  string    `gorm:"column:ai_insight" json:"ai_insight"`
		SourceURL  string    `gorm:"column:source_url" json:"source_url"`
		Status     string    `gorm:"column:status" json:"status"`
		Thumbnail  string    `gorm:"column:thumbnail_url" json:"thumbnail_url"`
		CreatedAt  time.Time `gorm:"column:created_at" json:"created_at"`
		OwnerEmail string    `gorm:"column:owner_email" json:"owner_email"`
		OwnerName  string    `gorm:"column:owner_name" json:"owner_username"`
	}
	res := database.DB.Raw(`
		SELECT n.id::text AS id, n.title, n.content, n.ai_insight, n.source_url, n.status,
		       n.thumbnail_url, n.created_at, u.email AS owner_email, u.username AS owner_name
		FROM notes n JOIN users u ON u.id = n.user_id
		WHERE n.id = ?::uuid AND n.deleted_at IS NULL
	`, noteID).Scan(&r)
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}
	c.JSON(http.StatusOK, r)
}
