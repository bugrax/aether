package middleware

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// VaultResolver reads X-Vault-Id header and injects the Vault into the Gin context.
// If the header is missing or invalid, falls back to the user's default vault.
// Must run AFTER AuthRequired.
func VaultResolver() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetUser(c)
		if user == nil {
			c.Next()
			return
		}

		vaultIDStr := c.GetHeader("X-Vault-Id")
		var vault models.Vault

		if vaultIDStr != "" {
			if vaultID, err := uuid.Parse(vaultIDStr); err == nil {
				if err := database.DB.Where("id = ? AND user_id = ?", vaultID, user.ID).First(&vault).Error; err == nil {
					c.Set("vault", &vault)
					c.Next()
					return
				}
			}
		}

		// Fall back to default vault
		if err := database.DB.Where("user_id = ? AND is_default = ?", user.ID, true).First(&vault).Error; err != nil {
			// No default vault — create one
			vault = models.Vault{
				UserID:    user.ID,
				Name:      "My Vault",
				Icon:      "🗂️",
				Color:     "#b79fff",
				IsDefault: true,
			}
			if err := database.DB.Create(&vault).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create default vault"})
				c.Abort()
				return
			}
		}

		c.Set("vault", &vault)
		c.Next()
	}
}

// GetVault retrieves the current vault from the Gin context.
func GetVault(c *gin.Context) *models.Vault {
	v, exists := c.Get("vault")
	if !exists {
		return nil
	}
	vault, ok := v.(*models.Vault)
	if !ok {
		return nil
	}
	return vault
}
