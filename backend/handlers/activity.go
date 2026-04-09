package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// GetActivityLog returns recent activity for the user.
func GetActivityLog(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var logs []models.ActivityLog
	database.DB.Where("vault_id = ?", vault.ID).
		Order("created_at DESC").
		Limit(50).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{"activities": logs})
}
