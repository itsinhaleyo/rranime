import React, { useEffect, useRef } from 'react';

export default function PlayerView({ uri, title = 'RRAnime player', onPlayerEvent, resumePosition = 0, syncState }) {
  const frame = useRef(null);
  useEffect(() => {
    if (!onPlayerEvent) return;
    const onMessage = event => {
      try {
        if (event.source !== frame.current?.contentWindow || event.origin !== new URL(uri).origin) return;
      } catch { return; }
      let message = event.data;
      if (typeof message === 'string') { try { message = JSON.parse(message); } catch { return; } }
      if (message?.type === 'ready' && Number(resumePosition) > 5) frame.current?.contentWindow?.postMessage({ channel: 'zokoanime', type: 'seek', time: Number(resumePosition) }, event.origin);
      onPlayerEvent(message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [uri, onPlayerEvent, resumePosition]);
  useEffect(() => {
    if (!syncState || !frame.current?.contentWindow) return;
    const origin = new URL(uri).origin;
    const position = Number(syncState.position) + (syncState.paused ? 0 : Math.max(0, (Date.now() - Number(syncState.sentAt || Date.now())) / 1000));
    frame.current.contentWindow.postMessage({ channel: 'zokoanime', type: 'seek', time: position }, origin);
    frame.current.contentWindow.postMessage({ channel: 'zokoanime', type: syncState.paused ? 'pause' : 'play' }, origin);
  }, [uri, syncState]);
  return React.createElement('iframe', {
    ref: frame,
    title,
    src: uri,
    allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    allowFullScreen: true,
    scrolling: 'no',
    style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, display: 'block', width: '100%', height: '100%', border: 0, backgroundColor: '#050505' },
  });
}
