package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// ── Request DTOs ──────────────────────────────────────

type CreateLabelRequest struct {
	Name  string `json:"name" binding:"required"`
	Color string `json:"color"` // Hex color e.g. #8B5CF6
}

type UpdateLabelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// ── Handlers ──────────────────────────────────────────

// ListLabels returns all labels for the authenticated user.
func ListLabels(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var labels []models.Label
	database.DB.Where("user_id = ?", user.ID).Order("name ASC").Find(&labels)

	c.JSON(http.StatusOK, gin.H{"labels": labels})
}

// CreateLabel creates a new label.
func CreateLabel(c *gin.Context) {
	user := middleware.GetUser(c)
	var req CreateLabelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	label := models.Label{
		UserID: user.ID,
		Name:   req.Name,
		Color:  req.Color,
	}

	if err := database.DB.Create(&label).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create label"})
		return
	}

	c.JSON(http.StatusCreated, label)
}

// UpdateLabel updates a label.
func UpdateLabel(c *gin.Context) {
	user := middleware.GetUser(c)
	labelID := c.Param("id")

	var label models.Label
	if err := database.DB.Where("id = ? AND user_id = ?", labelID, user.ID).
		First(&label).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Label not found"})
		return
	}

	var req UpdateLabelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		label.Name = req.Name
	}
	if req.Color != "" {
		label.Color = req.Color
	}

	database.DB.Save(&label)
	c.JSON(http.StatusOK, label)
}

// DeleteLabel soft-deletes a label.
func DeleteLabel(c *gin.Context) {
	user := middleware.GetUser(c)
	labelID := c.Param("id")

	result := database.DB.Where("id = ? AND user_id = ?", labelID, user.ID).Delete(&models.Label{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Label not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Label deleted"})
}
