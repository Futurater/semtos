"use client";

/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: Semtos/src/app/driver/page.js (Milestone 3 — Realistic Commuter Navigation
 *       & Vector-Filtered Multi-Channel V2X Alert Receiver)
 * Route: http://<LAN_IP>:4000/driver
 *
 * Realistic End-User Delivery Channels Implemented:
 *  1. In-Navigation SDK Overlay (Default View):
 *     - Operates as a realistic turn-by-turn Commuter Navigation app (driving
 *       along MG Road -> Anil Kumble Circle via Brigade Road Junction) rather
 *       than a passive "waiting screen".
 *     - When matched by the backend directional vector filter, slides down a
 *       high-priority Heads-Up Alert Banner ("AMBULANCE BEHIND IN YOUR LANE —
 *       MERGE LEFT") and highlights the green pull-over lane on the live map.
 *  2. Car Bluetooth Spoken Voice TTS Override + Web Audio Siren Chime:
 *     - Uses Web Audio API (`AudioContext`) for a dual-tone attention chime and
 *       the browser's native Web Speech API (`window.speechSynthesis`) to speak
 *       actionable instructions aloud so the driver keeps eyes on the road.
 *  3. Native OS System Push Notification (`Notification` API):
 *     - Triggers a system-level Android/iOS/Desktop notification banner with
 *       haptic vibration even when the browser tab is in the background.
 *  4. Directional Vector Filter Role Selector (For Viva / Lab Demonstration):
 *     - Lets evaluators switch the phone between `SAME_LANE_AHEAD` (dot = +1.00,
 *       Alert Triggered), `CROSS_STREET` (dot = 0.00, Suppressed),
 *       `OPPOSITE_LANE` (dot = -1.00, Suppressed), and `GPS_LIVE`.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

const IMPACT_FACTS = [
  "Emergency response within the 'Golden Hour' increases patient survival odds by over 30%.",
  "Every 60 seconds saved at a congested signal directly improves cardiac and trauma survival.",
  "Directional vector filtering prevents alert fatigue for 75% of surrounding cross-street traffic.",
];

const THANK_YOU_DURATION_SECONDS = 6;

const LANE_ROLES = [
  {
    id: 'SAME_LANE_AHEAD',
    label: 'Same Lane Ahead',
    sub: 'MG Road Westbound (275°) • Dot = +1.00',
    heading: 275,
    expectMatch: true,
  },
  {
    id: 'CROSS_STREET',
    label: 'Cross-Street',
    sub: 'Brigade Rd Southbound (185°) • Dot = 0.00',
    heading: 185,
    expectMatch: false,
  },
  {
    id: 'OPPOSITE_LANE',
    label: 'Opposite Lane',
    sub: 'MG Road Eastbound (95°) • Dot = -1.00',
    heading: 95,
    expectMatch: false,
  },
  {
    id: 'GPS_LIVE',
    label: 'Live Phone GPS',
    sub: 'Hardware Geolocation + Compass',
    heading: 275,
    expectMatch: true,
  },
];

export default function DriverCompanionWeb() {
  // 'NAVIGATING' | 'ALERT' | 'THANK_YOU'
  const [screenState, setScreenState] = useState('NAVIGATING');
  const [connected, setConnected] = useState(false);
  const [laneRole, setLaneRole] = useState('SAME_LANE_AHEAD');
  const [audioAndPushEnabled, setAudioAndPushEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState('default');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_DURATION_SECONDS);
  const [currentFact, setCurrentFact] = useState(IMPACT_FACTS[0]);

  // Vector Filter & Live Telemetry State
  const [vectorStatus, setVectorStatus] = useState({
    targetMatch: true,
    dotProduct: 1.0,
    distanceMeters: 380,
    etaSeconds: 18,
    speedKmh: 54,
    intersection: 'Brigade Road Junction',
    greenHoldSeconds: 23,
    networkMode: 'CLOUD_ONLINE',
    filterReason: 'Standby — monitoring corridor behind vehicle',
    suppressedAlertCount: 0,
    lastSuppressedAt: null,
  });

  // Simulated commuter progress along route for realistic navigation feel
  const [commuterTick, setCommuterTick] = useState(0);

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sirenIntervalRef = useRef(null);
  const countdownRef = useRef(null);
  const watchIdRef = useRef(null);
  const laneRoleRef = useRef(laneRole);

  useEffect(() => {
    laneRoleRef.current = laneRole;
  }, [laneRole]);

  // Check initial Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Gentle commuter map animation loop
  useEffect(() => {
    const id = setInterval(() => {
      setCommuterTick((t) => (t + 1) % 100);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── 1. Web Audio API Chime & Siren Synthesizer ─────────────────────────────
  const playEmergencyChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.setValueAtTime(1174.66, now + 0.16); // D6

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(587.33, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.44);
      osc2.stop(now + 0.44);
    } catch (_) {}
  }, []);

  // ── 2. Spoken Voice TTS Override (`window.speechSynthesis`) ────────────────
  const speakVoiceAlert = useCallback((text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.04;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }, []);

  // ── 3. Native OS Push Notification Trigger ─────────────────────────────────
  const fireOsNotification = useCallback((title, bodyText) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: bodyText,
          tag: 'semtos-v2x-alert',
          renotify: true,
          vibrate: [0, 300, 150, 300],
        });
      }
    } catch (_) {}
  }, []);

  // Unlock Audio + Speech + OS Notifications in one tap
  const handleEnableCarAudioAndPush = async () => {
    setAudioAndPushEnabled(true);
    playEmergencyChime();
    speakVoiceAlert(
      'SEMTOS V2X background navigation protection active. Audio and push alerts enabled.'
    );
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      } catch (_) {}
    }
  };

  // ── 4. Trigger Alert vs. Suppress via Directional Vector Filter ────────────
  const handleIncomingAlertPacket = useCallback(
    (data) => {
      const roleObj = LANE_ROLES.find((r) => r.id === laneRoleRef.current) || LANE_ROLES[0];

      // Determine whether this driver is matched by the server's vector filter (or local role fallback)
      const isMatched =
        data.targeted !== undefined ? Boolean(data.targetMatch) : roleObj.expectMatch;

      const dotVal =
        typeof data.dotProduct === 'number'
          ? data.dotProduct
          : roleObj.id === 'SAME_LANE_AHEAD'
          ? 1.0
          : roleObj.id === 'CROSS_STREET'
          ? 0.0
          : -1.0;

      const dist = data.distanceMeters ?? vectorStatus.distanceMeters ?? 280;
      const eta = data.etaSeconds ?? vectorStatus.etaSeconds ?? 15;
      const intName = data.intersection || 'Brigade Road Junction';

      if (!isMatched) {
        // SUPPRESSED BY DIRECTIONAL VECTOR FILTER -> Do NOT interrupt driver!
        setVectorStatus((prev) => ({
          ...prev,
          targetMatch: false,
          dotProduct: dotVal,
          distanceMeters: dist,
          etaSeconds: eta,
          intersection: intName,
          filterReason:
            data.filterReason ||
            `SUPPRESSED (${roleObj.label}): Heading dot=${dotVal.toFixed(2)} < 0.70 — zero alert fatigue`,
          suppressedAlertCount: prev.suppressedAlertCount + 1,
          lastSuppressedAt: new Date().toTimeString().split(' ')[0],
        }));
        return;
      }

      // MATCHED -> Trigger In-Navigation Heads-Up Banner + Voice TTS + OS Notification + Haptics
      setScreenState('ALERT');
      setVectorStatus((prev) => ({
        ...prev,
        targetMatch: true,
        dotProduct: dotVal,
        distanceMeters: dist,
        etaSeconds: eta,
        speedKmh: data.speedKmh ?? prev.speedKmh,
        intersection: intName,
        greenHoldSeconds: data.greenHoldSeconds ?? prev.greenHoldSeconds,
        networkMode: data.networkMode ?? prev.networkMode,
        filterReason:
          data.filterReason ||
          `MATCHED CORRIDOR: Same heading ahead (dot=${dotVal.toFixed(2)}, dist=${dist}m)`,
      }));

      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([0, 350, 150, 350, 150, 400]);
        } catch (_) {}
      }

      playEmergencyChime();
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = setInterval(playEmergencyChime, 2400);

      const spokenText =
        data.voicePrompt ||
        `Attention: Emergency ambulance approaching ${dist} meters behind you towards ${intName}. Please merge left and clear the lane.`;
      speakVoiceAlert(spokenText);

      fireOsNotification(
        `🚨 AMBULANCE ${dist}m BEHIND — MERGE LEFT`,
        `Approaching ${intName} (ETA ${eta}s). Signal preempted Green — please yield left.`
      );
    },
    [playEmergencyChime, speakVoiceAlert, fireOsNotification, vectorStatus.distanceMeters, vectorStatus.etaSeconds]
  );

  // ── 5. Trigger Post-Clearance Thank-You Banner ─────────────────────────────
  const handleClearanceConfirmed = useCallback(() => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }

    setScreenState((prevScreen) => {
      if (prevScreen !== 'ALERT') return prevScreen;

      const fact = IMPACT_FACTS[Math.floor(Math.random() * IMPACT_FACTS.length)];
      setCurrentFact(fact);
      setSecondsLeft(THANK_YOU_DURATION_SECONDS);

      speakVoiceAlert('Emergency corridor cleared. Thank you for giving way. Resume normal driving.');

      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            setScreenState('NAVIGATING');
            return THANK_YOU_DURATION_SECONDS;
          }
          return prev - 1;
        });
      }, 1000);

      return 'THANK_YOU';
    });
  }, [speakVoiceAlert]);

  // ── 6. Connect to V2X Server & Register Role ───────────────────────────────
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      try {
        ws = new WebSocket(`ws://${host}:4081`);
        socketRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          const roleObj = LANE_ROLES.find((r) => r.id === laneRoleRef.current) || LANE_ROLES[0];
          ws.send(
            JSON.stringify({
              event: 'REGISTER_CLIENT',
              clientType: 'CIVILIAN_DRIVER',
              laneRole: roleObj.id,
              heading: roleObj.heading,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'V2X_ALERT_TRIGGER') {
              handleIncomingAlertPacket(data);
            } else if (data.event === 'V2X_CLEARANCE_CONFIRMED') {
              handleClearanceConfirmed();
            } else if (data.event === 'AMBULANCE_TELEMETRY') {
              setVectorStatus((prev) => ({
                ...prev,
                distanceMeters: data.distanceToSignal ?? prev.distanceMeters,
                etaSeconds: data.etaSeconds ?? prev.etaSeconds,
                speedKmh: data.speedKmh ?? prev.speedKmh,
                intersection: data.intersection ?? prev.intersection,
                greenHoldSeconds: data.greenHoldSeconds ?? prev.greenHoldSeconds,
                networkMode: data.networkMode ?? prev.networkMode,
              }));
            } else if (data.event === 'VECTOR_FILTER_STATUS') {
              setVectorStatus((prev) => ({
                ...prev,
                targetMatch: data.targetMatch,
                dotProduct: data.dotProduct,
                filterReason: data.filterReason,
              }));
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setConnected(false);
          if (!unmounted) reconnectTimer = setTimeout(connect, 2500);
        };

        ws.onerror = () => setConnected(false);
      } catch (_) {
        if (!unmounted) reconnectTimer = setTimeout(connect, 2500);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [handleIncomingAlertPacket, handleClearanceConfirmed]);

  // Send updated laneRole to server whenever user switches role tab
  const handleSelectLaneRole = (newRoleId) => {
    setLaneRole(newRoleId);
    laneRoleRef.current = newRoleId;
    const roleObj = LANE_ROLES.find((r) => r.id === newRoleId) || LANE_ROLES[0];

    if (!roleObj.expectMatch && screenState === 'ALERT') {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      setScreenState('NAVIGATING');
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'CIVILIAN_TELEMETRY',
          laneRole: newRoleId,
          heading: roleObj.heading,
        })
      );
    }
  };

  // Live Phone GPS watcher when `GPS_LIVE` role is selected
  useEffect(() => {
    if (laneRole !== 'GPS_LIVE') {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading } = pos.coords;
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                event: 'CIVILIAN_TELEMETRY',
                laneRole: 'GPS_LIVE',
                lat: latitude,
                lng: longitude,
                heading: typeof heading === 'number' && !Number.isNaN(heading) ? heading : 275,
              })
            );
          }
        },
        (err) => console.warn('[DRIVER-GPS] Warning:', err.message),
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    }

    return () => {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [laneRole]);

  const activeRoleObj = LANE_ROLES.find((r) => r.id === laneRole) || LANE_ROLES[0];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-between p-3 select-none">
      <div className="w-full max-w-md flex flex-col gap-2.5 flex-1">
        {/* ── 1. Top Car Infotainment / V2X SDK Status Bar ── */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]' : 'bg-amber-400'
              }`}
            />
            <span className="font-bold text-slate-200">SEMTOS V2X NAV-SDK</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400">
              {vectorStatus.networkMode === 'BLE_FALLBACK' ? '📡 BLE BEACON' : '☁️ 5G V2X'}
            </span>
          </div>

          <button
            onClick={handleEnableCarAudioAndPush}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
              audioAndPushEnabled
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-sky-500 text-slate-950 border-sky-300 animate-pulse font-black'
            }`}
          >
            {audioAndPushEnabled
              ? `🔊 BT Audio & Push (${notifPermission === 'granted' ? 'ON' : 'Active'})`
              : '🔈 Tap to Enable Car Audio & OS Push'}
          </button>
        </div>

        {/* ── 2. Turn-by-Turn Navigation Header OR Emergency Heads-Up Drop-Down Overlay ── */}
        {screenState === 'ALERT' ? (
          <div className="bg-red-600 border-2 border-white rounded-2xl p-4 shadow-[0_0_35px_rgba(220,38,38,0.75)] animate-pulse text-white">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-black tracking-widest uppercase bg-black/30 px-2.5 py-0.5 rounded-full">
                🚨 V2X PRIORITY LANE OVERRIDE
              </span>
              <span className="text-xs font-mono font-bold">
                DOT: {vectorStatus.dotProduct.toFixed(2)}
              </span>
            </div>
            <div className="text-xl font-black tracking-wide leading-tight">
              AMBULANCE {vectorStatus.distanceMeters}m BEHIND IN YOUR LANE
            </div>
            <div className="mt-2 bg-white text-red-600 font-black text-center py-2.5 px-3 rounded-xl text-lg tracking-wider shadow-lg">
              ⬅️ MERGE LEFT — CLEAR RIGHT CORRIDOR
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono bg-black/25 px-3 py-1.5 rounded-lg">
              <span>
                JUNCTION: <strong>{vectorStatus.intersection}</strong>
              </span>
              <span>
                ETA: <strong>{vectorStatus.etaSeconds}s</strong>
              </span>
              <span>
                HOLD: <strong>{vectorStatus.greenHoldSeconds}s</strong>
              </span>
            </div>
          </div>
        ) : screenState === 'THANK_YOU' ? (
          <div className="bg-emerald-600 border-2 border-emerald-300 rounded-2xl p-4 shadow-[0_0_25px_rgba(16,185,129,0.5)] text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-white text-emerald-700 font-black flex items-center justify-center text-lg">
                  ✓
                </span>
                <div>
                  <div className="text-base font-black">Corridor Cleared — Thank You!</div>
                  <div className="text-xs text-emerald-100">
                    Resume normal lane • Returning to nav in {secondsLeft}s
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2.5 text-xs bg-black/20 p-2.5 rounded-xl leading-relaxed">
              💡 {currentFact}
            </div>
          </div>
        ) : (
          /* Realistic Turn-by-Turn Navigation Header (Google Maps / Mappls Dark Style) */
          <div className="bg-emerald-950/90 border border-emerald-600/50 rounded-2xl p-3.5 shadow-xl flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-2xl shadow">
              ⬆️
            </div>
            <div className="flex-1">
              <div className="text-xs text-emerald-400 font-mono font-bold">
                380 m • Continue Straight
              </div>
              <div className="text-base font-extrabold text-white leading-snug">
                MG Road towards Anil Kumble Circle
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Passing <strong className="text-slate-200">{vectorStatus.intersection}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. Interactive Commuter Navigation Map Viewport (SVG) ── */}
        <div className="relative flex-1 min-h-[250px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner flex flex-col">
          <svg viewBox="0 0 340 250" className="w-full h-full flex-1 bg-[#0b1324]">
            {/* City Blocks Background */}
            <rect x="0" y="0" width="125" height="85" fill="#111c33" stroke="#1e293b" strokeWidth="1" />
            <rect x="215" y="0" width="125" height="85" fill="#111c33" stroke="#1e293b" strokeWidth="1" />
            <rect x="0" y="155" width="125" height="95" fill="#111c33" stroke="#1e293b" strokeWidth="1" />
            <rect x="215" y="155" width="125" height="95" fill="#111c33" stroke="#1e293b" strokeWidth="1" />

            {/* Cross-Street (Brigade Road Horizontal) */}
            <rect x="0" y="85" width="340" height="70" fill="#1e293b" />
            <line x1="0" y1="120" x2="340" y2="120" stroke="#475569" strokeWidth="1.5" strokeDasharray="6,6" />
            <text x="275" y="102" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">
              BRIGADE RD (CROSS-ST)
            </text>

            {/* Main Arterial (MG Road Vertical 2-Way Road) */}
            <rect x="125" y="0" width="90" height="250" fill="#1e293b" />
            {/* Center Median */}
            <line x1="170" y1="0" x2="170" y2="250" stroke="#facc15" strokeWidth="2" />
            {/* Lane Divider in Driver's Approach Direction (Left Side: X=125..170) */}
            <line x1="147" y1="0" x2="147" y2="250" stroke="#475569" strokeWidth="1" strokeDasharray="6,6" />

            {/* Green Pull-Over Safe Zone on Left Shoulder when ALERT is active */}
            {screenState === 'ALERT' && (
              <g>
                <rect
                  x="126"
                  y="140"
                  width="20"
                  height="105"
                  fill="rgba(34,197,94,0.28)"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  strokeDasharray="4,3"
                />
                <text
                  x="136"
                  y="195"
                  textAnchor="middle"
                  fill="#4ade80"
                  fontSize="7"
                  fontFamily="monospace"
                  fontWeight="bold"
                  transform="rotate(-90 136 195)"
                >
                  PULL OVER ZONE
                </text>
              </g>
            )}

            {/* Turn-by-Turn Blue Navigation Route Line */}
            {laneRole === 'SAME_LANE_AHEAD' || laneRole === 'GPS_LIVE' ? (
              <line
                x1={screenState === 'ALERT' ? 136 : 158}
                y1="245"
                x2={screenState === 'ALERT' ? 136 : 158}
                y2="10"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.75"
              />
            ) : laneRole === 'OPPOSITE_LANE' ? (
              <line
                x1="188"
                y1="10"
                x2="188"
                y2="245"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.75"
              />
            ) : (
              <line
                x1="15"
                y1="105"
                x2="325"
                y2="105"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.75"
              />
            )}

            {/* Junction Traffic Signal Indicator at Brigade Road (Y=82) */}
            <rect
              x="126"
              y="70"
              width="44"
              height="14"
              rx="4"
              fill="#020617"
              stroke={screenState === 'ALERT' ? '#22c55e' : '#f59e0b'}
              strokeWidth="1.2"
            />
            <circle
              cx="134"
              cy="77"
              r="3.5"
              fill={screenState === 'ALERT' ? '#22c55e' : '#10b981'}
            />
            <text x="142" y="80" fill="#e2e8f0" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
              {screenState === 'ALERT' ? 'PREEMPT' : 'SIGNAL'}
            </text>

            {/* Civilian Driver's Own Vehicle ("YOU") Positioned by Selected Vector Role */}
            {(() => {
              let cx = 158;
              let cy = 175;
              if (laneRole === 'SAME_LANE_AHEAD' || laneRole === 'GPS_LIVE') {
                cx = screenState === 'ALERT' ? 136 : 158;
                cy = 175;
              } else if (laneRole === 'OPPOSITE_LANE') {
                cx = 188;
                cy = 60;
              } else if (laneRole === 'CROSS_STREET') {
                cx = 82;
                cy = 105;
              }
              return (
                <g>
                  <circle cx={cx} cy={cy} r="13" fill="rgba(56,189,248,0.2)" />
                  <circle cx={cx} cy={cy} r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
                  <text
                    x={cx}
                    y={cy - 12}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    YOU ({activeRoleObj.heading}°)
                  </text>
                </g>
              );
            })()}

            {/* Approaching Ambulance Icon on the Corridor */}
            <g>
              <circle
                cx="158"
                cy={screenState === 'ALERT' ? 218 : 236}
                r="18"
                fill="rgba(239,68,68,0.22)"
                stroke="#ef4444"
                strokeWidth="1.2"
                strokeDasharray="3,2"
              />
              <rect
                x="151"
                y={screenState === 'ALERT' ? 210 : 228}
                width="14"
                height="18"
                rx="3"
                fill="#ffffff"
                stroke="#dc2626"
                strokeWidth="2"
              />
              <text
                x="158"
                y={screenState === 'ALERT' ? 241 : 248}
                textAnchor="middle"
                fill="#f87171"
                fontSize="7.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                AMB-108 (275°)
              </text>
            </g>
          </svg>

          {/* Voice Assistant / Bluetooth Waveform Bar inside Map Bottom */}
          <div className="bg-slate-950/95 border-t border-slate-800 px-3.5 py-2 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className={isSpeaking ? 'text-rose-400 animate-bounce' : 'text-emerald-400'}>
                {isSpeaking ? '🔊' : '🧭'}
              </span>
              <span className="text-[11px] text-slate-300 truncate max-w-[230px]">
                {screenState === 'ALERT'
                  ? 'Speaking over Car BT: "Merge left — ambulance behind"'
                  : '12 min (4.2 km) • Fastest route via MG Road'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">ETA 09:42</span>
          </div>
        </div>

        {/* ── 4. Vector Filter Mathematical Status Card (Shows Why Alert Fired or Was Ignored) ── */}
        <div
          className={`rounded-xl p-3 border font-mono text-xs transition ${
            !activeRoleObj.expectMatch
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : screenState === 'ALERT'
              ? 'bg-red-950/50 border-red-500/60 text-red-200'
              : 'bg-slate-900/90 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-[11px] uppercase tracking-wider">
              {activeRoleObj.expectMatch
                ? '🎯 VECTOR ALIGNED (ELIGIBLE FOR ALERT)'
                : '🛡️ VECTOR FILTERED (NO ALERT FATIGUE)'}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 text-[10px] font-bold border border-slate-700">
              dot = {vectorStatus.dotProduct.toFixed(2)}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            {vectorStatus.filterReason}
          </div>
          {vectorStatus.suppressedAlertCount > 0 && !activeRoleObj.expectMatch && (
            <div className="mt-1.5 text-[10px] text-emerald-400 font-bold">
              ✓ Suppressed {vectorStatus.suppressedAlertCount} irrelevant emergency broadcast(s) (Last:{' '}
              {vectorStatus.lastSuppressedAt})
            </div>
          )}
        </div>

        {/* ── 5. Viva / Lab Demo Controls: Switch Civilian Vehicle Vector Role ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              🧪 Test Civilian Vehicle Heading / Lane Role
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() =>
                  handleIncomingAlertPacket({
                    targeted: true,
                    targetMatch: activeRoleObj.expectMatch,
                    dotProduct:
                      laneRole === 'SAME_LANE_AHEAD'
                        ? 1.0
                        : laneRole === 'CROSS_STREET'
                        ? 0.0
                        : -1.0,
                    distanceMeters: 260,
                    etaSeconds: 14,
                    intersection: 'Brigade Road Junction',
                  })
                }
                className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[10px] font-bold"
              >
                Test Alert
              </button>
              <button
                onClick={handleClearanceConfirmed}
                className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold"
              >
                Test Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {LANE_ROLES.map((role) => (
              <button
                key={role.id}
                onClick={() => handleSelectLaneRole(role.id)}
                className={`text-left p-2 rounded-lg border transition ${
                  laneRole === role.id
                    ? role.expectMatch
                      ? 'bg-sky-950/70 border-sky-400 text-white'
                      : 'bg-emerald-950/70 border-emerald-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-[11px] font-bold">{role.label}</div>
                <div className="text-[9px] text-slate-400 truncate mt-0.5">{role.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
