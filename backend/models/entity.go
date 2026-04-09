package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Entity represents an extracted entity (person, concept, tool, etc.)
type Entity struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID      uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	VaultID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"vault_id"`
	Name        string         `gorm:"size:200;not null" json:"name"`
	Type        string         `gorm:"size:30;not null;index" json:"type"` // person, concept, tool, book, film, music, website, location, organization, event
	Description string         `gorm:"size:500" json:"description"`
	NoteCount   int            `gorm:"default:0" json:"note_count"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User  User         `gorm:"foreignKey:UserID" json:"-"`
	Notes []NoteEntity `gorm:"foreignKey:EntityID" json:"-"`
}

// NoteEntity is the junction table between notes and entities.
type NoteEntity struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	NoteID    uuid.UUID `gorm:"type:uuid;not null;index" json:"note_id"`
	EntityID  uuid.UUID `gorm:"type:uuid;not null;index" json:"entity_id"`
	VaultID   uuid.UUID `gorm:"type:uuid;not null;index" json:"vault_id"`
	Context   string    `gorm:"size:300" json:"context"` // Short excerpt showing entity in context
	CreatedAt time.Time `json:"created_at"`
}
