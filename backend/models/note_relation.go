package models

import (
	"time"

	"github.com/google/uuid"
)

// NoteRelation represents a relationship between two notes.
type NoteRelation struct {
	ID           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	VaultID      uuid.UUID `gorm:"type:uuid;not null;index" json:"vault_id"`
	NoteIDA      uuid.UUID `gorm:"type:uuid;not null;index" json:"note_id_a"`
	NoteIDB      uuid.UUID `gorm:"type:uuid;not null;index" json:"note_id_b"`
	RelationType string    `gorm:"size:20;not null" json:"relation_type"` // "related", "supports", "contradicts", "extends"
	Description  string    `gorm:"size:500" json:"description"`
	Score        float64   `gorm:"default:0" json:"score"`
	CreatedAt    time.Time `json:"created_at"`
}
