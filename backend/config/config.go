package config

import (
	"fmt"
	"os"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	// Database
	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string

	// Redis
	RedisURL string

	// Server
	APIPort string
	GinMode string

	// Firebase
	FirebaseCredentialsPath string
	FirebaseProjectID      string

	// LLM
	GeminiAPIKey string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		DBHost:     getEnv("POSTGRES_HOST", "localhost"),
		DBPort:     getEnv("POSTGRES_PORT", "5432"),
		DBName:     getEnv("POSTGRES_DB", "aether"),
		DBUser:     getEnv("POSTGRES_USER", "aether"),
		DBPassword: getEnv("POSTGRES_PASSWORD", "aether_secret"),

		RedisURL: getEnv("REDIS_URL", "redis://localhost:6379/0"),

		APIPort: getEnv("API_PORT", "8080"),
		GinMode: getEnv("GIN_MODE", "debug"),

		FirebaseCredentialsPath: getEnv("FIREBASE_CREDENTIALS_PATH", "./firebase-service-account.json"),
		FirebaseProjectID:      getEnv("FIREBASE_PROJECT_ID", ""),

		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),
	}
}

// DSN returns the PostgreSQL connection string for GORM.
func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=UTC",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName,
	)
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
