package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/bugracakmak/aether-api/config"
	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/handlers"
	"github.com/bugracakmak/aether-api/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func main() {
	// ── Load Configuration ────────────────────────────
	cfg := config.Load()
	gin.SetMode(cfg.GinMode)

	// ── Database ──────────────────────────────────────
	database.Connect(cfg)

	// ── Redis ─────────────────────────────────────────
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("❌ Invalid Redis URL: %v", err)
	}
	redisClient := redis.NewClient(opt)

	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("❌ Failed to connect to Redis: %v", err)
	}
	log.Println("✅ Connected to Redis")

	// Share Redis client with handlers
	handlers.RedisClient = redisClient

	// ── Firebase Auth ─────────────────────────────────
	middleware.InitFirebase(cfg)

	// ── Router ────────────────────────────────────────
	r := gin.Default()

	// CORS — allow frontend origins
	allowedOrigins := []string{
		"http://localhost:5173",
		"http://localhost:3000",
		"capacitor://localhost",
		"https://localhost",
	}
	if extraOrigins := os.Getenv("ALLOWED_ORIGINS"); extraOrigins != "" {
		for _, o := range strings.Split(extraOrigins, ",") {
			allowedOrigins = append(allowedOrigins, strings.TrimSpace(o))
		}
	}
	allowedOriginsMap := make(map[string]bool)
	for _, o := range allowedOrigins {
		allowedOriginsMap[o] = true
	}
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			// Allow listed origins
			if allowedOriginsMap[origin] {
				return true
			}
			// Allow Chrome extension origins
			if strings.HasPrefix(origin, "chrome-extension://") {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// ── Health Check ──────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "aether-api",
			"time":    time.Now().UTC(),
		})
	})

	// ── API v1 Routes (Protected) ─────────────────────
	v1 := r.Group("/api/v1")
	v1.Use(middleware.AuthRequired())
	{
		// Notes
		v1.GET("/notes", handlers.ListNotes)
		v1.GET("/notes/:id", handlers.GetNote)
		v1.POST("/notes", handlers.CreateNote)
		v1.PUT("/notes/:id", handlers.UpdateNote)
		v1.DELETE("/notes/:id", handlers.DeleteNote)
		v1.GET("/notes/:id/revisions", handlers.GetNoteRevisions)
		v1.PUT("/notes/:id/labels", handlers.UpdateNoteLabels)

		// User Settings
		v1.GET("/user/settings", handlers.GetSettings)
		v1.PATCH("/user/settings", handlers.UpdateSettings)

		// Share URL (AI processing pipeline)
		v1.POST("/share", handlers.ShareURL)

		// SSE — Real-time note status stream
		v1.GET("/notes/:id/stream", handlers.SSENoteStatus)

		// Semantic Search (pgvector)
		v1.GET("/search", handlers.SemanticSearch)

		// Labels
		v1.GET("/labels", handlers.ListLabels)
		v1.POST("/labels", handlers.CreateLabel)
		v1.PUT("/labels/:id", handlers.UpdateLabel)
		v1.DELETE("/labels/:id", handlers.DeleteLabel)
	}

	// ── Start Server ──────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.APIPort,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("🚀 Aether API running on :%s", cfg.APIPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Server error: %v", err)
		}
	}()

	// ── Graceful Shutdown ─────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down Aether API...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("❌ Forced shutdown: %v", err)
	}

	redisClient.Close()
	log.Println("👋 Aether API stopped")
}
