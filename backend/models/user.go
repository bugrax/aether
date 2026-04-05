package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User represents a registered Aether user, authenticated via Firebase.
type User struct {
	ID         uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	FirebaseID string         `gorm:"uniqueIndex;not null;size:128" json:"firebase_id"`
	Email      string         `gorm:"uniqueIndex;not null" json:"email"`
	Username   string         `gorm:"uniqueIndex;not null;size:50" json:"username"`
	AvatarURL  string         `gorm:"size:2048" json:"avatar_url,omitempty"`
	Language   string         `gorm:"size:10;default:'en'" json:"language"`
	AILanguage string         `gorm:"size:10;default:''" json:"ai_language"`
	FCMToken   string         `gorm:"size:512;default:''" json:"-"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Notes  []Note  `gorm:"foreignKey:UserID" json:"notes,omitempty"`
	Labels []Label `gorm:"foreignKey:UserID" json:"labels,omitempty"`
}
