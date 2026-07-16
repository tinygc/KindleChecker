package jp.kindlechecker;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://www.amazon.co.jp/hz/wishlist/ls";
    private WebView webView;
    private EditText urlInput;
    private ProgressBar progressBar;
    private String injectorScript;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        injectorScript = loadAsset("kindle_checker.js");
        buildUi();
        configureWebView();
        webView.loadUrl(HOME_URL);
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        int pad = dp(8);
        bar.setPadding(pad, pad, pad, pad);

        urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setText(HOME_URL);
        urlInput.setSelectAllOnFocus(true);
        urlInput.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_GO);
        urlInput.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_UP;
            if (enter || actionId == android.view.inputmethod.EditorInfo.IME_ACTION_GO) {
                loadInputUrl();
                return true;
            }
            return false;
        });
        bar.addView(urlInput, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button go = new Button(this);
        go.setText("開く");
        go.setOnClickListener(v -> loadInputUrl());
        bar.addView(go, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button check = new Button(this);
        check.setText("確認");
        check.setOnClickListener(v -> injectChecker());
        bar.addView(check, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        webView = new WebView(this);
        root.addView(bar);
        root.addView(progressBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setAlpha(newProgress >= 100 ? 0f : 1f);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAmazonJp(request.getUrl().toString());
            }
            @Override public void onPageFinished(WebView view, String url) {
                urlInput.setText(url);
                if (isWishlistUrl(url)) injectChecker();
            }
        });
    }

    private void loadInputUrl() {
        String url = urlInput.getText().toString().trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
        if (isAmazonJp(url)) webView.loadUrl(url);
    }

    private void injectChecker() {
        if (injectorScript == null || injectorScript.isEmpty()) return;
        webView.evaluateJavascript(injectorScript, null);
    }

    private boolean isAmazonJp(String url) { return url.startsWith("https://www.amazon.co.jp/") || url.startsWith("https://amazon.co.jp/"); }
    private boolean isWishlistUrl(String url) { return url.contains("amazon.co.jp/hz/wishlist/") || url.contains("amazon.co.jp/wishlist/"); }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    private String loadAsset(String name) {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) { return ""; }
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
