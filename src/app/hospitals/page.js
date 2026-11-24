'use client';

import { useState } from 'react';
import OperationsHeader from '../../../components/OperationsHeader';

const fields = [
  ['hospital', 'Hospital or dispatch center', 100],
  ['vehicleId', 'Ambulance ID', 32],
  ['crew', 'Crew call sign', 60],
  ['incident', 'Incident category', 80],
  ['pickup', 'Pickup location', 100],
  ['destination', 'Receiving facility', 100],
];

export default function HospitalsPage() {
  const [hospital, setHospital] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReceipt(result.departure);
      form.reset();
    } catch (issue) {
      setError(issue.message || 'The departure could not be registered.');
    } finally {
      setPending(false);
    }
  }

  return <main className="operations">
    <OperationsHeader active="/hospitals"/>
    <section className="hospital-portal">
      <header><h1>Hospital departures</h1>
        <p>Report each ambulance as it leaves. SEMTOS uses your urgency assessment to rank it in the shared queue.</p></header>
      {receipt && <section className="advisory" role="status">
        <strong>{receipt.vehicleId} added to the coordination queue</strong>
        <p>{receipt.hospital} · Reference {receipt.id.slice(0, 8)}</p>
      </section>}
      <form className="hospital-form" onSubmit={submit}>
        <div className="hospital-fields">
          {fields.map(([name, label, max]) => <label className="field" key={name}>{label}
            <input name={name} required maxLength={max} {...(name === 'hospital' ? {value:hospital, onChange:e=>setHospital(e.target.value)} : {})}/>
          </label>)}
          <label className="field">Dispatcher-assessed urgency
            <select name="urgency" required defaultValue=""><option value="" disabled>Select urgency</option>
              <option value="critical">Critical</option><option value="urgent">Urgent</option><option value="routine">Routine</option></select>
          </label>
        </div>
        <p className="hospital-note">Use operational details only. Leave out patient names and identifying information.</p>
        {error && <p className="intake-error" role="alert">{error}</p>}
        <button type="submit" className="primary-action" disabled={pending}>{pending ? 'Reporting…' : 'Report departure'}</button>
      </form>
    </section>
  </main>;
}
