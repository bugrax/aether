package handlers

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// In-memory store for desktop auth sessions (short-lived, no DB needed)
var (
	desktopSessions   = make(map[string]*desktopSession)
	desktopSessionsMu sync.RWMutex
)

type desktopSession struct {
	Token     string    `json:"token,omitempty"`
	CreatedAt time.Time `json:"-"`
}

func init() {
	// Cleanup expired sessions every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			desktopSessionsMu.Lock()
			for id, s := range desktopSessions {
				if time.Since(s.CreatedAt) > 10*time.Minute {
					delete(desktopSessions, id)
				}
			}
			desktopSessionsMu.Unlock()
		}
	}()
}

// CreateDesktopSession creates a new session for desktop auth polling.
// Called by desktop app before opening browser. No auth required.
func CreateDesktopSession(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id required"})
		return
	}

	desktopSessionsMu.Lock()
	desktopSessions[req.SessionID] = &desktopSession{
		CreatedAt: time.Now(),
	}
	desktopSessionsMu.Unlock()

	c.JSON(http.StatusOK, gin.H{"status": "created"})
}

// PollDesktopSession polls for a token. Called by desktop app.
// No auth required — session_id is the secret.
func PollDesktopSession(c *gin.Context) {
	sessionID := c.Query("session_id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id required"})
		return
	}

	desktopSessionsMu.RLock()
	session, exists := desktopSessions[sessionID]
	desktopSessionsMu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	if session.Token == "" {
		c.JSON(http.StatusAccepted, gin.H{"status": "waiting"})
		return
	}

	// Token is ready — return it and delete the session
	desktopSessionsMu.Lock()
	delete(desktopSessions, sessionID)
	desktopSessionsMu.Unlock()

	c.JSON(http.StatusOK, gin.H{"status": "ready", "token": session.Token})
}

// CompleteDesktopSession stores the token. Called by web app after login.
// Requires auth (user must be logged in on web).
func CompleteDesktopSession(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id" binding:"required"`
		Token     string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id and token required"})
		return
	}

	desktopSessionsMu.Lock()
	session, exists := desktopSessions[req.SessionID]
	if exists {
		session.Token = req.Token
	}
	desktopSessionsMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found or expired"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "completed"})
}
