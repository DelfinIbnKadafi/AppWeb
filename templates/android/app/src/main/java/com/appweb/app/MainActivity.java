package com.appweb.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
  private static final long ANIM_MS = 180;

  // some sites lock zoom via the viewport meta, strip that out (like chrome's force zoom)
  private static final String FORCE_ZOOM_JS =
    "(function(){var m=document.querySelector('meta[name=viewport]');"
    + "if(!m)return;var c=m.getAttribute('content')||'';"
    + "c=c.replace(/(user-scalable|maximum-scale|minimum-scale)\\s*=\\s*[^,;]*/gi,'')"
    + ".replace(/[,;]\\s*[,;]/g,',').replace(/^[,;\\s]+|[,;\\s]+$/g,'');"
    + "m.setAttribute('content',c);})();";

  private FrameLayout root;
  private View header;
  private WebView web;
  private TextView title;
  private ProgressBar progress;

  private int headerH;
  private int scrollThreshold;
  private int scrollAcc = 0;
  private boolean headerShown = true;
  private boolean wantShown = true;
  private boolean animating = false;

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

  // slide the header in/out like chrome
  private void setHeaderVisible(boolean show) {
    wantShown = show;
    if (animating || show == headerShown) return;
    animating = true;

    // let the page overhang the bottom while sliding, real resize happens once at the end
    int contentH = root.getHeight() - root.getPaddingTop() - root.getPaddingBottom();
    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
    lp.height = contentH;
    web.setLayoutParams(lp);

    header.animate()
      .translationY(show ? 0 : -headerH)
      .setDuration(ANIM_MS)
      .setInterpolator(new DecelerateInterpolator())
      .start();

    web.animate()
      .translationY(show ? headerH : -headerH)
      .setDuration(ANIM_MS)
      .setInterpolator(new DecelerateInterpolator())
      .withEndAction(() -> {
        headerShown = show;
        FrameLayout.LayoutParams end = (FrameLayout.LayoutParams) web.getLayoutParams();
        end.height = ViewGroup.LayoutParams.MATCH_PARENT;
        end.topMargin = show ? headerH : 0;
        web.setTranslationY(0);
        web.setLayoutParams(end);
        header.setTranslationY(show ? 0 : -headerH);
        scrollAcc = 0;
        animating = false;
        // user flipped direction mid-slide, catch up
        if (wantShown != headerShown) setHeaderVisible(wantShown);
      })
      .start();
  }

  private void onPageScrolled(int y, int oldY) {
    if (animating) return; // resize during slide can fake scroll events
    if (y <= 0) {
      scrollAcc = 0;
      setHeaderVisible(true); // top of page, always show
      return;
    }
    int dy = y - oldY;
    if ((dy > 0 && scrollAcc < 0) || (dy < 0 && scrollAcc > 0)) scrollAcc = 0; // direction flipped
    scrollAcc += dy;
    if (scrollAcc > scrollThreshold) setHeaderVisible(false);
    else if (scrollAcc < -scrollThreshold) setHeaderVisible(true);
  }

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    setContentView(R.layout.activity_main);
    getWindow().setStatusBarColor(0xFF1B1E26);

    root = findViewById(R.id.root);
    header = findViewById(R.id.header);
    web = findViewById(R.id.web);
    title = findViewById(R.id.title);
    progress = findViewById(R.id.progress);

    headerH = getResources().getDimensionPixelSize(R.dimen.header_h);
    scrollThreshold = Math.round(24 * getResources().getDisplayMetrics().density);

    title.setText(AppConfig.NAME);
    findViewById(R.id.copy).setOnClickListener(v -> copyUrl());

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setSupportMultipleWindows(false); // popups load in this view

    // pinch zoom, no ugly +/- buttons
    s.setSupportZoom(true);
    s.setBuiltInZoomControls(true);
    s.setDisplayZoomControls(false);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);

    web.setOnScrollChangeListener((v, sx, sy, ox, oy) -> onPageScrolled(sy, oy));

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
        setHeaderVisible(true); // new page, bring the header back
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        progress.setVisibility(View.GONE);
        view.evaluateJavascript(FORCE_ZOOM_JS, null);
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
