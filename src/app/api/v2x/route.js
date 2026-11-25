import { NextResponse } from 'next/server';
import { getOpenDispatch } from '../../../lib/dispatchStore';

export const dynamic = 'force-dynamic';

// Global in-memory store across Next.js dev/prod worker invocations
if (!globalThis.__SEMTOS_V2X_STATE__) {
  globalThis.__SEMTOS_V2X_STATE__ = {
    snapshot: null,
    lastUpdated: 0,
    pendingCommands: [],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const consumeCommands = searchParams.get('consumeCommands') === '1';

  const store = globalThis.__SEMTOS_V2X_STATE__;
  const commands = consumeCommands
    ? store.pendingCommands.filter(cmd => Date.now() - cmd.timestamp < (cmd.command === 'DISPATCH' ? 8000 : 1500))
    : [];
  if (consumeCommands) {
    store.pendingCommands = [];
  }

  return NextResponse.json({
    ok: true,
    snapshot: store.snapshot,
    lastUpdated: store.lastUpdated,
    snapshotAgeMs: store.snapshot ? Date.now() - store.lastUpdated : null,
    commands,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const store = globalThis.__SEMTOS_V2X_STATE__;

    if (body.type === 'SNAPSHOT' && body.payload) {
      store.snapshot = body.payload;
      store.lastUpdated = Date.now();
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'COMMAND' && body.command) {
      let payload = body.payload || {};
      if (body.command === 'DISPATCH') {
        const dispatch = getOpenDispatch(payload.dispatchId);
        if (!dispatch) return NextResponse.json({ error: 'An open coordination assignment is required.' }, { status: 400 });
        if (!store.snapshot || Date.now() - store.lastUpdated >= 4500) {
          return NextResponse.json({ error: 'The dashboard disconnected. Try again in standalone mode.' }, { status: 409 });
        }
        const state = store.snapshot;
        if (state.dispatch?.id === dispatch.id) return NextResponse.json({ ok: true });
        const queued = store.pendingCommands.find(cmd =>
          cmd.command === 'DISPATCH' && Date.now() - cmd.timestamp < 8000);
        if (queued?.payload?.dispatch?.id === dispatch.id) return NextResponse.json({ ok: true });
        if (queued) return NextResponse.json({ error: 'Another dispatch is waiting for the dashboard.' }, { status: 409 });
        const active = Boolean(
          state.case1?.isSimulationRunning ||
          state.case2?.isSimulationRunning ||
          (state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive)
        );
        if (active) return NextResponse.json({ error: 'A dispatch is already active in this scenario.' }, { status: 409 });
        payload = { dispatch };
      }
      store.pendingCommands.push({
        id: Date.now() + Math.random(),
        command: body.command,
        payload,
        timestamp: Date.now(),
      });
      // Keep queue bounded
      if (store.pendingCommands.length > 25) {
        store.pendingCommands.shift();
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Invalid message type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
