const http = require('http');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (_) {
  WebSocket = require('./Semtos/node_modules/ws');
}

const PORT = process.env.PORT || 4081;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('SEMTOS V2X WebSocket Bridge Server is Running.\n');
});

const wss = new WebSocket.Server({ server });

let clientCount = 0;

wss.on('connection', (ws, req) => {
  clientCount++;
  const clientIp = req.socket.remoteAddress;
  console.log(`[V2X-SERVER] 🔗 New client connected from ${clientIp} (Total clients: ${clientCount})`);

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      // Log critical events, throttle high-frequency telemetry logging
      if (parsed.event && parsed.event !== 'AMBULANCE_TELEMETRY' && parsed.event !== 'GPS_BROADCAST') {
        console.log(`[V2X-SERVER] 📡 Received Event: ${parsed.event}`, parsed);
      }

      // Broadcast to all other connected clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
    } catch (e) {
      console.warn('[V2X-SERVER] Non-JSON payload received:', message.toString());
    }
  });

  ws.on('close', () => {
    clientCount = Math.max(0, clientCount - 1);
    console.log(`[V2X-SERVER] 🔌 Client disconnected (Total clients: ${clientCount})`);
  });

  ws.on('error', (err) => {
    console.error('[V2X-SERVER] Error:', err.message);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`======================================================`);
  console.log(`🚀 SEMTOS V2X WebSocket Bridge Server ACTIVE`);
  console.log(`   Local URL:    ws://localhost:${PORT}`);
  console.log(`   Network URL:  ws://10.94.111.121:${PORT}`);
  console.log(`======================================================`);
});
