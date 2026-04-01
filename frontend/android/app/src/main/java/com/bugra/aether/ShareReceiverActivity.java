package com.bugra.aether;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Toast;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ShareReceiverActivity extends Activity {

    private static final String PREFS_NAME = "AetherPrefs";
    private static final String KEY_AUTH_TOKEN = "authToken";
    private static final String API_URL = "https://app.aether.relayhaus.org/api/v1/share";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null) {
                String url = extractUrl(sharedText);
                if (url != null) {
                    handleSharedUrl(url);
                } else {
                    showToastAndFinish("No URL found");
                }
            } else {
                showToastAndFinish("No content found");
            }
        } else {
            showToastAndFinish("Unsupported share type");
        }
    }

    private String extractUrl(String text) {
        String trimmed = text.trim();
        if ((trimmed.startsWith("http://") || trimmed.startsWith("https://"))
                && !trimmed.contains(" ") && !trimmed.contains("\n")) {
            return trimmed;
        }

        Pattern pattern = Pattern.compile("https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+");
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return matcher.group();
        }
        return null;
    }

    private void handleSharedUrl(String url) {
        String token = readToken();
        if (token == null) {
            showToastAndFinish("Open Aether app first to sign in");
            return;
        }

        Toast.makeText(this, "Saving to Aether...", Toast.LENGTH_SHORT).show();

        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(API_URL).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);

                String body = "{\"url\":\"" + url.replace("\"", "\\\"") + "\"}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }

                int responseCode = conn.getResponseCode();
                conn.disconnect();

                runOnUiThread(() -> {
                    if (responseCode >= 200 && responseCode < 300) {
                        showToastAndFinish("Saved to Aether ✓");
                    } else if (responseCode == 401) {
                        showToastAndFinish("Token expired — open Aether to refresh");
                    } else {
                        showToastAndFinish("Error " + responseCode);
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> showToastAndFinish("Failed: " + e.getMessage()));
            }
        }).start();
    }

    private String readToken() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getString(KEY_AUTH_TOKEN, null);
    }

    private void showToastAndFinish(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        finish();
    }
}
