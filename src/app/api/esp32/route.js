import { NextResponse } from 'next/server';

/**
 * /api/esp32 - Local Node.js Proxy Route for ESP32 Hardware Communication
 * 
 * Bypasses all browser Private Network Access (PNA) and CORS restrictions.
 * Next.js server executes direct TCP HTTP request to the ESP32's local IP.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip');
  const cmd = searchParams.get('cmd') || 'R';

  if (!ip) {
    return NextResponse.json(
      { success: false, error: 'Missing IP address parameter' },
      { status: 400 }
    );
  }

  // Sanitize IP / optional port: strip http:// and trailing paths
  const rawTarget = ip.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const hostMatch = /^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/.exec(rawTarget);
  const portNum = hostMatch?.[2] ? Number(hostMatch[2]) : null;
  if (!hostMatch || (portNum !== null && (portNum < 1 || portNum > 65535))) {
    return NextResponse.json(
      { success: false, error: 'Invalid IP address or hostname' },
      { status: 400 }
    );
  }
  const cleanIp = hostMatch[0];
  const normalizedCmd = String(cmd || 'R').toUpperCase();
  const cleanCmd = ['R', 'Y', 'G', 'P'].includes(normalizedCmd) ? normalizedCmd : 'R';

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8-second timeout

    const res = await fetch(`http://${cleanIp}/signal?cmd=${cleanCmd}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    const bodyText = await res.text().catch(() => 'OK');
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      status: res.status,
      body: bodyText,
      ip: cleanIp,
      cmd: cleanCmd,
      latencyMs
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout
      ? `Connection timed out (1.8s) reaching http://${cleanIp}:80. Check if ESP32 is powered and connected to this Wi-Fi.`
      : `Network error: ${err.message || 'Connection failed'}`;

    return NextResponse.json({
      success: false,
      error: errorMsg,
      isTimeout,
      ip: cleanIp,
      cmd: cleanCmd
    }, { status: 502 });
  }
}
