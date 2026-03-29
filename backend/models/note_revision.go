package models

import (
	"time"

	"github.com/google/uuid"
)

// NoteRevision stores an immutable snapshot of a note at a point in time.
// Every update to a Note automatically creates a new revision via the
// Note.BeforeUpdate GORM hook.
type NoteRevision struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	NoteID    uuid.UUID `gorm:"type:uuid;not null;index" json:"note_id"`
	Title     string    `gorm:"size:500" json:"title"`
	Content   string    `gorm:"type:text" json:"content"`
	Version   int       `gorm:"not null" json:"version"`
	CreatedAt time.Time `json:"created_at"` // Immutable — records when this snapshot was taken

	// Relations
	Note Note `gorm:"foreignKey:NoteID" json:"-"`
}
