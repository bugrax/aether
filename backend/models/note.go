package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NoteStatus represents the processing state of a note.
type NoteStatus string

const (
	StatusDraft      NoteStatus = "draft"
	StatusProcessing NoteStatus = "processing"
	StatusReady      NoteStatus = "ready"
	StatusError      NoteStatus = "error"
)

// Note represents a single note in the Aether vault.
type Note struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	Title     string         `gorm:"size:500" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`
	SourceURL    string         `gorm:"size:2048" json:"source_url,omitempty"`
	ThumbnailURL string         `gorm:"type:text" json:"thumbnail_url,omitempty"`
	Status       NoteStatus     `gorm:"type:varchar(20);default:'draft';not null;index" json:"status"`
	AIInsight         string         `gorm:"type:text" json:"ai_insight,omitempty"`
	CommunityComments string         `gorm:"type:text" json:"community_comments,omitempty"`
	ShareToken        string         `gorm:"size:64" json:"share_token,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User      User           `gorm:"foreignKey:UserID" json:"-"`
	Labels    []Label        `gorm:"many2many:note_labels;" json:"labels,omitempty"`
	Revisions []NoteRevision `gorm:"foreignKey:NoteID" json:"revisions,omitempty"`
}

// BeforeUpdate hook — automatically creates a revision snapshot before each update.
func (n *Note) BeforeUpdate(tx *gorm.DB) error {
	// Load the current state from DB before it gets overwritten
	var current Note
	if err := tx.Where("id = ?", n.ID).First(&current).Error; err != nil {
		return nil // Skip revision if note doesn't exist yet
	}

	// Count existing revisions for version numbering
	var count int64
	tx.Model(&NoteRevision{}).Where("note_id = ?", n.ID).Count(&count)

	revision := NoteRevision{
		NoteID:  n.ID,
		Title:   current.Title,
		Content: current.Content,
		Version: int(count) + 1,
	}

	return tx.Create(&revision).Error
}
