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
		"ai_rules":   user.AIRules,
	})
}

type UpdateSettingsRequest struct {
	Language   *string `json:"language,omitempty" binding:"omitempty,oneof=en tr"`
	AILanguage *string `json:"ai_language,omitempty" binding:"omitempty,oneof=en tr"`
	AIRules    *string `json:"ai_rules,omitempty"`
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
	if req.AIRules != nil {
		updates["ai_rules"] = *req.AIRules
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

// RegisterFCMToken saves the user's FCM push notification token.
func RegisterFCMToken(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.Model(&user).Update("fcm_token", req.Token)
	c.JSON(http.StatusOK, gin.H{"message": "FCM token registered"})
}

// DeleteAccount permanently deletes the user's account and all associated data.
func DeleteAccount(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	tx := database.DB.Begin()

	// Delete all junction + content data for this user
	tx.Exec("DELETE FROM note_labels WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)", user.ID)
	tx.Exec("DELETE FROM note_revisions WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)", user.ID)
	tx.Exec("DELETE FROM note_entities WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)", user.ID)
	tx.Exec("DELETE FROM note_relations WHERE vault_id IN (SELECT id FROM vaults WHERE user_id = ?)", user.ID)
	tx.Exec("DELETE FROM synthesis_notes WHERE synthesis_page_id IN (SELECT id FROM synthesis_pages WHERE user_id = ?)", user.ID)
	tx.Exec("DELETE FROM synthesis_pages WHERE user_id = ?", user.ID)
	tx.Exec("DELETE FROM entities WHERE user_id = ?", user.ID)
	tx.Exec("DELETE FROM activity_logs WHERE user_id = ?", user.ID)
	tx.Exec("DELETE FROM chat_messages WHERE user_id = ?", user.ID)
	tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.Note{})
	tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.Label{})
	tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.Vault{})

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
