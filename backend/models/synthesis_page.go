package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SynthesisPage is an AI-generated topic page that aggregates knowledge across multiple notes.
type SynthesisPage struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	VaultID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"vault_id"`
	Topic     string         `gorm:"size:100;not null;index" json:"topic"`
	Title     string         `gorm:"size:500;not null" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`
	NoteCount int            `gorm:"default:0" json:"note_count"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User  User            `gorm:"foreignKey:UserID" json:"-"`
	Notes []SynthesisNote `gorm:"foreignKey:SynthesisPageID" json:"notes,omitempty"`
}

// SynthesisNote links a synthesis page to a contributing note.
type SynthesisNote struct {
	SynthesisPageID uuid.UUID `gorm:"type:uuid;not null;index" json:"synthesis_page_id"`
	NoteID          uuid.UUID `gorm:"type:uuid;not null;index" json:"note_id"`
}
