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
		&models.Note{},
		&models.NoteRevision{},
		&models.Label{},
	)
	if err != nil {
		log.Fatalf("❌ Failed to run migrations: %v", err)
	}

	log.Println("✅ Database migrations completed")
}
