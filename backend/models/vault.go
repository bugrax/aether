package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Vault represents a knowledge vault — a container for notes, labels,
// entities, synthesis pages, etc. Each user can have multiple vaults.
type Vault struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	Name      string         `gorm:"size:100;not null" json:"name"`
	Icon      string         `gorm:"size:10" json:"icon"`
	Color     string         `gorm:"size:7" json:"color"`
	IsDefault bool           `gorm:"default:false" json:"is_default"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
