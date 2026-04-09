package handlers

import (
	"context"
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ── Vault Handlers ────────────────────────────────────

// ListVaults returns all vaults for the current user.
// Ensures at least one default vault exists — creates "My Vault" if the user has none.
func ListVaults(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var vaults []models.Vault
	database.DB.Where("user_id = ?", user.ID).Order("is_default DESC, created_at ASC").Find(&vaults)

	if len(vaults) == 0 {
		defaultVault := models.Vault{
			UserID:    user.ID,
			Name:      "My Vault",
			Icon:      "🗂️",
			Color:     "#b79fff",
			IsDefault: true,
		}
		if err := database.DB.Create(&defaultVault).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create default vault"})
			return
		}
		vaults = []models.Vault{defaultVault}
	}

	c.JSON(http.StatusOK, gin.H{"vaults": vaults})
}

type createVaultRequest struct {
	Name  string `json:"name" binding:"required"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

// CreateVault creates a new vault for the current user.
func CreateVault(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req createVaultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name required"})
		return
	}

	if req.Icon == "" {
		req.Icon = "🗂️"
	}
	if req.Color == "" {
		req.Color = "#b79fff"
	}

	vault := models.Vault{
		UserID: user.ID,
		Name:   req.Name,
		Icon:   req.Icon,
		Color:  req.Color,
	}

	if err := database.DB.Create(&vault).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create vault"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"vault": vault})
}

// UpdateVault updates an existing vault (name, icon, color).
func UpdateVault(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	vaultID := c.Param("id")
	var vault models.Vault
	if err := database.DB.Where("id = ? AND user_id = ?", vaultID, user.ID).First(&vault).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vault not found"})
		return
	}

	var req createVaultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.Name != "" {
		vault.Name = req.Name
	}
	if req.Icon != "" {
		vault.Icon = req.Icon
	}
	if req.Color != "" {
		vault.Color = req.Color
	}

	database.DB.Save(&vault)
	c.JSON(http.StatusOK, gin.H{"vault": vault})
}

// DeleteVault deletes a vault and cascades all its content.
// Cannot delete the default vault.
func DeleteVault(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	vaultID := c.Param("id")
	var vault models.Vault
	if err := database.DB.Where("id = ? AND user_id = ?", vaultID, user.ID).First(&vault).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vault not found"})
		return
	}

	if vault.IsDefault {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete default vault"})
		return
	}

	// Count other vaults
	var otherCount int64
	database.DB.Model(&models.Vault{}).Where("user_id = ? AND id != ?", user.ID, vaultID).Count(&otherCount)
	if otherCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your only vault"})
		return
	}

	tx := database.DB.Begin()

	// Get all note IDs in this vault (for cascading junction tables)
	var noteIDs []string
	tx.Raw("SELECT id::text FROM notes WHERE vault_id = ?", vault.ID).Scan(&noteIDs)

	// Cascade delete everything in this vault
	tx.Exec("DELETE FROM note_entities WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM note_relations WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM synthesis_notes WHERE synthesis_page_id IN (SELECT id FROM synthesis_pages WHERE vault_id = ?)", vault.ID)
	tx.Exec("DELETE FROM synthesis_pages WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM note_labels WHERE note_id IN (SELECT id FROM notes WHERE vault_id = ?)", vault.ID)
	tx.Exec("DELETE FROM note_revisions WHERE note_id IN (SELECT id FROM notes WHERE vault_id = ?)", vault.ID)
	tx.Exec("DELETE FROM activity_logs WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM chat_messages WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM entities WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM labels WHERE vault_id = ?", vault.ID)
	tx.Exec("DELETE FROM notes WHERE vault_id = ?", vault.ID)

	if err := tx.Delete(&vault).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete vault"})
		return
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// SetDefaultVault marks a vault as the default.
func SetDefaultVault(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	vaultID := c.Param("id")
	var vault models.Vault
	if err := database.DB.Where("id = ? AND user_id = ?", vaultID, user.ID).First(&vault).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vault not found"})
		return
	}

	tx := database.DB.Begin()
	tx.Model(&models.Vault{}).Where("user_id = ?", user.ID).Update("is_default", false)
	tx.Model(&vault).Update("is_default", true)
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"status": "default_set"})
}

// MoveNote moves a note to a different vault. Deletes AI-derived data and re-enqueues processing.
func MoveNote(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	noteID := c.Param("id")

	var req struct {
		TargetVaultID string `json:"target_vault_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_vault_id required"})
		return
	}

	// Validate note ownership
	var note models.Note
	if err := database.DB.Where("id = ? AND user_id = ?", noteID, user.ID).First(&note).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Validate target vault ownership
	targetVaultID, err := uuid.Parse(req.TargetVaultID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vault ID"})
		return
	}
	var targetVault models.Vault
	if err := database.DB.Where("id = ? AND user_id = ?", targetVaultID, user.ID).First(&targetVault).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target vault not found"})
		return
	}

	if note.VaultID == targetVaultID {
		c.JSON(http.StatusOK, gin.H{"status": "no_change"})
		return
	}

	tx := database.DB.Begin()

	// Delete AI-derived data
	tx.Exec("DELETE FROM note_entities WHERE note_id = ?", noteID)
	tx.Exec("DELETE FROM note_relations WHERE note_id_a = ? OR note_id_b = ?", noteID, noteID)
	tx.Exec("DELETE FROM synthesis_notes WHERE note_id = ?", noteID)
	// Remove any labels that were on this note (labels are per-vault)
	tx.Exec("DELETE FROM note_labels WHERE note_id = ?", noteID)

	// Update note's vault_id
	tx.Model(&note).Updates(map[string]interface{}{
		"vault_id": targetVaultID,
		"status":   "processing",
	})

	tx.Commit()

	// Re-enqueue processing task via Redis
	if note.SourceURL != "" && RedisClient != nil {
		lang := user.AILanguage
		if lang == "" {
			lang = user.Language
		}
		_ = enqueueProcessURL(context.Background(), note.ID.String(), note.SourceURL, targetVaultID.String(), lang)
	}

	c.JSON(http.StatusOK, gin.H{"status": "moved", "vault_id": targetVaultID})
}
