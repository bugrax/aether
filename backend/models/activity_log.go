package models

import (
	"time"

	"github.com/google/uuid"
)

// ActivityLog records vault activity for the changelog.
type ActivityLog struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Action      string    `gorm:"size:50;not null" json:"action"` // "note_created", "note_processed", "synthesis_created", "relation_found"
	Title       string    `gorm:"size:500" json:"title"`
	Description string    `gorm:"size:1000" json:"description"`
	NoteID      *uuid.UUID `gorm:"type:uuid" json:"note_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
