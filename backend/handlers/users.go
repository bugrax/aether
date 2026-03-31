package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
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
