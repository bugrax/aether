package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Label represents a tag/category that can be applied to multiple notes.
// Uses GORM's many2many relationship — the junction table `note_labels`
// is auto-created with composite (note_id, label_id) primary key.
type Label struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	Name      string         `gorm:"size:100;not null" json:"name"`
	Color     string         `gorm:"size:7" json:"color"` // Hex color e.g. #8B5CF6
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User  User   `gorm:"foreignKey:UserID" json:"-"`
	Notes []Note `gorm:"many2many:note_labels;" json:"notes,omitempty"`
}
