import { useState, useEffect, useRef, useCallback } from 'react';

// ── SEMTOS Signal Phase Sequence (With Dynamic YOLOv8 Queue-Scaled Hold) ────
//
//  ALL_RED       — Initial gridlock. All 4 arms red. Cars queued.
//  W_GREEN       — Ambulance preemption. East-facing lane (type E) gets green.
//  E_RESUME      — Ambulance cleared. E cars resume and move freely. (5 s)
//  N_RELEASE     — North green, others red.                     (Adaptive / 15 s)
//  S_RELEASE     — South green, others red.                     (Adaptive / 15 s)
//  W_RELEASE     — Westbound green.                             (Adaptive / 15 s)
//  E_RELEASE     — Eastbound green.                             (Adaptive / 15 s)
//  NORMAL_CYCLE  — Sequential: N → S → W → E → repeat
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RELEASE_DURATION = 15_000; // ms
const RESUME_DURATION          = 5_000;  // ms — post-ambulance east-resume window

const SEQ_ARMS = ['N', 'S', 'W', 'E'];

export function useTrafficSignal() {
  const [phase, setPhase]                 = useState('ALL_RED');
  const [seqIdx, setSeqIdx]               = useState(0);
  const [adaptiveHoldMs, setAdaptiveHoldMs] = useState(DEFAULT_RELEASE_DURATION);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_RELEASE_DURATION);

  const phaseRef        = useRef('ALL_RED');
  const seqIdxRef       = useRef(0);
  const adaptiveHoldRef = useRef(DEFAULT_RELEASE_DURATION);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { seqIdxRef.current = seqIdx; }, [seqIdx]);
  useEffect(() => { adaptiveHoldRef.current = adaptiveHoldMs; }, [adaptiveHoldMs]);

  // Allow YOLOv8 queue scaling from v2x-server.js to dynamically adjust green phase hold
  const setAdaptiveGreenHoldSeconds = useCallback((seconds) => {
    const clampedSec = Math.max(8, Math.min(60, Number(seconds) || 15));
    const ms = clampedSec * 1000;
    setAdaptiveHoldMs(ms);
    adaptiveHoldRef.current = ms;
  }, []);

  // ── External triggers called by page.js / useTrafficStream ───────────────
  const onAmbulanceOnAvenue = useCallback(() => {
    const current = phaseRef.current;
    if (current !== 'W_GREEN' && current !== 'E_RESUME') {
      setPhase('W_GREEN');
      phaseRef.current = 'W_GREEN';
      setSeqIdx(0);
      seqIdxRef.current = 0;
      setTimeRemaining(adaptiveHoldRef.current);
    }
  }, []);

  const onAmbulanceCleared = useCallback(() => {
    if (phaseRef.current === 'W_GREEN') {
      setPhase('E_RESUME');
      phaseRef.current = 'E_RESUME';
      setTimeRemaining(RESUME_DURATION);
    }
  }, []);

  const onNormalCycle = useCallback(() => {
    const cur = phaseRef.current;
    if (cur !== 'W_GREEN' && cur !== 'E_RESUME') {
      setPhase('NORMAL_CYCLE');
      phaseRef.current = 'NORMAL_CYCLE';
      setSeqIdx(0);
      seqIdxRef.current = 0;
      setTimeRemaining(adaptiveHoldRef.current);
    }
  }, []);

  // ── Sequential release timer (E_RESUME → N → S → W → E → NORMAL) ────────
  useEffect(() => {
    if (
      phase !== 'E_RESUME'  &&
      phase !== 'N_RELEASE' &&
      phase !== 'S_RELEASE' &&
      phase !== 'W_RELEASE' &&
      phase !== 'E_RELEASE'
    ) return;

    const id = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          setPhase((cur) => {
            if (cur === 'E_RESUME')  return 'N_RELEASE';
            if (cur === 'N_RELEASE') return 'S_RELEASE';
            if (cur === 'S_RELEASE') return 'W_RELEASE';
            if (cur === 'W_RELEASE') return 'E_RELEASE';
            return 'NORMAL_CYCLE';
          });
          setTimeRemaining(adaptiveHoldRef.current);
          return adaptiveHoldRef.current;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ── Normal cycle timer — one arm at a time, scaled by YOLOv8 hold ───────
  useEffect(() => {
    if (phase !== 'NORMAL_CYCLE') return;
    setTimeRemaining(adaptiveHoldRef.current);

    const id = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          const nextIdx = (seqIdxRef.current + 1) % SEQ_ARMS.length;
          setSeqIdx(nextIdx);
          seqIdxRef.current = nextIdx;
          setTimeRemaining(adaptiveHoldRef.current);
          return adaptiveHoldRef.current;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ── Derive per-arm booleans ───────────────────────────────────────────────
  let nGreen = false, sGreen = false, eGreen = false, wGreen = false;
  let nYellow = false, sYellow = false, eYellow = false, wYellow = false;
  let isPreempted = false;

  const currentNormalArm = SEQ_ARMS[seqIdx];

  switch (phase) {
    case 'W_GREEN':
      eGreen = true;
      isPreempted = true;
      break;
    case 'E_RESUME':
      eGreen = true;
      isPreempted = false;
      break;
    case 'N_RELEASE': nGreen = true; break;
    case 'S_RELEASE': sGreen = true; break;
    case 'W_RELEASE': wGreen = true; break;
    case 'E_RELEASE': eGreen = true; break;
    case 'NORMAL_CYCLE':
      if (currentNormalArm === 'N') nGreen = true;
      if (currentNormalArm === 'S') sGreen = true;
      if (currentNormalArm === 'W') wGreen = true;
      if (currentNormalArm === 'E') eGreen = true;
      break;
    default: break;
  }

  const armLabel =
    phase === 'NORMAL_CYCLE'
      ? `${currentNormalArm}_GREEN`
      : phase;

  return {
    phase,
    nGreen, sGreen, eGreen, wGreen,
    nYellow, sYellow, eYellow, wYellow,
    isPreempted,
    onAmbulanceOnAvenue,
    onAmbulanceCleared,
    onNormalCycle,
    setAdaptiveGreenHoldSeconds,
    adaptiveHoldSeconds: Math.round(adaptiveHoldMs / 1000),
    signalPhase: armLabel,
    timeRemaining: Math.ceil(timeRemaining / 1000),
  };
}
