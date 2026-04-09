package database

import (
	"log"

	"github.com/bugracakmak/aether-api/config"
	"github.com/bugracakmak/aether-api/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database instance.
var DB *gorm.DB

// Connect initializes the PostgreSQL connection and runs auto-migrations.
func Connect(cfg *config.Config) {
	var err error

	logLevel := logger.Info
	if cfg.GinMode == "release" {
		logLevel = logger.Warn
	}

	DB, err = gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}

	log.Println("✅ Connected to PostgreSQL")

	// Enable uuid-ossp extension for gen_random_uuid()
	DB.Exec("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"")

	// Auto-migrate all models
	err = DB.AutoMigrate(
		&models.User{},
		&models.Vault{},
		&models.Note{},
		&models.NoteRevision{},
		&models.Label{},
		&models.ChatMessage{},
		&models.SynthesisPage{},
		&models.SynthesisNote{},
		&models.NoteRelation{},
		&models.ActivityLog{},
		&models.Entity{},
		&models.NoteEntity{},
	)
	if err != nil {
		log.Fatalf("❌ Failed to run migrations: %v", err)
	}

	// Backfill default vault for users without one
	backfillDefaultVaults()

	log.Println("✅ Database migrations completed")
}

// backfillDefaultVaults creates a default "My Vault" for every user that
// doesn't have one yet, and assigns all their existing content to it.
// Idempotent — safe to run on every startup.
func backfillDefaultVaults() {
	// Find users without any vault
	var userIDs []string
	DB.Raw(`
		SELECT u.id::text FROM users u
		LEFT JOIN vaults v ON v.user_id = u.id AND v.deleted_at IS NULL
		WHERE u.deleted_at IS NULL AND v.id IS NULL
	`).Scan(&userIDs)

	if len(userIDs) == 0 {
		return
	}

	log.Printf("🔄 Backfilling default vaults for %d user(s)...", len(userIDs))

	for _, userID := range userIDs {
		tx := DB.Begin()

		// 1. Create default vault
		var vaultID string
		err := tx.Raw(`
			INSERT INTO vaults (user_id, name, icon, color, is_default, created_at, updated_at)
			VALUES (?::uuid, 'My Vault', '🗂️', '#b79fff', true, NOW(), NOW())
			RETURNING id::text
		`, userID).Scan(&vaultID).Error
		if err != nil {
			tx.Rollback()
			log.Printf("⚠️ Failed to create default vault for user %s: %v", userID, err)
			continue
		}

		// 2. Backfill vault_id for all existing content
		tables := []string{"notes", "labels", "entities", "synthesis_pages", "activity_logs", "chat_messages"}
		for _, table := range tables {
			tx.Exec("UPDATE "+table+" SET vault_id = ?::uuid WHERE user_id = ?::uuid AND (vault_id IS NULL OR vault_id = '00000000-0000-0000-0000-000000000000')", vaultID, userID)
		}

		// 3. note_entities — inherit via note
		tx.Exec(`
			UPDATE note_entities ne SET vault_id = ?::uuid
			WHERE (ne.vault_id IS NULL OR ne.vault_id = '00000000-0000-0000-0000-000000000000')
			AND ne.note_id IN (SELECT id FROM notes WHERE user_id = ?::uuid)
		`, vaultID, userID)

		// 4. note_relations — inherit via notes (both sides belong to same user)
		tx.Exec(`
			UPDATE note_relations nr SET vault_id = ?::uuid
			WHERE (nr.vault_id IS NULL OR nr.vault_id = '00000000-0000-0000-0000-000000000000')
			AND nr.note_id_a IN (SELECT id FROM notes WHERE user_id = ?::uuid)
		`, vaultID, userID)

		tx.Commit()
	}

	log.Printf("✅ Default vault backfill complete")
}
