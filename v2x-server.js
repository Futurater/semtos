/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: v2x-server.js (Milestone 1 — Event-Driven V2X & Spatial Orchestrator)
 *
 * Capabilities Implemented:
 *  1. Haversine Spatial Engine: Real-time distance (meters), bearing (0-360°),
 *     and ETA calculation to upcoming signalized intersections.
 *  2. Directional Vector Filtering: Dot-product cosine similarity between
 *     ambulance heading vector and civilian vehicle heading vector + forward-cone
 *     spatial check to prevent civilian alert fatigue on cross-streets/opposite lanes.
 *  3. Edge-AI YOLOv8 Queue Scaling: Receives real-time vehicle queue counts via
 *     WebSocket (`YOLO_QUEUE_UPDATE`) or REST (`POST /api/yolo-queue`) and
 *     dynamically scales green-light hold duration:
 *       T_hold = min(T_max, T_base + ceil(N_queue * t_discharge) + T_buffer)
 *  4. Dynamic Deadlock Rerouting: Automatically activates an alternative bypass
 *     corridor when intersection queue count/density exceeds gridlock thresholds.
 *  5. Hybrid Cloud / BLE Offline Fallback State: Supports simulating 5G/Wi-Fi
 *     cloud dropouts and local ESP32 BLE RSSI beacon override.
 *  6. Security & Audit Trail: Lightweight HMAC-SHA256 JWT token verification,
 *     timestamp replay protection, and a real-time ring buffer of audit logs.
 *  7. Zero-Dependency Resilience: Uses `ws` when installed and automatically
 *     falls back to a built-in RFC 6455 native Node.js WebSocket implementation
 *     so `node v2x-server.js` runs anywhere out of the box.
 */

const http = require('http');
const crypto = require('crypto');
const os = require('os');
const EventEmitter = require('events');

// ── 0. Load `ws` or Use Built-In RFC 6455 Native WebSocket Server Fallback ──
let WebSocketLib = null;
try {
  WebSocketLib = require('ws');
} catch (_) {
  try {
    WebSocketLib = require('./Semtos/node_modules/ws');
  } catch (__) {
    WebSocketLib = null;
  }
}

const WS_OPEN = 1;
const WS_CLOSED = 3;

class NativeWebSocketClient extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = WS_OPEN;
    this._buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => {
      this.readyState = WS_CLOSED;
      this.emit('close');
    });
    socket.on('end', () => {
      this.readyState = WS_CLOSED;
      this.emit('close');
    });
    socket.on('error', (err) => this.emit('error', err));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (this._buffer.length >= 2) {
      const firstByte = this._buffer[0];
      const secondByte = this._buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._buffer.length < 4) return;
        payloadLen = this._buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buffer.length < 10) return;
        payloadLen = Number(this._buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = isMasked ? 4 : 0;
      if (this._buffer.length < offset + maskLen + payloadLen) return;

      let payload = this._buffer.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (isMasked) {
        const mask = this._buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }

      this._buffer = this._buffer.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x08) {
        // Close frame
        this.close();
        return;
      } else if (opcode === 0x09) {
        // Ping -> Pong
        this._sendFrame(0x0a, payload);
      } else if (opcode === 0x01 || opcode === 0x02) {
        this.emit('message', payload);
      }
    }
  }

  _sendFrame(opcode, dataBuffer) {
    if (this.readyState !== WS_OPEN || !this.socket.writable) return;
    const len = dataBuffer.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, dataBuffer]));
  }

  send(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    this._sendFrame(0x01, buf);
  }

  close() {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    try {
      this._sendFrame(0x08, Buffer.alloc(0));
      this.socket.end();
    } catch (_) {}
  }
}

class NativeWebSocketServer extends EventEmitter {
  constructor({ server }) {
    super();
    this.clients = new Set();
    server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }
      const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`,
          '\r\n',
        ].join('\r\n')
      );

      const client = new NativeWebSocketClient(socket);
      this.clients.add(client);
      client.on('close', () => this.clients.delete(client));
      this.emit('connection', client, req);
    });
  }
}

const WebSocketServerClass = WebSocketLib ? WebSocketLib.Server : NativeWebSocketServer;

const PORT = Number(process.env.PORT) || 4081;
const JWT_SECRET = process.env.SEMTOS_JWT_SECRET || 'semtos-kscst-2026-v2x-secret-key';

// ── 1. Configurable SEMTOS Prototype Thresholds & Queue Model Constants ──────
const CONFIG = {
  PREEMPTION_RADIUS_METERS: 2000,   // 2.0 km configurable preemption geofence
  DEMO_PREEMPTION_METERS: 450,      // Scaled threshold for compact city-corridor demos
  ALERT_RADIUS_METERS: 500,         // 500 m targeted civilian alert geofence
  BLE_FALLBACK_RADIUS_METERS: 120,  // Local ESP32 BLE proximity override radius
  VECTOR_DOT_THRESHOLD: 0.70,       // cos(45°) ≈ 0.707 — minimum heading alignment
  FORWARD_CONE_DOT_MIN: 0.35,       // Ensures civilian car is ahead of ambulance, not behind
  T_BASE_SECONDS: 10,               // Base green phase duration (s)
  T_DISCHARGE_PER_CAR: 2.2,         // Average queue discharge time per vehicle (s/veh)
  T_BUFFER_SECONDS: 4,              // Safety clearance buffer (s)
  T_MAX_HOLD_SECONDS: 60,           // Maximum green hold cap (s)
  DEADLOCK_QUEUE_THRESHOLD: 12,     // Queue count >= 12 vehicles flags junction deadlock
  REPLAY_WINDOW_MS: 30_000,         // 30-second anti-replay window for signed packets
};

// ── 2. Authoritative Corridor & Intersection Definitions ─────────────────────
const CORRIDORS = {
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru — MG Road to Bowring Hospital',
    intersections: [
      {
        id: 'INT_BLR_MG_2',
        name: 'Brigade Road Junction',
        coords: [77.60662, 12.97522], // [lng, lat]
        approachBearing: 284,
        crossStreetBearing: 194,
      },
    ],
    primaryRoute: [
      [77.61684, 12.97303], // Trinity Metro Station
      [77.61520, 12.97331],
      [77.61365, 12.97358], // 1 MG Lido Mall
      [77.61210, 12.97385],
      [77.61065, 12.97411], // J1: Mayo Hall Junction
      [77.60930, 12.97446],
      [77.60805, 12.97481], // Cauvery Emporium
      [77.60662, 12.97522], // J2: Brigade Road Junction
      [77.60520, 12.97561],
      [77.60365, 12.97605],
      [77.60180, 12.97657], // J3: Anil Kumble Circle
    ],
    bypassRoute: [
      [77.61684, 12.97303],
      [77.61560, 12.97490], // Ulsoor Road North Turn
      [77.61320, 12.97720], // Dickenson Road Corridor
      [77.60910, 12.97810], // Cubbon Road Junction
      [77.60510, 12.97865],
      [77.60240, 12.97895],
      [77.60180, 12.97657], // Rejoin at Anil Kumble Circle
    ],
    bypassName: 'Ulsoor Rd – Cubbon Road Parallel Green Bypass',
  },
  BLR_HOSUR_RD: {
    id: 'BLR_HOSUR_RD',
    name: "Bengaluru — Silk Board to St. John's Hospital",
    intersections: [
      {
        id: 'INT_BLR_HSR_2',
        name: 'Nexus Checkpost Signal',
        coords: [77.61735, 12.92635],
        approachBearing: 342,
        crossStreetBearing: 72,
      },
    ],
    primaryRoute: [
      [77.62285, 12.91765], // Silk Board Flyover
      [77.62195, 12.91915],
      [77.62095, 12.92075], // J1: Madiwala Traffic Police Junction
      [77.61975, 12.92265],
      [77.61845, 12.92465],
      [77.61735, 12.92635], // J2: Nexus Checkpost Signal
      [77.61945, 12.92685],
      [77.62174, 12.92712], // J3: Koramangala Water Tank
      [77.62040, 12.92960],
      [77.61914, 12.93199], // St. John's Emergency Trauma Block
    ],
    bypassRoute: [
      [77.62285, 12.91765],
      [77.62580, 12.91840], // Outer Ring Road
      [77.62690, 12.92280], // Koramangala 80 Feet Rd
      [77.62480, 12.92690],
      [77.62174, 12.92712],
      [77.61914, 12.93199],
    ],
    bypassName: 'Koramangala 80 Feet Rd – Sarjapur Rd Emergency Bypass',
  },
  BLR_INDIRANAGAR: {
    id: 'BLR_INDIRANAGAR',
    name: 'Bengaluru — Indiranagar 100 Ft Rd to Manipal Hospital',
    intersections: [
      {
        id: 'INT_BLR_IND_2',
        name: 'Domlur 14th Cross Signal',
        coords: [77.64105, 12.96680],
        approachBearing: 175,
        crossStreetBearing: 85,
      },
    ],
    primaryRoute: [
      [77.63853, 12.97826], // Indiranagar Metro / CMH Road
      [77.64075, 12.97810],
      [77.64085, 12.97460], // J1: 12th Main Signal
      [77.64095, 12.97080],
      [77.64105, 12.96680], // J2: Domlur 14th Cross Signal
      [77.64115, 12.96180], // J3: Domlur Flyover
      [77.64480, 12.96040],
      [77.64860, 12.95920], // Manipal Hospital Emergency Bay
    ],
    bypassRoute: [
      [77.63853, 12.97826],
      [77.64490, 12.97780],
      [77.64620, 12.97050],
      [77.64780, 12.96320],
      [77.64860, 12.95920],
    ],
    bypassName: 'Indiranagar 80 Feet Rd – HAL 2nd Stage Bypass',
  },
};

// ── 3. Geodesic & Vector Mathematics ─────────────────────────────────────────
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle distance between two [lng, lat] points using the Haversine formula.
 * @returns {number} Distance in meters
 */
function haversineDistanceMeters([lon1, lat1], [lon2, lat2]) {
  if (
    typeof lon1 !== 'number' || typeof lat1 !== 'number' ||
    typeof lon2 !== 'number' || typeof lat2 !== 'number'
  ) {
    return Infinity;
  }
  const R = 6371000; // Earth mean radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Forward azimuth (bearing in degrees 0..360) from [lon1, lat1] to [lon2, lat2].
 */
function calculateBearing([lon1, lat1], [lon2, lat2]) {
  const y = Math.sin(toRadians(lon2 - lon1)) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(toRadians(lon2 - lon1));
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Converts a compass bearing (0° = North, 90° = East) into a 2D unit vector [ux, uy].
 */
function headingToUnitVector(bearingDeg) {
  const rad = toRadians(bearingDeg || 0);
  return [Math.sin(rad), Math.cos(rad)];
}

/**
 * Computes the 2D dot product (cosine similarity in [-1, +1]) of two compass headings.
 *  +1.0 => Identical direction (0° difference)
 *   0.0 => Perpendicular cross-traffic (90° difference)
 *  -1.0 => Opposite lane head-on (180° difference)
 */
function computeHeadingDotProduct(headingA, headingB) {
  const [ax, ay] = headingToUnitVector(headingA);
  const [bx, by] = headingToUnitVector(headingB);
  return Number((ax * bx + ay * by).toFixed(3));
}

/**
 * Evaluates whether a civilian vehicle should receive an emergency lane-clear alert.
 * Supports both real/simulated GPS coordinates AND indoor demo preset lane roles.
 */
function evaluateCivilianVectorFilter(ambulance, civilianClient) {
  const ambCoords = [ambulance.lng, ambulance.lat];
  const ambHeading = Number(ambulance.heading) || 0;

  // Case A: Indoor Demo Role Override (allows testing Same Lane vs Cross-Street vs Opposite Lane on any phone)
  if (civilianClient.laneRole === 'SAME_LANE_AHEAD') {
    const dotProduct = computeHeadingDotProduct(ambHeading, ambHeading); // 1.000
    const dist = ambulance.distanceToSignal
      ? Math.max(40, Math.round(ambulance.distanceToSignal * 0.65))
      : 240;
    const withinAlertZone = dist <= CONFIG.ALERT_RADIUS_METERS;
    return {
      targetMatch: withinAlertZone,
      dotProduct,
      forwardConeDot: 0.98,
      distanceMeters: dist,
      withinGeofence: withinAlertZone,
      filterReason: withinAlertZone
        ? `MATCHED: Same lane ahead (dot=${dotProduct.toFixed(2)}, dist=${dist}m <= ${CONFIG.ALERT_RADIUS_METERS}m)`
        : `STANDBY: Aligned ahead (dot=${dotProduct.toFixed(2)}) — outside ${CONFIG.ALERT_RADIUS_METERS}m alert ring (${dist}m)`,
    };
  }

  if (civilianClient.laneRole === 'OPPOSITE_LANE') {
    const oppHeading = (ambHeading + 180) % 360;
    const dotProduct = computeHeadingDotProduct(ambHeading, oppHeading); // -1.000
    return {
      targetMatch: false,
      dotProduct,
      forwardConeDot: 0.90,
      distanceMeters: 180,
      withinGeofence: true,
      filterReason: `SUPPRESSED: Opposite lane traffic (dot=${dotProduct.toFixed(2)} < ${CONFIG.VECTOR_DOT_THRESHOLD}) — zero alert fatigue`,
    };
  }

  if (civilianClient.laneRole === 'CROSS_STREET') {
    const crossHeading = (ambHeading + 90) % 360;
    const dotProduct = computeHeadingDotProduct(ambHeading, crossHeading); // 0.000
    return {
      targetMatch: false,
      dotProduct,
      forwardConeDot: 0.50,
      distanceMeters: 160,
      withinGeofence: true,
      filterReason: `SUPPRESSED: Cross-street approach (dot=${dotProduct.toFixed(2)} < ${CONFIG.VECTOR_DOT_THRESHOLD}) — held at red signal`,
    };
  }

  // Case B: Full Geodesic + Vector Math Evaluation using Civilian [lng, lat] and Heading
  if (typeof civilianClient.lat === 'number' && typeof civilianClient.lng === 'number') {
    const civCoords = [civilianClient.lng, civilianClient.lat];
    const distMeters = Math.round(haversineDistanceMeters(ambCoords, civCoords));
    const withinGeofence = distMeters <= CONFIG.ALERT_RADIUS_METERS;

    const civHeading = typeof civilianClient.heading === 'number' ? civilianClient.heading : ambHeading;
    const dotProduct = computeHeadingDotProduct(ambHeading, civHeading);

    // Check if civilian vehicle is physically ahead of the ambulance along its velocity vector
    const bearingAmbToCiv = calculateBearing(ambCoords, civCoords);
    const forwardConeDot = distMeters < 25 ? 1.0 : computeHeadingDotProduct(ambHeading, bearingAmbToCiv);

    const headingAligned = dotProduct >= CONFIG.VECTOR_DOT_THRESHOLD;
    const isAheadInCorridor = forwardConeDot >= CONFIG.FORWARD_CONE_DOT_MIN;
    const targetMatch = withinGeofence && headingAligned && isAheadInCorridor;

    let filterReason = '';
    if (!withinGeofence) {
      filterReason = `OUTSIDE GEOFENCE: ${distMeters}m > ${CONFIG.ALERT_RADIUS_METERS}m alert threshold`;
    } else if (!headingAligned) {
      filterReason = `VECTOR REJECTED: Heading dot=${dotProduct.toFixed(2)} < ${CONFIG.VECTOR_DOT_THRESHOLD}`;
    } else if (!isAheadInCorridor) {
      filterReason = `PASSED VEHICLE: Ambulance already ahead (forwardDot=${forwardConeDot.toFixed(2)})`;
    } else {
      filterReason = `MATCHED CORRIDOR: Ahead ${distMeters}m, heading dot=${dotProduct.toFixed(2)}`;
    }

    return {
      targetMatch,
      dotProduct,
      forwardConeDot,
      distanceMeters: distMeters,
      withinGeofence,
      filterReason,
    };
  }

  // Default fallback if a civilian client hasn't set coordinates or role yet (defaults to SAME_LANE_AHEAD)
  const defaultDist = ambulance.distanceToSignal || 220;
  return {
    targetMatch: true,
    dotProduct: 1.0,
    forwardConeDot: 1.0,
    distanceMeters: defaultDist,
    withinGeofence: true,
    filterReason: `MATCHED (Default Corridor Client): dist=${defaultDist}m, dot=1.00`,
  };
}

/**
 * Queue-aware green-light hold duration model:
 *   T_hold = min(T_max, T_base + ceil(N_queue * t_discharge) + T_buffer)
 */
function calculateGreenHoldSeconds(queueCount) {
  const n = Math.max(0, Number(queueCount) || 0);
  const rawHold = CONFIG.T_BASE_SECONDS + Math.ceil(n * CONFIG.T_DISCHARGE_PER_CAR) + CONFIG.T_BUFFER_SECONDS;
  return Math.min(CONFIG.T_MAX_HOLD_SECONDS, rawHold);
}

// ── 4. Lightweight HMAC-SHA256 JWT & Replay Protection ───────────────────────
function issueJwtToken(payload = { role: 'AMBULANCE_UNIT', unitId: 'AMB-KA01-108' }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Date.now(),
      exp: Date.now() + 12 * 3600 * 1000,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwtToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'Missing token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'Malformed JWT' };
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expectedSig) return { valid: false, reason: 'Invalid HMAC signature' };
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && Date.now() > decoded.exp) {
      return { valid: false, reason: 'Token expired' };
    }
    return { valid: true, decoded };
  } catch (e) {
    return { valid: false, reason: 'Invalid payload JSON' };
  }
}

// ── 5. Central Orchestrator State Store ──────────────────────────────────────
const state = {
  corridorId: 'BLR_MG_ROAD',
  networkMode: 'CLOUD_ONLINE', // 'CLOUD_ONLINE' | 'BLE_FALLBACK'
  ambulance: {
    unitId: 'AMB-108-BLR',
    active: false,
    lat: 12.97303,
    lng: 77.61684,
    speedKmh: 0,
    heading: 284,
    distanceToSignal: 0,
    etaSeconds: 0,
    bleBeaconActive: true,
    rssiDbm: -52,
    lastUpdated: null,
  },
  yoloQueue: {
    queueCount: 4,
    detectedVehicles: 6,
    queueDensity: 'MODERATE', // 'LOW' | 'MODERATE' | 'HIGH' | 'GRIDLOCK'
    recommendedHoldSeconds: calculateGreenHoldSeconds(4),
    deadlockDetected: false,
    source: 'SIMULATED_DEFAULT',
    lastUpdated: null,
  },
  signal: {
    intersectionId: 'INT_BLR_1',
    intersectionName: 'Brigade Road Junction',
    phase: 'NORMAL_CYCLE', // 'NORMAL_CYCLE' | 'W_GREEN' | 'E_RESUME' | 'N_RELEASE' | 'BLE_OVERRIDE'
    preemptionActive: false,
    greenHoldSeconds: calculateGreenHoldSeconds(4),
    nGreen: true,
    sGreen: true,
    eGreen: false,
    wGreen: false,
    esp32LedState: 'RED', // Physical ESP32 traffic light state for target approach arm ('RED' | 'YELLOW' | 'GREEN')
    buzzerActive: false,
  },
  routing: {
    deadlockRerouteActive: false,
    activeRouteType: 'PRIMARY', // 'PRIMARY' | 'BYPASS'
    bypassName: CORRIDORS.BLR_MG_ROAD.bypassName,
    activeRouteCoords: CORRIDORS.BLR_MG_ROAD.primaryRoute,
  },
  metrics: {
    lastDispatchLatencyMs: 3.2,
    totalAlertsSent: 0,
    totalAlertsSuppressed: 0,
    connectedClients: 0,
  },
  auditLogs: [],
};

// Track connected WebSocket metadata: Map<ws, { id, clientType, laneRole, lat, lng, heading }>
const clientRegistry = new Map();
const processedNonces = new Set();

function appendAuditLog(category, message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toTimeString().split(' ')[0],
    isoTime: new Date().toISOString(),
    category,
    message,
  };
  state.auditLogs.push(entry);
  if (state.auditLogs.length > 60) {
    state.auditLogs.shift();
  }
  broadcastAll({
    event: 'AUDIT_LOG_APPEND',
    log: entry,
  });
  return entry;
}

// ── 6. Broadcast Helpers ─────────────────────────────────────────────────────
function sendJson(ws, payload) {
  if (ws && ws.readyState === WS_OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastAll(payload, excludeWs = null) {
  const serialized = JSON.stringify(payload);
  for (const [clientWs] of clientRegistry.entries()) {
    if (clientWs !== excludeWs && clientWs.readyState === WS_OPEN) {
      clientWs.send(serialized);
    }
  }
}

appendAuditLog('SYSTEM', 'SEMTOS V2X Spatial & Vector Orchestrator initialized on port ' + PORT);

/**
 * Dispatches vector-filtered alerts to every connected civilian client,
 * computing individual dot-product alignment and recording suppression metrics.
 */
function dispatchVectorFilteredAlerts(intersectionName, distanceMeters, etaSeconds) {
  const t0 = process.hrtime.bigint();
  let matchedCount = 0;
  let suppressedCount = 0;

  for (const [clientWs, meta] of clientRegistry.entries()) {
    if (clientWs.readyState !== WS_OPEN) continue;

    const filterResult = evaluateCivilianVectorFilter(state.ambulance, meta);
    if (filterResult.targetMatch) {
      matchedCount++;
    } else if (meta.clientType === 'CIVILIAN_DRIVER') {
      suppressedCount++;
    }

    const voicePrompt = filterResult.targetMatch
      ? `Attention: Emergency ambulance approaching ${distanceMeters} meters behind you towards ${intersectionName}. Please merge left and clear the lane.`
      : null;

    // Send targeted evaluation to this specific client
    sendJson(clientWs, {
      event: 'V2X_ALERT_TRIGGER',
      targeted: true,
      targetMatch: filterResult.targetMatch,
      dotProduct: filterResult.dotProduct,
      forwardConeDot: filterResult.forwardConeDot,
      filterReason: filterResult.filterReason,
      laneRole: meta.laneRole || 'SAME_LANE_AHEAD',
      intersection: intersectionName,
      distanceMeters,
      etaSeconds,
      speedKmh: state.ambulance.speedKmh,
      greenHoldSeconds: state.signal.greenHoldSeconds,
      networkMode: state.networkMode,
      voicePrompt,
      timestamp: Date.now(),
    });
  }

  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  state.metrics.lastDispatchLatencyMs = Number(Math.max(0.4, elapsedMs).toFixed(2));
  state.metrics.totalAlertsSent += matchedCount;
  state.metrics.totalAlertsSuppressed += suppressedCount;

  appendAuditLog(
    'VECTOR_FILTER',
    `Dispatched alerts in ${state.metrics.lastDispatchLatencyMs}ms (${matchedCount} matched ahead, ${suppressedCount} suppressed via dot-product filter; Hold=${state.signal.greenHoldSeconds}s).`
  );
}

// ── 7. Core Orchestration Evaluators ─────────────────────────────────────────
function updateYoloQueueMetrics(data) {
  const prevDeadlock = state.yoloQueue.deadlockDetected;
  const queueCount = Math.max(0, Number(data.queueCount ?? data.count ?? state.yoloQueue.queueCount));
  const detectedVehicles = Math.max(queueCount, Number(data.detectedVehicles ?? queueCount));
  const holdSeconds = calculateGreenHoldSeconds(queueCount);

  let queueDensity = 'LOW';
  if (queueCount >= CONFIG.DEADLOCK_QUEUE_THRESHOLD) queueDensity = 'GRIDLOCK';
  else if (queueCount >= 8) queueDensity = 'HIGH';
  else if (queueCount >= 4) queueDensity = 'MODERATE';

  const deadlockDetected = Boolean(
    data.deadlockDetected !== undefined
      ? data.deadlockDetected
      : queueCount >= CONFIG.DEADLOCK_QUEUE_THRESHOLD
  );

  state.yoloQueue = {
    queueCount,
    detectedVehicles,
    queueDensity,
    recommendedHoldSeconds: holdSeconds,
    deadlockDetected,
    source: data.source || 'YOLOV8_OPENCV_STREAM',
    lastUpdated: Date.now(),
  };

  state.signal.greenHoldSeconds = holdSeconds;

  // Evaluate Deadlock Rerouting
  const corridor = CORRIDORS[state.corridorId] || CORRIDORS.BLR_MG_ROAD;
  if (deadlockDetected && !prevDeadlock) {
    state.routing.deadlockRerouteActive = true;
    state.routing.activeRouteType = 'BYPASS';
    state.routing.bypassName = corridor.bypassName;
    state.routing.activeRouteCoords = corridor.bypassRoute;

    appendAuditLog(
      'DEADLOCK_REROUTE',
      `YOLOv8 detected ${queueCount} queued vehicles (GRIDLOCK) at ${corridor.intersections[0].name}. Dynamic rerouting activated via ${corridor.bypassName}.`
    );

    broadcastAll({
      event: 'V2X_DEADLOCK_REROUTE',
      deadlockDetected: true,
      queueCount,
      corridorId: state.corridorId,
      bypassName: corridor.bypassName,
      bypassRoute: corridor.bypassRoute,
      timestamp: Date.now(),
    });
  } else if (!deadlockDetected && prevDeadlock) {
    state.routing.deadlockRerouteActive = false;
    state.routing.activeRouteType = 'PRIMARY';
    state.routing.activeRouteCoords = corridor.primaryRoute;

    appendAuditLog(
      'ROUTE_RESTORED',
      `Junction queue cleared to ${queueCount} vehicles. Primary corridor restored.`
    );

    broadcastAll({
      event: 'V2X_DEADLOCK_REROUTE',
      deadlockDetected: false,
      queueCount,
      corridorId: state.corridorId,
      bypassName: corridor.bypassName,
      bypassRoute: corridor.primaryRoute,
      timestamp: Date.now(),
    });
  }

  broadcastAll({
    event: 'YOLO_QUEUE_STATE',
    yoloQueue: state.yoloQueue,
    signal: state.signal,
    routing: state.routing,
    timestamp: Date.now(),
  });
}

function processAmbulanceTelemetry(data, senderWs = null) {
  if (data.corridorId && CORRIDORS[data.corridorId] && data.corridorId !== state.corridorId) {
    state.corridorId = data.corridorId;
    const cor = CORRIDORS[state.corridorId];
    state.signal.intersectionId = cor.intersections[0].id;
    state.signal.intersectionName = cor.intersections[0].name;
    state.routing.bypassName = cor.bypassName;
    state.routing.activeRouteCoords = state.routing.deadlockRerouteActive ? cor.bypassRoute : cor.primaryRoute;
  }

  const corridor = CORRIDORS[state.corridorId] || CORRIDORS.BLR_MG_ROAD;
  const targetInt = corridor.intersections[0];

  const lat = typeof data.lat === 'number' ? data.lat : state.ambulance.lat;
  const lng = typeof data.lng === 'number' ? data.lng : state.ambulance.lng;
  const speedKmh = typeof data.speedKmh === 'number' ? data.speedKmh : state.ambulance.speedKmh || 50;
  const heading =
    typeof data.heading === 'number'
      ? data.heading
      : calculateBearing([lng, lat], targetInt.coords);

  // Compute authoritative Haversine distance to intersection (or honor explicit sim distance if provided)
  const computedDistMeters = Math.round(haversineDistanceMeters([lng, lat], targetInt.coords));
  const distToSignal =
    typeof data.distanceToSignal === 'number' && data.distanceToSignal >= 0
      ? Math.round(data.distanceToSignal)
      : computedDistMeters;

  const speedMps = Math.max(1, speedKmh / 3.6);
  const etaSeconds =
    typeof data.etaSeconds === 'number'
      ? data.etaSeconds
      : Math.round(distToSignal / speedMps);

  // Estimate simulated BLE RSSI based on distance
  const rssiDbm = Math.max(-95, Math.min(-38, Math.round(-42 - 20 * Math.log10(Math.max(1, distToSignal / 10)))));

  const wasPreempted = state.signal.preemptionActive;
  let preemptionActive = Boolean(data.preemptionActive);

  // Trigger preemption automatically when inside threshold
  if (state.networkMode === 'BLE_FALLBACK') {
    preemptionActive = distToSignal <= CONFIG.BLE_FALLBACK_RADIUS_METERS;
  } else if (data.preemptionActive === undefined) {
    preemptionActive = distToSignal <= CONFIG.DEMO_PREEMPTION_METERS && distToSignal > 0;
  }

  const phase = preemptionActive
    ? state.networkMode === 'BLE_FALLBACK'
      ? 'BLE_OVERRIDE'
      : 'W_GREEN'
    : data.signalPhase || 'NORMAL_CYCLE';

  state.ambulance = {
    unitId: data.unitId || state.ambulance.unitId,
    active: true,
    lat,
    lng,
    speedKmh,
    heading: Math.round(heading),
    distanceToSignal: distToSignal,
    etaSeconds,
    bleBeaconActive: true,
    rssiDbm,
    lastUpdated: Date.now(),
  };

  state.signal = {
    ...state.signal,
    intersectionId: targetInt.id,
    intersectionName: targetInt.name,
    phase,
    preemptionActive,
    greenHoldSeconds: state.yoloQueue.recommendedHoldSeconds,
    nGreen: !preemptionActive,
    sGreen: !preemptionActive,
    eGreen: preemptionActive,
    wGreen: preemptionActive,
    esp32LedState: preemptionActive ? 'GREEN' : 'RED',
    buzzerActive: preemptionActive,
  };

  // If preemption just transitioned from false -> true, fire vector-filtered alerts & ESP32 command
  if (preemptionActive && !wasPreempted) {
    appendAuditLog(
      state.networkMode === 'BLE_FALLBACK' ? 'BLE_FAILOVER' : 'PREEMPTION',
      `${state.networkMode === 'BLE_FALLBACK' ? '[BLE OFFLINE FALLBACK]' : '[V2X CLOUD]'} Signal ${targetInt.name} preempted to GREEN (Dist=${distToSignal}m, ETA=${etaSeconds}s, Hold=${state.signal.greenHoldSeconds}s for ${state.yoloQueue.queueCount} queued cars).`
    );
    dispatchVectorFilteredAlerts(targetInt.name, distToSignal, etaSeconds);

    broadcastAll({
      event: 'ESP32_SIGNAL_COMMAND',
      intersectionId: targetInt.id,
      ledState: 'GREEN',
      buzzer: true,
      mode: state.networkMode,
      holdSeconds: state.signal.greenHoldSeconds,
      rssiDbm,
      timestamp: Date.now(),
    });
  }

  const enrichedPacket = {
    event: data.event || 'AMBULANCE_TELEMETRY',
    unitId: state.ambulance.unitId,
    corridorId: state.corridorId,
    lat,
    lng,
    speedKmh,
    heading: Math.round(heading),
    distanceToSignal: distToSignal,
    etaSeconds,
    intersection: targetInt.name,
    signalPhase: phase,
    preemptionActive,
    greenHoldSeconds: state.signal.greenHoldSeconds,
    queueCount: state.yoloQueue.queueCount,
    queueDensity: state.yoloQueue.queueDensity,
    deadlockRerouteActive: state.routing.deadlockRerouteActive,
    networkMode: state.networkMode,
    rssiDbm,
    dispatchLatencyMs: state.metrics.lastDispatchLatencyMs,
    timestamp: Date.now(),
  };

  broadcastAll(enrichedPacket, senderWs);
}

// ── 8. HTTP REST API + Health Server ─────────────────────────────────────────
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. GET /api/state — Complete authoritative system state for Dashboard & debugging
  if (req.method === 'GET' && pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        ok: true,
        config: CONFIG,
        state,
        corridors: CORRIDORS,
      })
    );
  }

  // 2. GET /api/signal-state — Lightweight polling endpoint for ESP32 / hardware nodes
  if (req.method === 'GET' && pathname === '/api/signal-state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        intersectionId: state.signal.intersectionId,
        ledState: state.signal.esp32LedState,
        buzzerActive: state.signal.buzzerActive,
        greenHoldSeconds: state.signal.greenHoldSeconds,
        networkMode: state.networkMode,
        rssiDbm: state.ambulance.rssiDbm,
        timestamp: Date.now(),
      })
    );
  }

  // 3. GET /api/auth/token — Issues a signed JWT for the Ambulance Transmitter client
  if (req.method === 'GET' && pathname === '/api/auth/token') {
    const unitId = urlObj.searchParams.get('unitId') || 'AMB-108-BLR';
    const token = issueJwtToken({ role: 'AMBULANCE_UNIT', unitId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, unitId, token }));
  }

  // 4. POST /api/yolo-queue — REST ingestion endpoint for Python YOLOv8 + OpenCV script
  if (req.method === 'POST' && pathname === '/api/yolo-queue') {
    const body = await parseJsonBody(req);
    updateYoloQueueMetrics(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        ok: true,
        yoloQueue: state.yoloQueue,
        greenHoldSeconds: state.signal.greenHoldSeconds,
        deadlockRerouteActive: state.routing.deadlockRerouteActive,
      })
    );
  }

  // Default health text response (backwards-compatible)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SEMTOS V2X WebSocket & Spatial Orchestration Server is Running.\n');
});

// ── 9. WebSocket Event Server ────────────────────────────────────────────────
const wss = new WebSocketServerClass({ server });

wss.on('connection', (ws, req) => {
  const clientId = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const clientIp = req.socket.remoteAddress;

  clientRegistry.set(ws, {
    id: clientId,
    ip: clientIp,
    clientType: 'GENERIC', // 'DASHBOARD' | 'AMBULANCE_UNIT' | 'CIVILIAN_DRIVER' | 'YOLO_NODE' | 'ESP32_NODE'
    laneRole: 'SAME_LANE_AHEAD',
    lat: null,
    lng: null,
    heading: null,
    connectedAt: Date.now(),
  });

  state.metrics.connectedClients = clientRegistry.size;
  console.log(`[V2X-SERVER] 🔗 Client connected (${clientId} from ${clientIp}) | Total: ${clientRegistry.size}`);

  // Immediately send initial state snapshot to newly connected client
  sendJson(ws, {
    event: 'SEMTOS_INIT_STATE',
    clientId,
    config: CONFIG,
    state,
    corridors: CORRIDORS,
    defaultToken: issueJwtToken({ role: 'AMBULANCE_UNIT', unitId: 'AMB-108-BLR' }),
  });

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      const meta = clientRegistry.get(ws) || {};

      // Optional replay-protection check if nonce + signedTimestamp are supplied
      if (parsed.nonce && parsed.signedTimestamp) {
        const drift = Math.abs(Date.now() - Number(parsed.signedTimestamp));
        if (drift > CONFIG.REPLAY_WINDOW_MS || processedNonces.has(parsed.nonce)) {
          appendAuditLog('SECURITY', `Rejected replayed or stale packet (nonce=${parsed.nonce}, drift=${drift}ms).`);
          return sendJson(ws, { event: 'SECURITY_REJECTED', reason: 'Replay window violation' });
        }
        processedNonces.add(parsed.nonce);
        if (processedNonces.size > 500) {
          const oldest = processedNonces.values().next().value;
          processedNonces.delete(oldest);
        }
      }

      switch (parsed.event) {
        // A. Client Registration (Dashboard, Ambulance Phone, Civilian Phone, YOLOv8, ESP32)
        case 'REGISTER_CLIENT': {
          const updatedMeta = {
            ...meta,
            clientType: parsed.clientType || meta.clientType,
            laneRole: parsed.laneRole || meta.laneRole || 'SAME_LANE_AHEAD',
            lat: typeof parsed.lat === 'number' ? parsed.lat : meta.lat,
            lng: typeof parsed.lng === 'number' ? parsed.lng : meta.lng,
            heading: typeof parsed.heading === 'number' ? parsed.heading : meta.heading,
          };
          clientRegistry.set(ws, updatedMeta);

          // Evaluate filter preview immediately for civilian drivers
          const previewFilter = evaluateCivilianVectorFilter(state.ambulance, updatedMeta);
          sendJson(ws, {
            event: 'CLIENT_REGISTERED',
            clientId: updatedMeta.id,
            clientType: updatedMeta.clientType,
            laneRole: updatedMeta.laneRole,
            vectorPreview: previewFilter,
          });
          break;
        }

        // B. Civilian Driver Telemetry / Lane Role Update
        case 'CIVILIAN_TELEMETRY': {
          const updatedMeta = {
            ...meta,
            clientType: 'CIVILIAN_DRIVER',
            laneRole: parsed.laneRole || meta.laneRole,
            lat: typeof parsed.lat === 'number' ? parsed.lat : meta.lat,
            lng: typeof parsed.lng === 'number' ? parsed.lng : meta.lng,
            heading: typeof parsed.heading === 'number' ? parsed.heading : meta.heading,
          };
          clientRegistry.set(ws, updatedMeta);

          const filterEval = evaluateCivilianVectorFilter(state.ambulance, updatedMeta);
          sendJson(ws, {
            event: 'VECTOR_FILTER_STATUS',
            ...filterEval,
            laneRole: updatedMeta.laneRole,
            preemptionActive: state.signal.preemptionActive,
          });
          break;
        }

        // C. Ambulance Telemetry / Phone GPS Broadcast
        case 'AMBULANCE_TELEMETRY':
        case 'GPS_BROADCAST': {
          processAmbulanceTelemetry(parsed, ws);
          break;
        }

        // D. Explicit Preemption Alert Trigger (from 3D Twin, Map, or Ambulance Phone)
        case 'V2X_ALERT_TRIGGER': {
          const corridor = CORRIDORS[state.corridorId] || CORRIDORS.BLR_MG_ROAD;
          const intName = parsed.intersection || corridor.intersections[0].name;
          const dist = parsed.distanceMeters ?? (state.ambulance.distanceToSignal || 320);
          const eta = parsed.etaSeconds ?? (state.ambulance.etaSeconds || 16);

          state.ambulance.active = true;
          state.ambulance.distanceToSignal = dist;
          state.ambulance.etaSeconds = eta;
          state.signal.preemptionActive = true;
          state.signal.phase = state.networkMode === 'BLE_FALLBACK' ? 'BLE_OVERRIDE' : 'W_GREEN';
          state.signal.esp32LedState = 'GREEN';
          state.signal.buzzerActive = true;

          dispatchVectorFilteredAlerts(intName, dist, eta);

          // Also notify 3D Twin, Map, and ESP32 nodes
          broadcastAll(
            {
              event: 'ESP32_SIGNAL_COMMAND',
              intersectionId: state.signal.intersectionId,
              ledState: 'GREEN',
              buzzer: true,
              mode: state.networkMode,
              holdSeconds: state.signal.greenHoldSeconds,
              timestamp: Date.now(),
            },
            ws
          );
          break;
        }

        // E. Junction Clearance Confirmed
        case 'V2X_CLEARANCE_CONFIRMED': {
          state.signal.preemptionActive = false;
          state.signal.phase = 'E_RESUME';
          state.signal.esp32LedState = 'RED';
          state.signal.buzzerActive = false;

          appendAuditLog(
            'CLEARANCE',
            `Ambulance cleared ${parsed.intersection || state.signal.intersectionName}. Restoring sequential signal phases.`
          );

          broadcastAll({
            event: 'V2X_CLEARANCE_CONFIRMED',
            intersection: parsed.intersection || state.signal.intersectionName,
            timestamp: Date.now(),
          });

          broadcastAll({
            event: 'ESP32_SIGNAL_COMMAND',
            intersectionId: state.signal.intersectionId,
            ledState: 'RED',
            buzzer: false,
            mode: state.networkMode,
            holdSeconds: 15,
            timestamp: Date.now(),
          });
          break;
        }

        // F. Edge-AI YOLOv8 Queue Update
        case 'YOLO_QUEUE_UPDATE': {
          updateYoloQueueMetrics(parsed);
          break;
        }

        // G. Network Mode Toggle (Cloud Online vs. BLE Offline Fallback)
        case 'NETWORK_MODE_TOGGLE': {
          const nextMode =
            parsed.networkMode ||
            (state.networkMode === 'CLOUD_ONLINE' ? 'BLE_FALLBACK' : 'CLOUD_ONLINE');
          state.networkMode = nextMode;

          appendAuditLog(
            'NETWORK_MODE',
            nextMode === 'BLE_FALLBACK'
              ? '5G/Cloud outage simulated — switched to ESP32 BLE Offline Beacon Fallback mode.'
              : 'V2X Cloud connectivity restored — primary WebSocket/TLS orchestration active.'
          );

          broadcastAll({
            event: 'NETWORK_MODE_CHANGED',
            networkMode: state.networkMode,
            bleRadiusMeters: CONFIG.BLE_FALLBACK_RADIUS_METERS,
            rssiDbm: state.ambulance.rssiDbm,
            timestamp: Date.now(),
          });
          break;
        }

        // H. Simulation / Corridor / Deadlock Controls
        case 'SIMULATION_STARTED': {
          if (parsed.corridor && CORRIDORS[parsed.corridor]) {
            state.corridorId = parsed.corridor;
          }
          state.ambulance.active = true;
          appendAuditLog('DISPATCH', `Emergency session initiated on corridor ${state.corridorId}.`);
          broadcastAll(parsed, ws);
          break;
        }

        default: {
          // Preserve default broadcast relay for any custom events
          console.log(`[V2X-SERVER] 📡 Relaying Event: ${parsed.event || 'CUSTOM'}`);
          broadcastAll(parsed, ws);
          break;
        }
      }
    } catch (e) {
      console.warn('[V2X-SERVER] Non-JSON payload received:', message.toString());
    }
  });

  ws.on('close', () => {
    clientRegistry.delete(ws);
    state.metrics.connectedClients = clientRegistry.size;
    console.log(`[V2X-SERVER] 🔌 Client disconnected (${clientId}) | Total: ${clientRegistry.size}`);
  });

  ws.on('error', (err) => {
    console.error('[V2X-SERVER] Socket error:', err.message);
  });
});

// ── 10. Discover Local LAN IPv4 Address for Easy Phone Connection ────────────
function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalLanIp();
  console.log(`====================================================================`);
  console.log(`🚀 SEMTOS V2X Spatial & Vector Orchestration Server ACTIVE`);
  console.log(`   Engine Mode:             ${WebSocketLib ? 'ws package' : 'Built-in RFC 6455 Native WebSocket'}`);
  console.log(`   WebSocket URL (Local):   ws://localhost:${PORT}`);
  console.log(`   WebSocket URL (LAN):     ws://${lanIp}:${PORT}`);
  console.log(`   REST State Endpoint:     http://${lanIp}:${PORT}/api/state`);
  console.log(`   YOLOv8 Queue Endpoint:   http://${lanIp}:${PORT}/api/yolo-queue`);
  console.log(`   ESP32 Signal Endpoint:   http://${lanIp}:${PORT}/api/signal-state`);
  console.log(`====================================================================`);
});
