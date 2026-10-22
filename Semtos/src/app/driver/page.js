"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

const IMPACT_FACTS = [
  "Emergency response within the 'Golden Hour' increases patient survival chances by over 30%.",
  "Every 60 seconds saved can meaningfully increase survival odds in a medical emergency.",
  "Your quick reaction just saved precious seconds for someone in an ambulance.",
];

const THANK_YOU_DURATION_SECONDS = 6;

const SCREENS = {
  IDLE: 'IDLE',
  ALERT: 'ALERT',
  THANK_YOU: 'THANK_YOU',
};

export default function DriverCompanionWeb() {
  const [screen, setScreen] = useState(SCREENS.IDLE);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_DURATION_SECONDS);
  const [currentFact, setCurrentFact] = useState(IMPACT_FACTS[0]);
  const [connected, setConnected] = useState(false);

  const [telemetry, setTelemetry] = useState({
    distanceMeters: null,
    speedKmh: null,
    etaSeconds: null,
    intersection: null,
  });
  const [isSharingGps, setIsSharingGps] = useState(false);

  const socketRef = useRef(null);
  const countdownRef = useRef(null);
  const watchIdRef = useRef(null);

  // ---- Phone Geolocation Watcher ----
  useEffect(() => {
    if (isSharingGps && typeof window !== 'undefined' && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed, heading } = pos.coords;
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                event: 'GPS_BROADCAST',
                lat: latitude,
                lng: longitude,
                speedKmh: speed ? Math.round(speed * 3.6) : 45,
                heading: heading || 0,
                timestamp: Date.now(),
              })
            );
          }
        },
        (err) => console.warn('GPS Error:', err.message),
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    } else {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
    return () => {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isSharingGps]);

  // ---- Screen 2: Alert ----
  const triggerAlert = useCallback((data) => {
    setScreen(SCREENS.ALERT);
    if (data) {
      setTelemetry((prev) => ({
        ...prev,
        distanceMeters: data.distanceMeters ?? prev.distanceMeters,
        etaSeconds: data.etaSeconds ?? prev.etaSeconds,
        intersection: data.intersection ?? prev.intersection,
      }));
    }

    // Vibrate device if supported
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([0, 300, 150, 300, 150, 300]);
      } catch (_) {}
    }
  }, []);

  // ---- Screen 3: Thank You ----
  const triggerThankYou = useCallback(() => {
    const fact = IMPACT_FACTS[Math.floor(Math.random() * IMPACT_FACTS.length)];
    setCurrentFact(fact);
    setScreen(SCREENS.THANK_YOU);
    setSecondsLeft(THANK_YOU_DURATION_SECONDS);

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(200);
      } catch (_) {}
    }

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setScreen(SCREENS.IDLE);
          return THANK_YOU_DURATION_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ---- WebSocket Connection ----
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const wsUrl = `ws://${host}:4081`;

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'V2X_ALERT_TRIGGER') {
              triggerAlert(data);
            }
            if (data.event === 'V2X_CLEARANCE_CONFIRMED') {
              triggerThankYou();
            }
            if (data.event === 'AMBULANCE_TELEMETRY') {
              setTelemetry({
                distanceMeters: data.distanceToSignal,
                speedKmh: data.speedKmh,
                etaSeconds: data.etaSeconds,
                intersection: data.intersection,
              });
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setConnected(false);
          if (!unmounted) reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setConnected(false);
        };
      } catch (_) {
        if (!unmounted) reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [triggerAlert, triggerThankYou]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background:
          screen === SCREENS.ALERT
            ? '#dc2626'
            : screen === SCREENS.THANK_YOU
            ? '#059669'
            : '#0f172a',
        color: '#ffffff',
        transition: 'background-color 0.4s ease',
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* V2X Connection Pill */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(0,0,0,0.45)',
          padding: '6px 14px',
          borderRadius: 20,
          fontSize: 12,
          letterSpacing: 1,
          fontFamily: 'monospace',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#22c55e' : '#f59e0b',
            boxShadow: `0 0 8px ${connected ? '#22c55e' : '#f59e0b'}`,
          }}
        />
        <span>{connected ? 'V2X CONNECTED' : 'CONNECTING...'}</span>
      </div>

      {/* Screen 1: IDLE */}
      {screen === SCREENS.IDLE && (
        <div style={{ textAlign: 'center', maxWidth: 360, animation: 'fadeIn 0.5s ease' }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#22c55e',
              margin: '0 auto 24px',
              boxShadow: '0 0 24px #22c55e',
              animation: 'pulseDot 2s infinite',
            }}
          />
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 10px', color: '#f8fafc' }}>
            Road Clear
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
            Scanning for emergency vehicles…
          </p>
          <div
            style={{
              marginTop: 40,
              padding: '12px 18px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              fontSize: 13,
              color: '#64748b',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            📡 Press <strong>ENTER</strong> on PC to trigger preemption
          </div>

          {/* GPS Broadcast Button */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => setIsSharingGps(prev => !prev)}
              style={{
                background: isSharingGps ? '#22c55e' : 'rgba(255,255,255,0.08)',
                color: isSharingGps ? '#020617' : '#94a3b8',
                border: `1px solid ${isSharingGps ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 1,
                fontFamily: 'monospace',
                transition: 'all 0.2s ease',
              }}
            >
              {isSharingGps ? '📍 BROADCASTING PHONE GPS (ACTIVE)' : '📱 STREAM PHONE GPS TO 3D MAP'}
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: ALERT */}
      {screen === SCREENS.ALERT && (
        <div
          style={{
            textAlign: 'center',
            maxWidth: 420,
            animation: 'flashAlert 0.7s infinite alternate ease-in-out',
          }}
        >
          <div style={{ fontSize: 72, marginBottom: 16 }}>🚨</div>
          <h1
            style={{
              fontSize: 'clamp(24px, 6vw, 32px)',
              fontWeight: 900,
              margin: '0 0 20px',
              letterSpacing: '0.05em',
              lineHeight: 1.2,
            }}
          >
            EMERGENCY VEHICLE
            <br />
            APPROACHING
          </h1>
          <div
            style={{
              background: '#ffffff',
              color: '#dc2626',
              padding: '20px 28px',
              borderRadius: 16,
              fontSize: 'clamp(24px, 7vw, 34px)',
              fontWeight: 900,
              lineHeight: 1.2,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              letterSpacing: '0.03em',
            }}
          >
            PULL OVER
            <br />
            TO THE SIDES
          </div>

          {/* Live Telemetry Pill on Alert Screen */}
          {telemetry.distanceMeters !== null && (
            <div
              style={{
                marginTop: 24,
                display: 'inline-flex',
                gap: 16,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '10px 20px',
                borderRadius: 12,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              <span>DIST: <strong>{telemetry.distanceMeters}m</strong></span>
              {telemetry.etaSeconds !== null && <span>ETA: <strong>{telemetry.etaSeconds}s</strong></span>}
              {telemetry.speedKmh !== null && <span>SPD: <strong>{telemetry.speedKmh}km/h</strong></span>}
            </div>
          )}
        </div>
      )}

      {/* Screen 3: THANK YOU */}
      {screen === SCREENS.THANK_YOU && (
        <div style={{ textAlign: 'center', maxWidth: 400, animation: 'fadeIn 0.5s ease' }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: '#ffffff',
              color: '#059669',
              fontSize: 48,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            ✓
          </div>
          <h1
            style={{
              fontSize: 'clamp(24px, 6vw, 30px)',
              fontWeight: 800,
              margin: '0 0 20px',
              lineHeight: 1.3,
            }}
          >
            Thank You for
            <br />
            Giving Way!
          </h1>
          <div
            style={{
              background: 'rgba(255,255,255,0.18)',
              padding: '18px 22px',
              borderRadius: 14,
              fontSize: 15,
              lineHeight: 1.6,
              marginBottom: 20,
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            💡 {currentFact}
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, letterSpacing: 1 }}>
            Returning to standby in <strong>{secondsLeft}s</strong>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
        @keyframes flashAlert {
          0% { opacity: 0.75; transform: scale(0.98); }
          100% { opacity: 1; transform: scale(1.02); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
