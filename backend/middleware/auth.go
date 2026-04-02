package middleware

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/MicahParks/keyfunc"
	"github.com/bugracakmak/aether-api/config"
	"github.com/bugracakmak/aether-api/database"
	"github.com/bugracakmak/aether-api/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
	"google.golang.org/api/option"
)

var firebaseAuth *auth.Client
var firebaseProjectID string
var jwks *keyfunc.JWKS

// Google's public key endpoint for Firebase Auth tokens
const googleCertsURL = "https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com"

// InitFirebase initializes the Firebase Admin SDK.
// It tries credentials file first, then falls back to lightweight JWT verification.
func InitFirebase(cfg *config.Config) {
	ctx := context.Background()
	firebaseProjectID = cfg.FirebaseProjectID

	// Strategy 1: Use credentials file if available
	if cfg.FirebaseCredentialsPath != "" {
		if info, statErr := os.Stat(cfg.FirebaseCredentialsPath); statErr == nil && !info.IsDir() {
			opt := option.WithCredentialsFile(cfg.FirebaseCredentialsPath)
			app, err := firebase.NewApp(ctx, nil, opt)
			if err == nil {
				firebaseAuth, err = app.Auth(ctx)
				if err == nil {
					log.Println("✅ Firebase Auth initialized (service account)")
					return
				}
			}
			log.Printf("⚠️  Firebase credentials file failed: skipping to JWT fallback")
		} else {
			log.Printf("⚠️  Firebase credentials path is not a valid file: %s", cfg.FirebaseCredentialsPath)
		}
	}

	// Strategy 2: Lightweight JWT verification using Google public keys
	if firebaseProjectID != "" {
		var err error
		jwks, err = keyfunc.Get(googleCertsURL, keyfunc.Options{
			RefreshInterval: time.Hour,
			RefreshTimeout:  10 * time.Second,
		})
		if err != nil {
			log.Printf("⚠️  Failed to fetch Google public keys: %v", err)
			log.Println("⚠️  Firebase Auth NOT available — falling back to dev mode")
			return
		}
		log.Printf("✅ Firebase Auth initialized (JWT verification, project: %s)", firebaseProjectID)
		return
	}

	log.Println("⚠️  Firebase not configured — no credentials or project ID provided")
}

// AuthRequired is a Gin middleware that verifies Firebase ID tokens
// and sets the authenticated User in the request context.
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// DEV MODE: Skip auth when Firebase is not configured
		if firebaseAuth == nil && jwks == nil {
			devUser := getOrCreateDevUser()
			if devUser != nil {
				c.Set("user", devUser)
				c.Set("firebase_uid", "dev-user")
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error": "Authentication service not configured",
			})
			return
		}

		// Extract Bearer token from Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header required",
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid authorization format. Use: Bearer <token>",
			})
			return
		}

		idToken := parts[1]

		// Verify the Firebase ID token
		var uid, email, name, picture string

		if firebaseAuth != nil {
			// Full Firebase Admin SDK verification
			token, err := firebaseAuth.VerifyIDToken(context.Background(), idToken)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid or expired token",
				})
				return
			}
			uid = token.UID
			if e, ok := token.Claims["email"].(string); ok {
				email = e
			}
			if n, ok := token.Claims["name"].(string); ok {
				name = n
			}
			if p, ok := token.Claims["picture"].(string); ok {
				picture = p
			}
		} else {
			// Lightweight JWT verification
			claims, err := verifyFirebaseJWT(idToken)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid or expired token",
				})
				return
			}
			uid = claims.Subject
			email = claims.Email
			name = claims.Name
			picture = claims.Picture
		}

		// Look up or auto-create the user in our database
		user, err := findOrCreateUserFromClaims(uid, email, name, picture)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to resolve user account",
			})
			return
		}

		c.Set("user", user)
		c.Set("firebase_uid", uid)
		c.Next()
	}
}

// ── Firebase JWT Claims ──────────────────────────────

type firebaseClaims struct {
	jwt.RegisteredClaims
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func verifyFirebaseJWT(tokenStr string) (*firebaseClaims, error) {
	claims := &firebaseClaims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, jwks.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
	)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}

	// Validate issuer
	expectedIssuer := "https://securetoken.google.com/" + firebaseProjectID
	if claims.Issuer != expectedIssuer {
		return nil, jwt.NewValidationError("invalid issuer", jwt.ValidationErrorIssuer)
	}

	// Validate audience
	found := false
	for _, aud := range claims.Audience {
		if aud == firebaseProjectID {
			found = true
			break
		}
	}
	if !found {
		return nil, jwt.NewValidationError("invalid audience", jwt.ValidationErrorAudience)
	}

	return claims, nil
}

// ── User Helpers ─────────────────────────────────────

// GetUser retrieves the authenticated user from the Gin context.
func GetUser(c *gin.Context) *models.User {
	if user, exists := c.Get("user"); exists {
		return user.(*models.User)
	}
	return nil
}

// findOrCreateUserFromClaims looks up a user by Firebase UID or creates one.
func findOrCreateUserFromClaims(uid, email, name, picture string) (*models.User, error) {
	var user models.User
	// Also check soft-deleted users with Unscoped
	result := database.DB.Unscoped().Where("firebase_id = ?", uid).First(&user)
	if result.Error == nil {
		// Restore if soft-deleted
		if user.DeletedAt.Valid {
			database.DB.Unscoped().Model(&user).Update("deleted_at", nil)
		}
		// Update avatar/email if changed
		database.DB.Model(&user).Updates(map[string]interface{}{
			"email":      email,
			"avatar_url": picture,
		})
		return &user, nil
	}

	// Auto-derive name from email if missing
	if name == "" {
		if atIdx := strings.Index(email, "@"); atIdx > 0 {
			name = email[:atIdx]
		} else {
			name = uid[:8]
		}
	}

	// Truncate username to fit 50 char limit
	if len(name) > 45 {
		name = name[:45]
	}

	user = models.User{
		FirebaseID: uid,
		Email:      email,
		Username:   name,
		AvatarURL:  picture,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		// Handle duplicate username: append random suffix
		if strings.Contains(err.Error(), "idx_users_username") {
			user.Username = fmt.Sprintf("%s_%d", name, rand.Intn(9999))
			if err2 := database.DB.Create(&user).Error; err2 != nil {
				return nil, err2
			}
			return &user, nil
		}
		// Handle race condition: another request created the user
		if strings.Contains(err.Error(), "idx_users_firebase_id") || strings.Contains(err.Error(), "idx_users_email") {
			result = database.DB.Where("firebase_id = ?", uid).First(&user)
			if result.Error == nil {
				return &user, nil
			}
		}
		return nil, err
	}

	return &user, nil
}

// getOrCreateDevUser returns a dev user for local development (no Firebase needed).
func getOrCreateDevUser() *models.User {
	var user models.User
	result := database.DB.Where("firebase_id = ?", "dev-user-local").First(&user)
	if result.Error == nil {
		return &user
	}

	user = models.User{
		FirebaseID: "dev-user-local",
		Email:      "dev@aether.local",
		Username:   "Developer",
		AvatarURL:  "",
	}

	if err := database.DB.Create(&user).Error; err != nil {
		log.Printf("⚠️  Failed to create dev user: %v", err)
		return nil
	}

	log.Println("🔧 Dev user created (Firebase bypass active)")
	return &user
}
