package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// ListSynthesisPages returns all synthesis pages for the user.
func ListSynthesisPages(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var pages []models.SynthesisPage
	database.DB.Where("user_id = ?", user.ID).
		Order("updated_at DESC").
		Find(&pages)

	c.JSON(http.StatusOK, gin.H{"pages": pages})
}

// GetSynthesisPage returns a single synthesis page with contributing notes.
func GetSynthesisPage(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	pageID := c.Param("id")
	var page models.SynthesisPage
	if err := database.DB.Where("id = ? AND user_id = ?", pageID, user.ID).
		First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Synthesis page not found"})
		return
	}

	// Get contributing note IDs
	var synthNotes []models.SynthesisNote
	database.DB.Where("synthesis_page_id = ?", page.ID).Find(&synthNotes)

	// Get the actual notes
	var noteIDs []string
	for _, sn := range synthNotes {
		noteIDs = append(noteIDs, sn.NoteID.String())
	}

	var notes []models.Note
	if len(noteIDs) > 0 {
		database.DB.Where("id IN ?", noteIDs).
			Preload("Labels").
			Find(&notes)
	}

	c.JSON(http.StatusOK, gin.H{
		"page":  page,
		"notes": notes,
	})
}
