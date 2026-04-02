package handlers

import (
	"log"
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// GetSettings fetched the user's settings.
func GetSettings(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"language":    user.Language,
		"ai_language": user.AILanguage,
		"username":    user.Username,
	})
}

type UpdateSettingsRequest struct {
	Language   *string `json:"language,omitempty" binding:"omitempty,oneof=en tr"`
	AILanguage *string `json:"ai_language,omitempty" binding:"omitempty,oneof=en tr"`
}

// UpdateSettings updates the user's settings.
func UpdateSettings(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req UpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Language != nil {
		updates["language"] = *req.Language
	}
	if req.AILanguage != nil {
		updates["ai_language"] = *req.AILanguage
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Settings updated"})
}

// DeleteAccount permanently deletes the user's account and all associated data.
func DeleteAccount(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	tx := database.DB.Begin()

	// Delete all note labels for user's notes
	if err := tx.Exec("DELETE FROM note_labels WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)", user.ID).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to delete note_labels for user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	// Delete all notes
	if err := tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.Note{}).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to delete notes for user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	// Delete all labels
	if err := tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.Label{}).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to delete labels for user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	// Delete the user
	if err := tx.Unscoped().Delete(&user).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Failed to delete user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	tx.Commit()
	log.Printf("🗑️ Account deleted: %s (%s)", user.Email, user.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Account deleted"})
}
