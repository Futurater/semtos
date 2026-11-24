'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function CoordinationQueue({ start, className, busy, currentDispatchId }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const response = await fetch('/api/coordination', { cache: 'no-store' });
    if (!response.ok) throw new Error('The coordination queue is unavailable.');
    setQueue(await response.json());
  }

  useEffect(() => {
    if (!open) return;
    const load = () => refresh().catch(issue => setError(issue.message));
    load();
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [open]);

  async function change(input) {
    const response = await fetch('/api/coordination', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  async function act(action) {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (issue) {
      setError(issue.message);
    } finally {
      try { await refresh(); } catch (issue) { setError(issue.message); }
      setPending(false);
    }
  }

  const waiting = queue?.waiting ?? [];
  const assigned = queue?.assigned;
  const count = Math.min(waiting.length, 2);
  return <>
    <button className={className} type="button" onClick={() => { setOpen(true); setError(''); dialog.current.showModal(); }}>Coordination queue</button>
    <dialog ref={dialog} className="dispatch-dialog" aria-label="Coordination queue" onClose={() => setOpen(false)}>
      <section className="queue-panel">
        <header><div><small>Operations desk</small><h2>Coordination queue</h2></div>
          <button type="button" className="intake-close" aria-label="Close queue" onClick={() => dialog.current.close()}><X size={20}/></button></header>
        {assigned && <section className="dispatch-decision"><h3>Current assignment</h3>
          <ol>{assigned.units.map((unit, index) => <li key={index}><strong>{unit.vehicleId} · {unit.hospital}</strong>
            <span>{index === 0 ? 'Direct priority corridor' : 'Cubbon Road detour'}</span></li>)}</ol>
          <div className="queue-actions">
            {currentDispatchId !== assigned.id && <button type="button" className="primary-action" disabled={busy || pending}
              onClick={() => act(async () => { await start(assigned); dialog.current.close(); })}>Start coordination</button>}
            <button type="button" className="queue-secondary" disabled={busy || pending}
              onClick={() => act(() => change({ action:'close', id:assigned.id }))}>Close assignment</button>
          </div>
        </section>}
        <section><h3>Waiting departures</h3>
          {!queue ? <p>Loading departures…</p> : count === 0 ? <p>No departures waiting. Hospitals can report each trip from the hospital portal.</p> :
            <ol className="waiting-list">{waiting.map(unit => <li key={unit.id}><div><strong>{unit.vehicleId}</strong><small>{unit.urgency}</small></div>
              <p>{unit.hospital} · {unit.pickup} → {unit.destination}</p></li>)}</ol>}
        </section>
        {count > 0 && !assigned && <button type="button" className="primary-action" disabled={busy || pending}
          onClick={() => act(() => change({ action:'assign', caseId:count === 2 ? 3 : 1, ids:waiting.slice(0, count).map(unit=>unit.id) }))}>
          {count === 2 ? 'Assign next two ambulances' : 'Assign next ambulance'}
        </button>}
        {busy && <p>Coordination is running. Assignment controls become available after the scenario clears.</p>}
        {error && <p role="alert" className="intake-error">{error}</p>}
      </section>
    </dialog>
  </>;
}
