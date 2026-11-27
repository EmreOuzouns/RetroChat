package com.retrochat.app;

import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (
            event.getAction() == KeyEvent.ACTION_DOWN &&
            (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)
        ) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                        "if(window.RetroCalls && window.RetroCalls.silenceRing){window.RetroCalls.silenceRing();}",
                        null
                    )
                );
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
