package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
)

// ── Embedding Sidecar DTOs ───────────────────────────

type embedRequest struct {
	Text string `json:"text"`
}

type embedResponse struct {
	Embedding  []float32 `json:"embedding"`
	Dimensions int       `json:"dimensions"`
}

// ── Search Handler ───────────────────────────────────

// SemanticSearch performs vector similarity search using pgvector.
// GET /api/v1/search?q=<query>
func SemanticSearch(c *gin.Context) {
	vault := middleware.GetVault(c)
	if vault == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	// Step 1: Get query embedding from sidecar
	embeddingURL := os.Getenv("EMBEDDING_URL")
	if embeddingURL == "" {
		embeddingURL = "http://localhost:8100"
	}

	embedding, err := getEmbedding(embeddingURL, query)
	if err != nil {
		// Fallback to text search if embedding sidecar is down
		fallbackTextSearch(c, vault.ID.String(), query)
		return
	}

	// Step 2: Vector similarity search with pgvector
	vecStr := formatVector(embedding)

	var results []models.Note
	err = database.DB.
		Where("vault_id = ? AND embedding IS NOT NULL", vault.ID).
		Preload("Labels").
		Order(fmt.Sprintf("embedding <=> '%s'", vecStr)).
		Limit(20).
		Find(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}

	// Build response with similarity scores
	type SearchResult struct {
		models.Note
		Score float64 `json:"score"`
	}

	var searchResults []SearchResult
	for i, note := range results {
		// Approximate score (1 = perfect match, 0 = no match)
		// pgvector cosine distance: 0 = identical, 2 = opposite
		score := 1.0 - float64(i)*0.05 // Simple rank-based score
		if score < 0 {
			score = 0
		}
		searchResults = append(searchResults, SearchResult{
			Note:  note,
			Score: score,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"query":   query,
		"results": searchResults,
		"count":   len(searchResults),
	})
}

// ── Helper Functions ─────────────────────────────────

func getEmbedding(baseURL, text string) ([]float32, error) {
	body, _ := json.Marshal(embedRequest{Text: text})
	resp, err := http.Post(baseURL+"/embed", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("embedding sidecar unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding error %d: %s", resp.StatusCode, string(b))
	}

	var result embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("embedding decode error: %w", err)
	}

	return result.Embedding, nil
}

func formatVector(embedding []float32) string {
	parts := make([]string, len(embedding))
	for i, v := range embedding {
		parts[i] = fmt.Sprintf("%f", v)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func fallbackTextSearch(c *gin.Context, vaultID, query string) {
	var results []models.Note
	pattern := "%" + query + "%"
	err := database.DB.
		Where("vault_id = ? AND (title ILIKE ? OR content ILIKE ? OR ai_insight ILIKE ?)",
			vaultID, pattern, pattern, pattern).
		Preload("Labels").
		Order("updated_at DESC").
		Limit(20).
		Find(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"query":   query,
		"results": results,
		"count":   len(results),
		"mode":    "text_fallback",
	})
}
