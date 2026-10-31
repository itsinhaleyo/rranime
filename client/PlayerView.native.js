import React, { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

export default function PlayerView({ uri, title = 'RRAnime player', onPlayerEvent, resumePosition = 0, syncState }) {
  const player = useRef(null);
  const bridgeScript = `window.addEventListener('message',function(e){if(e.origin!==window.location.origin)return;var d=e.data;try{if(typeof d==='string')d=JSON.parse(d)}catch(_e){return}if(window.ReactNativeWebView&&d&&typeof d==='object'){window.ReactNativeWebView.postMessage(JSON.stringify(d))}});true;`;
  useEffect(() => {
    if (!syncState || !player.current) return;
    const origin = new URL(uri).origin;
    const position = Number(syncState.position) + (syncState.paused ? 0 : Math.max(0, (Date.now() - Number(syncState.sentAt || Date.now())) / 1000));
    player.current.injectJavaScript(`window.postMessage({channel:'zokoanime',type:'seek',time:${position}},'${origin}');window.postMessage({channel:'zokoanime',type:'${syncState.paused ? 'pause' : 'play'}'},'${origin}');true;`);
  }, [uri, syncState]);
  return <WebView
    ref={player}
    source={{ uri }}
    style={{ flex: 1, width: '100%', minHeight: 300, backgroundColor: '#050505' }}
    allowsFullscreenVideo
    javaScriptEnabled
    domStorageEnabled
    mediaPlaybackRequiresUserAction={false}
    allowsInlineMediaPlayback
    setSupportMultipleWindows={false}
    originWhitelist={['https://*', 'http://*']}
    accessibilityLabel={title}
    injectedJavaScript={bridgeScript}
    onMessage={event => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === 'ready' && Number(resumePosition) > 5) {
          player.current?.injectJavaScript(`window.postMessage({channel:'zokoanime',type:'seek',time:${Number(resumePosition)}},'${new URL(uri).origin}');true;`);
        }
        onPlayerEvent?.(message);
      } catch { /* Ignore unstructured provider messages. */ }
    }}
  />;
}
