package com.ladlelink.plugins.llbridge;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LlBridge")
public class LlBridgePlugin extends Plugin {
    private static final String PREFS = "ll_bridge_prefs";
    private static final String KEY_TREE_URI = "tree_uri";
    private static final String KEY_TREE_NAME = "tree_name";
    private static final String KEY_PENDING_SHARE = "pending_share_url";

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        captureShareIntent(intent);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        getActivity().setIntent(intent);
        captureShareIntent(intent);
    }

    private void captureShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action) && intent.getType() != null) {
            String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (shared != null && !shared.isBlank()) {
                String url = extractUrl(shared);
                if (url != null) {
                    prefs().edit().putString(KEY_PENDING_SHARE, url).apply();
                }
            }
        }
    }

    private static String extractUrl(String text) {
        String trimmed = text.trim();
        // Prefer first http(s) token
        String[] parts = trimmed.split("\\s+");
        for (String part : parts) {
            if (part.startsWith("http://") || part.startsWith("https://")) {
                return part;
            }
        }
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        return null;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder selection cancelled");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("No folder URI returned");
            return;
        }
        final int takeFlags =
            result.getData().getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);

        DocumentFile tree = DocumentFile.fromTreeUri(getContext(), treeUri);
        String name = tree != null && tree.getName() != null ? tree.getName() : "Folder";

        prefs().edit()
            .putString(KEY_TREE_URI, treeUri.toString())
            .putString(KEY_TREE_NAME, name)
            .apply();

        JSObject ret = new JSObject();
        ret.put("uri", treeUri.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        String uri = prefs().getString(KEY_TREE_URI, null);
        if (uri == null) {
            call.resolve();
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri);
        ret.put("name", prefs().getString(KEY_TREE_NAME, "Folder"));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        String uri = prefs().getString(KEY_TREE_URI, null);
        if (uri != null) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                    Uri.parse(uri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (SecurityException ignored) {
                // already revoked
            }
        }
        prefs().edit().remove(KEY_TREE_URI).remove(KEY_TREE_NAME).apply();
        call.resolve();
    }

    @PluginMethod
    public void readTextFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isBlank()) {
            call.reject("path is required");
            return;
        }
        Uri treeUri = requireTreeUri(call);
        if (treeUri == null) return;

        try {
            DocumentFile file = findFile(treeUri, path);
            if (file == null || !file.exists()) {
                call.reject("File not found: " + path);
                return;
            }
            ContentResolver resolver = getContext().getContentResolver();
            try (InputStream in = resolver.openInputStream(file.getUri())) {
                if (in == null) {
                    call.reject("Unable to open file");
                    return;
                }
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (sb.length() > 0) sb.append('\n');
                    sb.append(line);
                }
                JSObject ret = new JSObject();
                ret.put("content", sb.toString());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to read file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String path = call.getString("path");
        String content = call.getString("content");
        if (path == null || path.isBlank()) {
            call.reject("path is required");
            return;
        }
        if (content == null) content = "";
        Uri treeUri = requireTreeUri(call);
        if (treeUri == null) return;

        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (root == null) {
                call.reject("Invalid folder URI");
                return;
            }
            DocumentFile file = findFile(treeUri, path);
            if (file == null) {
                file = root.createFile("application/json", path);
            }
            if (file == null) {
                call.reject("Unable to create file: " + path);
                return;
            }
            ContentResolver resolver = getContext().getContentResolver();
            try (OutputStream out = resolver.openOutputStream(file.getUri(), "wt")) {
                if (out == null) {
                    call.reject("Unable to open file for writing");
                    return;
                }
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to write file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void consumeSharedUrl(PluginCall call) {
        String url = prefs().getString(KEY_PENDING_SHARE, null);
        prefs().edit().remove(KEY_PENDING_SHARE).apply();
        JSObject ret = new JSObject();
        ret.put("url", url);
        call.resolve(ret);
    }

    private Uri requireTreeUri(PluginCall call) {
        String uri = prefs().getString(KEY_TREE_URI, null);
        if (uri == null) {
            call.reject("No folder selected");
            return null;
        }
        return Uri.parse(uri);
    }

    private DocumentFile findFile(Uri treeUri, String path) {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null) return null;
        // Only support top-level filenames for v1 (ladlelink.json)
        return root.findFile(path);
    }
}
