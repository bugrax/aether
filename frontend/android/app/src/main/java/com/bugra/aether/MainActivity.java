package com.bugra.aether;

import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "AetherPrefs";
    private static final String KEY_AUTH_TOKEN = "authToken";
    private FirebaseAuth.AuthStateListener authStateListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        authStateListener = firebaseAuth -> {
            FirebaseUser user = firebaseAuth.getCurrentUser();
            if (user != null) {
                user.getIdToken(false).addOnSuccessListener(result -> {
                    String token = result.getToken();
                    if (token != null) {
                        saveToken(token);
                    }
                });
            } else {
                deleteToken();
            }
        };
        FirebaseAuth.getInstance().addAuthStateListener(authStateListener);
    }

    @Override
    public void onResume() {
        super.onResume();
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user != null) {
            user.getIdToken(false).addOnSuccessListener(result -> {
                String token = result.getToken();
                if (token != null) {
                    saveToken(token);
                }
            });
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (authStateListener != null) {
            FirebaseAuth.getInstance().removeAuthStateListener(authStateListener);
        }
    }

    private void saveToken(String token) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_AUTH_TOKEN, token).apply();
    }

    private void deleteToken() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().remove(KEY_AUTH_TOKEN).apply();
    }
}
