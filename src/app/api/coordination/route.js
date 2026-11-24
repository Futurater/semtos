import { NextResponse } from 'next/server';
import { assignNext, closeAssignment, coordinationQueue, QueueConflict } from '../../../lib/dispatchStore';

export const dynamic = 'force-dynamic';

function failure(error) {
  if (error instanceof QueueConflict) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid or incomplete coordination request.' }, { status: 400 });
  }
  console.error('Coordination queue error', error);
  return NextResponse.json({ error: 'The coordination queue is unavailable.' }, { status: 500 });
}

export function GET() {
  try { return NextResponse.json(coordinationQueue()); } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    const input = await request.json();
    if (input?.action === 'assign') return NextResponse.json({ dispatch: assignNext(input.caseId, input.ids) }, { status: 201 });
    if (input?.action === 'close') {
      closeAssignment(input.id);
      return NextResponse.json({ ok: true });
    }
    throw new TypeError('Unknown action');
  } catch (error) {
    return failure(error);
  }
}
