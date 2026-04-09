package handlers

import (
	"net/http"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/gin-gonic/gin"
)

type graphNode struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Label string `json:"label"`
	Color string `json:"color"`
	Size  int    `json:"size"`
}

type graphLink struct {
	Source string  `json:"source"`
	Target string  `json:"target"`
	Score  float64 `json:"score"`
}

// GetGraph returns nodes and links for the knowledge graph visualization.
func GetGraph(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get notes with their primary label
	type noteRow struct {
		ID        string
		Title     string
		LabelName *string
		LabelColor *string
	}

	var rows []noteRow
	database.DB.Raw(`
		SELECT n.id, n.title,
			(SELECT l.name FROM labels l JOIN note_labels nl ON nl.label_id = l.id
			 WHERE nl.note_id = n.id AND LOWER(l.name) NOT IN ('youtube','instagram','twitter/x')
			 LIMIT 1) as label_name,
			(SELECT l.color FROM labels l JOIN note_labels nl ON nl.label_id = l.id
			 WHERE nl.note_id = n.id AND LOWER(l.name) NOT IN ('youtube','instagram','twitter/x')
			 LIMIT 1) as label_color
		FROM notes n
		WHERE n.vault_id = ? AND n.deleted_at IS NULL AND n.status = 'ready'
		ORDER BY n.created_at DESC LIMIT 200
	`, vault.ID).Scan(&rows)

	// Count relations per note for sizing
	type relCount struct {
		NoteID string
		Cnt    int
	}
	var counts []relCount
	database.DB.Raw(`
		SELECT note_id, COUNT(*) as cnt FROM (
			SELECT note_id_a as note_id FROM note_relations WHERE vault_id = ?
			UNION ALL
			SELECT note_id_b as note_id FROM note_relations WHERE vault_id = ?
		) sub GROUP BY note_id
	`, vault.ID, vault.ID).Scan(&counts)

	countMap := make(map[string]int)
	for _, c := range counts {
		countMap[c.NoteID] = c.Cnt
	}

	// Build nodes
	nodes := make([]graphNode, 0, len(rows))
	nodeSet := make(map[string]bool)
	for _, r := range rows {
		label := "Other"
		color := "#9093ff"
		if r.LabelName != nil {
			label = *r.LabelName
		}
		if r.LabelColor != nil {
			color = *r.LabelColor
		}
		size := 3
		if cnt, ok := countMap[r.ID]; ok {
			size = 3 + cnt
			if size > 15 {
				size = 15
			}
		}
		nodes = append(nodes, graphNode{
			ID:    r.ID,
			Title: r.Title,
			Label: label,
			Color: color,
			Size:  size,
		})
		nodeSet[r.ID] = true
	}

	// Get relations (only between nodes we have)
	type relRow struct {
		NoteIDA string
		NoteIDB string
		Score   float64
	}
	var rels []relRow
	database.DB.Raw(`
		SELECT note_id_a, note_id_b, score FROM note_relations
		WHERE vault_id = ? ORDER BY score DESC LIMIT 500
	`, vault.ID).Scan(&rels)

	links := make([]graphLink, 0)
	for _, r := range rels {
		if nodeSet[r.NoteIDA] && nodeSet[r.NoteIDB] {
			links = append(links, graphLink{
				Source: r.NoteIDA,
				Target: r.NoteIDB,
				Score:  r.Score,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes": nodes,
		"links": links,
	})
}
