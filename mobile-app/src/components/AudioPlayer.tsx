import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { soundService } from '../services/soundService';

const SIREN_AUDIO_URI = 'https://image2url.com/r2/default/audio/1770035245086-6d368099-59b3-4f94-9f42-a06ce04c585a.mp3';
const CHIME_AUDIO_URI = 'https://image2url.com/r2/default/audio/1770035478181-9daca647-30be-478d-bef0-2700b5dfcbdd.mp3';

const AUDIO_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="background:transparent;margin:0;padding:0;">
  <audio id="siren" loop preload="auto" src="${SIREN_AUDIO_URI}"></audio>
  <audio id="chime" preload="auto" src="${CHIME_AUDIO_URI}"></audio>

  <script>
    let audioCtx = null;
    let oscNode = null;
    let gainNode = null;
    let synthInterval = null;

    function getAudioCtx() {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function startSynthSiren() {
      try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        stopSynthSiren();

        oscNode = ctx.createOscillator();
        gainNode = ctx.createGain();
        oscNode.type = 'sawtooth';
        oscNode.frequency.setValueAtTime(450, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);

        oscNode.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscNode.start();

        let ascending = true;
        let freq = 450;
        synthInterval = setInterval(function() {
          if (!oscNode) return;
          if (ascending) {
            freq += 35;
            if (freq >= 850) ascending = false;
          } else {
            freq -= 35;
            if (freq <= 450) ascending = true;
          }
          oscNode.frequency.setValueAtTime(freq, ctx.currentTime);
        }, 50);
      } catch (e) {
        console.warn('Synth error:', e);
      }
    }

    function stopSynthSiren() {
      if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
      }
      if (oscNode) {
        try {
          oscNode.stop();
          oscNode.disconnect();
        } catch(e) {}
        oscNode = null;
      }
    }

    window.playSiren = function() {
      const el = document.getElementById('siren');
      if (el) {
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) {
          p.catch(function(err) {
            console.log('Audio element blocked, fallback to synth siren:', err);
            startSynthSiren();
          });
        }
      } else {
        startSynthSiren();
      }
    };

    window.stopSiren = function() {
      const el = document.getElementById('siren');
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      stopSynthSiren();
    };

    window.playChime = function() {
      const el = document.getElementById('chime');
      if (el) {
        el.currentTime = 0;
        el.play().catch(function() {});
      }
    };
  </script>
</body>
</html>
`;

export const AudioPlayer: React.FC = () => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    const unsubscribe = soundService.subscribe((action) => {
      let js = '';
      if (action === 'PLAY_SIREN') {
        js = 'window.playSiren && window.playSiren(); true;';
      } else if (action === 'STOP_SIREN') {
        js = 'window.stopSiren && window.stopSiren(); true;';
      } else if (action === 'PLAY_CHIME') {
        js = 'window.playChime && window.playChime(); true;';
      }
      if (js) {
        webViewRef.current?.injectJavaScript(js);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: AUDIO_HTML }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
});
