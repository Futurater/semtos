/**
 * SEMTOS Driver Companion App
 * ----------------------------
 * A simple 3-screen app built with React Native (Expo).
 *
 * How it works:
 *   1. IDLE      -> waiting, scanning for emergency vehicles
 *   2. ALERT     -> an ambulance is close, tell the driver to pull left
 *   3. THANK_YOU -> driver cleared the path, show a thank-you + fact
 *
 * The app listens to a WebSocket connection from the SEMTOS backend.
 * Two message types control which screen is shown:
 *   - "V2X_ALERT_TRIGGER"        -> switch to ALERT
 *   - "V2X_CLEARANCE_CONFIRMED"  -> switch to THANK_YOU (then auto-return to IDLE)
 *
 * No backend to test against yet? Just run the app — there are two
 * on-screen "Simulate" buttons that fire the same functions the
 * WebSocket messages would trigger.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// ---- Configuration ----------------------------------------------------

// Connected to local PC WebSocket server over Wi-Fi
const WEBSOCKET_URL = 'ws://10.94.111.121:4081';

// A few facts to rotate through on the Thank You screen.
const IMPACT_FACTS = [
  "Emergency response within the 'Golden Hour' increases patient survival chances by over 30%.",
  'Every 60 seconds saved can meaningfully increase survival odds in a medical emergency.',
  "Your quick reaction just saved precious seconds for someone in an ambulance.",
];

// How many seconds the Thank You screen stays up before returning to idle.
const THANK_YOU_DURATION_SECONDS = 6;

// The three possible screens.
const SCREENS = {
  IDLE: 'IDLE',
  ALERT: 'ALERT',
  THANK_YOU: 'THANK_YOU',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.IDLE);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_DURATION_SECONDS);
  const [currentFact, setCurrentFact] = useState(IMPACT_FACTS[0]);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const countdownRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const flashAnim = useRef(new Animated.Value(1)).current;

  // ---- Screen 2: Alert ---------------------------------------------
  // Call this when the backend says an ambulance is approaching.
  const triggerAlert = useCallback(() => {
    setScreen(SCREENS.ALERT);

    // Strong haptic buzz to grab attention immediately.
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (_) {}
    try {
      Vibration.vibrate([0, 300, 150, 300, 150, 300]);
    } catch (_) {}
  }, []);

  // ---- Screen 3: Thank You ------------------------------------------
  // Call this when the backend confirms the driver cleared the path.
  const triggerThankYou = useCallback(() => {
    const fact = IMPACT_FACTS[Math.floor(Math.random() * IMPACT_FACTS.length)];
    setCurrentFact(fact);
    setScreen(SCREENS.THANK_YOU);
    setSecondsLeft(THANK_YOU_DURATION_SECONDS);

    // A single gentle success buzz, different from the alert buzz.
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}

    // Count down, then return to idle automatically.
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

  // ---- WebSocket connection with auto-reconnect --------------------
  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        const socket = new WebSocket(WEBSOCKET_URL);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('[V2X-APP] Connected to SEMTOS backend');
          setIsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[V2X-APP] Message received:', data);

            if (data.event === 'V2X_ALERT_TRIGGER') {
              triggerAlert();
            }

            if (data.event === 'V2X_CLEARANCE_CONFIRMED') {
              triggerThankYou();
            }
          } catch (err) {
            console.warn('[V2X-APP] Could not parse message from backend:', err);
          }
        };

        socket.onerror = (err) => {
          console.warn('[V2X-APP] WebSocket error:', err.message);
        };

        socket.onclose = () => {
          console.log('[V2X-APP] Disconnected from SEMTOS backend, retrying in 3s...');
          setIsConnected(false);
          if (!unmounted) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };
      } catch (e) {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    // Clean up when the app unmounts.
    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [triggerAlert, triggerThankYou]);

  // ---- Flashing red background animation (Alert screen only) --------
  useEffect(() => {
    if (screen === SCREENS.ALERT) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.6, duration: 500, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [screen, flashAnim]);

  // ---- Render ----------------------------------------------------------

  return (
    <SafeAreaView style={[styles.container, screenBackgroundStyle(screen)]}>
      {screen === SCREENS.IDLE && <IdleScreen />}

      {screen === SCREENS.ALERT && (
        <Animated.View style={[styles.centered, { opacity: flashAnim }]}>
          <AlertScreen />
        </Animated.View>
      )}

      {screen === SCREENS.THANK_YOU && (
        <ThankYouScreen fact={currentFact} secondsLeft={secondsLeft} />
      )}

      {/* Demo controls — remove these once your real backend is wired up */}
      <View style={styles.demoControls}>
        <Text style={styles.demoLabel}>DEMO MODE</Text>
        <View style={styles.demoButtons}>
          <TouchableOpacity style={styles.demoButton} onPress={triggerAlert}>
            <Text style={styles.demoButtonText}>Simulate Ambulance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.demoButton} onPress={triggerThankYou}>
            <Text style={styles.demoButtonText}>Simulate Cleared</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---- Screen components ---------------------------------------------------

function IdleScreen() {
  return (
    <View style={styles.centered}>
      <View style={styles.statusDot} />
      <Text style={styles.idleTitle}>Road Clear</Text>
      <Text style={styles.idleSubtitle}>Scanning for emergency vehicles…</Text>
    </View>
  );
}

function AlertScreen() {
  return (
    <View style={styles.centered}>
      <Text style={styles.alertIcon}>🚨</Text>
      <Text style={styles.alertTitle}>EMERGENCY VEHICLE{'\n'}APPROACHING</Text>
      <View style={styles.alertActionBox}>
        <Text style={styles.alertActionText}>PULL OVER{'\n'}TO THE LEFT</Text>
      </View>
    </View>
  );
}

function ThankYouScreen({ fact, secondsLeft }) {
  return (
    <View style={styles.centered}>
      <View style={styles.thankYouBadge}>
        <Text style={styles.thankYouCheck}>✓</Text>
      </View>
      <Text style={styles.thankYouTitle}>Thank You for{'\n'}Giving Way!</Text>
      <View style={styles.factCard}>
        <Text style={styles.factText}>💡 {fact}</Text>
      </View>
      <Text style={styles.timerText}>Returning to standby in {secondsLeft}s</Text>
    </View>
  );
}

// ---- Styles -----------------------------------------------------------

function screenBackgroundStyle(screen) {
  if (screen === SCREENS.ALERT) return { backgroundColor: '#dc2626' };
  if (screen === SCREENS.THANK_YOU) return { backgroundColor: '#059669' };
  return { backgroundColor: '#0f172a' };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  // Idle screen
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    marginBottom: 16,
  },
  idleTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  idleSubtitle: {
    fontSize: 15,
    color: '#94a3b8',
  },

  // Alert screen
  alertIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 16,
  },
  alertActionBox: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  alertActionText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#dc2626',
    textAlign: 'center',
    lineHeight: 36,
  },

  // Thank you screen
  thankYouBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  thankYouCheck: {
    fontSize: 44,
    color: '#059669',
  },
  thankYouTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  factCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 16,
    borderRadius: 12,
  },
  factText: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
    textAlign: 'center',
  },
  timerText: {
    marginTop: 20,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },

  // Demo controls
  demoControls: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  demoLabel: {
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  demoButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  demoButton: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  demoButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});