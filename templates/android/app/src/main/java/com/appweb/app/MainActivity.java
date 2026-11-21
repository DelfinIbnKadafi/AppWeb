package com.appweb.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
  private WebView web;
  private TextView title;
  private ProgressBar progress;

  // host check, subdomains are cool too
  private boolean isAllowed(Uri uri) {
    String scheme = uri.getScheme();
    String host = uri.getHost();
    if (scheme == null || host == null) return false;
    if (!scheme.equals("http") && !scheme.equals("https")) return false;
    host = host.toLowerCase();
    return host.equals(AppConfig.DOMAIN) || host.endsWith("." + AppConfig.DOMAIN);
  }

  private void copyUrl() {
    String url = web.getUrl();
    if (url == null) return;
    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    cm.setPrimaryClip(ClipData.newPlainText("url", url));
    Toast.makeText(this, "Copied!", Toast.LENGTH_SHORT).show();
  }

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    setContentView(R.layout.activity_main);
    getWindow().setStatusBarColor(0xFF1B1E26);

    web = findViewById(R.id.web);
    title = findViewById(R.id.title);
    progress = findViewById(R.id.progress);
    title.setText(AppConfig.NAME);
    findViewById(R.id.copy).setOnClickListener(v -> copyUrl());

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setSupportMultipleWindows(false); // popups load in this view

    web.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri uri = req.getUrl();
        String scheme = uri.getScheme();
        boolean isWeb = "http".equals(scheme) || "https".equals(scheme);
        if (!isWeb) return true; // no intent:// or mailto: stuff
        if (AppConfig.BLOCK_OTHERS && !isAllowed(uri)) {
          Toast.makeText(MainActivity.this, "Blocked: " + uri.getHost(), Toast.LENGTH_SHORT).show();
          return true; // nope, stay put
        }
        return false;
      }

      @Override
      public void onPageStarted(WebView view, String url, Bitmap icon) {
        progress.setVisibility(View.VISIBLE);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        progress.setVisibility(View.GONE);
      }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onReceivedTitle(WebView view, String t) {
        if (t != null && !t.isEmpty()) title.setText(t);
      }

      @Override
      public void onProgressChanged(WebView view, int p) {
        progress.setProgress(p);
      }
    });

    if (state == null) web.loadUrl(AppConfig.ENTRY);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onPause() {
    super.onPause();
    web.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    web.onResume();
  }
}
