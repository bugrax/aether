package models

import (
	"time"

	"github.com/google/uuid"
)

// ChatMessage represents a single message in an Aether AI chat session.
type ChatMessage struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	VaultID   uuid.UUID `gorm:"type:uuid;not null;index" json:"vault_id"`
	SessionID uuid.UUID `gorm:"type:uuid;not null;index" json:"session_id"`
	Role      string    `gorm:"size:20;not null" json:"role"` // "user" or "assistant"
	Content   string    `gorm:"type:text;not null" json:"content"`
	Feedback  int16     `gorm:"default:0" json:"feedback"` // -1, 0, 1
	CreatedAt time.Time `json:"created_at"`
}
