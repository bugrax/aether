package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// ListEntities returns all entities for the current user.
func ListEntities(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	entityType := c.Query("type")
	q := c.Query("q")

	query := database.DB.Where("user_id = ?", user.ID).Order("note_count DESC, name ASC")

	if entityType != "" {
		query = query.Where("type = ?", entityType)
	}
	if q != "" {
		query = query.Where("LOWER(name) LIKE LOWER(?)", "%"+q+"%")
	}

	var entities []models.Entity
	query.Limit(500).Find(&entities)

	// Get total counts per type (ignoring current filter)
	type typeCount struct {
		Type  string `json:"type"`
		Count int    `json:"count"`
	}
	var typeCounts []typeCount
	database.DB.Raw(`
		SELECT type, COUNT(*) as count
		FROM entities
		WHERE user_id = ? AND deleted_at IS NULL
		GROUP BY type
		ORDER BY count DESC
	`, user.ID).Scan(&typeCounts)

	var totalCount int64
	database.DB.Model(&models.Entity{}).Where("user_id = ?", user.ID).Count(&totalCount)

	c.JSON(http.StatusOK, gin.H{
		"entities":    entities,
		"type_counts": typeCounts,
		"total":       totalCount,
	})
}

// GetEntity returns a single entity with its linked notes.
func GetEntity(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	entityID := c.Param("id")

	var entity models.Entity
	if err := database.DB.Where("id = ? AND user_id = ?", entityID, user.ID).First(&entity).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entity not found"})
		return
	}

	// Get linked notes
	type noteInfo struct {
		ID           string `json:"id"`
		Title        string `json:"title"`
		ThumbnailURL string `json:"thumbnail_url"`
		Context      string `json:"context"`
	}
	var notes []noteInfo
	database.DB.Raw(`
		SELECT n.id, n.title, n.thumbnail_url, ne.context
		FROM note_entities ne
		JOIN notes n ON n.id = ne.note_id
		WHERE ne.entity_id = ? AND n.deleted_at IS NULL AND n.status = 'ready'
		ORDER BY n.updated_at DESC
	`, entityID).Scan(&notes)

	c.JSON(http.StatusOK, gin.H{
		"entity": entity,
		"notes":  notes,
	})
}

// GetEntityGraph returns a graph with entities as hub nodes connecting notes.
func GetEntityGraph(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get entities with 2+ notes (hubs)
	type entityRow struct {
		ID        string
		Name      string
		Type      string
		NoteCount int
	}
	var entities []entityRow
	database.DB.Raw(`
		SELECT e.id, e.name, e.type, e.note_count
		FROM entities e
		WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.note_count >= 2
		ORDER BY e.note_count DESC LIMIT 100
	`, user.ID).Scan(&entities)

	// Get note-entity links
	type linkRow struct {
		NoteID   string
		EntityID string
	}
	var links []linkRow

	entityIDs := make([]string, len(entities))
	for i, e := range entities {
		entityIDs[i] = e.ID
	}

	if len(entityIDs) > 0 {
		database.DB.Raw(`
			SELECT ne.note_id, ne.entity_id
			FROM note_entities ne
			JOIN notes n ON n.id = ne.note_id
			WHERE ne.entity_id IN ? AND n.deleted_at IS NULL AND n.status = 'ready' AND n.user_id = ?
		`, entityIDs, user.ID).Scan(&links)
	}

	// Collect note IDs we need
	noteIDSet := make(map[string]bool)
	for _, l := range links {
		noteIDSet[l.NoteID] = true
	}

	// Get note details
	type noteRow struct {
		ID         string
		Title      string
		LabelName  *string
		LabelColor *string
	}
	var notes []noteRow
	if len(noteIDSet) > 0 {
		noteIDs := make([]string, 0, len(noteIDSet))
		for id := range noteIDSet {
			noteIDs = append(noteIDs, id)
		}
		database.DB.Raw(`
			SELECT n.id, n.title,
				(SELECT l.name FROM labels l JOIN note_labels nl ON nl.label_id = l.id
				 WHERE nl.note_id = n.id AND LOWER(l.name) NOT IN ('youtube','instagram','twitter/x')
				 LIMIT 1) as label_name,
				(SELECT l.color FROM labels l JOIN note_labels nl ON nl.label_id = l.id
				 WHERE nl.note_id = n.id AND LOWER(l.name) NOT IN ('youtube','instagram','twitter/x')
				 LIMIT 1) as label_color
			FROM notes n
			WHERE n.id IN ? AND n.deleted_at IS NULL
		`, noteIDs).Scan(&notes)
	}

	// Entity type → color mapping
	typeColors := map[string]string{
		"person":       "#FF6B6B",
		"concept":      "#4ECDC4",
		"tool":         "#45B7D1",
		"book":         "#96CEB4",
		"film":         "#FFEAA7",
		"music":        "#DDA0DD",
		"website":      "#74B9FF",
		"location":     "#FD79A8",
		"organization": "#A29BFE",
		"event":        "#FDCB6E",
	}

	// Build graph nodes
	type graphNodeOut struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Label    string `json:"label"`
		Color    string `json:"color"`
		Size     int    `json:"size"`
		NodeType string `json:"node_type"` // "note" or "entity"
	}

	nodeMap := make(map[string]bool)
	graphNodes := make([]graphNodeOut, 0)

	// Add entity nodes
	for _, e := range entities {
		color := typeColors[e.Type]
		if color == "" {
			color = "#9093ff"
		}
		size := 4 + e.NoteCount
		if size > 20 {
			size = 20
		}
		graphNodes = append(graphNodes, graphNodeOut{
			ID:       "entity:" + e.ID,
			Title:    e.Name,
			Label:    e.Type,
			Color:    color,
			Size:     size,
			NodeType: "entity",
		})
		nodeMap["entity:"+e.ID] = true
	}

	// Add note nodes
	for _, n := range notes {
		label := "Other"
		color := "#9093ff"
		if n.LabelName != nil {
			label = *n.LabelName
		}
		if n.LabelColor != nil {
			color = *n.LabelColor
		}
		graphNodes = append(graphNodes, graphNodeOut{
			ID:       n.ID,
			Title:    n.Title,
			Label:    label,
			Color:    color,
			Size:     5,
			NodeType: "note",
		})
		nodeMap[n.ID] = true
	}

	// Build links (note → entity)
	type graphLinkOut struct {
		Source string  `json:"source"`
		Target string  `json:"target"`
		Score  float64 `json:"score"`
	}
	graphLinks := make([]graphLinkOut, 0)
	for _, l := range links {
		src := l.NoteID
		tgt := "entity:" + l.EntityID
		if nodeMap[src] && nodeMap[tgt] {
			graphLinks = append(graphLinks, graphLinkOut{
				Source: src,
				Target: tgt,
				Score:  0.6,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes": graphNodes,
		"links": graphLinks,
	})
}
