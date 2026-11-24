import { NextResponse } from 'next/server';
import { reportDeparture, QueueConflict } from '../../../lib/dispatchStore';

export const runtime = 'nodejs';

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid intake form.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ departure: reportDeparture(input) }, { status: 201 });
  } catch (error) {
    if (error instanceof QueueConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Dispatch intake storage failed', error);
    return NextResponse.json({ error: 'Intake could not be saved. Dispatch has not started.' }, { status: 500 });
  }
}
