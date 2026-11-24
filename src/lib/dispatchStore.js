import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const urgencyRank = { routine: 1, urgent: 2, critical: 3 };
let database;

function getDatabase() {
  if (!database) {
    const directory = join(process.cwd(), 'data');
    mkdirSync(directory, { recursive: true });
    database = new DatabaseSync(join(directory, 'dispatch.sqlite'));
    database.exec(`
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS dispatch_runs (
        id TEXT PRIMARY KEY, case_id INTEGER NOT NULL, created_at TEXT NOT NULL, units TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hospital_departures (
        id TEXT PRIMARY KEY, hospital TEXT NOT NULL, vehicle_id TEXT NOT NULL, urgency INTEGER NOT NULL,
        reported_at TEXT NOT NULL, details TEXT NOT NULL, run_id TEXT, closed_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS active_hospital_vehicle
      ON hospital_departures (hospital COLLATE NOCASE, vehicle_id COLLATE NOCASE) WHERE closed_at IS NULL;
    `);
  }
  return database;
}

export class QueueConflict extends Error {}

export function reportDeparture(input) {
  const unit = {};
  const limits = { hospital: 100, vehicleId: 32, crew: 60, incident: 80, pickup: 100, destination: 100 };
  for (const [key, limit] of Object.entries(limits)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!value || value.length > limit) throw new TypeError('Complete each field within its character limit.');
    unit[key] = value;
  }
  if (!Object.hasOwn(urgencyRank, input.urgency)) throw new TypeError('Select a dispatch urgency.');
  unit.urgency = input.urgency;
  const db = getDatabase();
  const id = randomUUID();
  const reportedAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO hospital_departures (id, hospital, vehicle_id, urgency, reported_at, details)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `).run(id, unit.hospital, unit.vehicleId, urgencyRank[unit.urgency], reportedAt, JSON.stringify(unit));
  if (!result.changes) throw new QueueConflict('This hospital already has an open departure for that ambulance.');
  return { id, reportedAt, hospital: unit.hospital, vehicleId: unit.vehicleId };
}

export function coordinationQueue() {
  const db = getDatabase();
  const assigned = db.prepare('SELECT run_id FROM hospital_departures WHERE run_id IS NOT NULL AND closed_at IS NULL LIMIT 1').get();
  const waiting = db.prepare(`
    SELECT id, reported_at AS reportedAt, details FROM hospital_departures WHERE run_id IS NULL AND closed_at IS NULL
    ORDER BY urgency DESC, rowid
  `).all().map(({ id, reportedAt, details }) => {
    const { hospital, vehicleId, urgency, pickup, destination } = JSON.parse(details);
    return { id, reportedAt, hospital, vehicleId, urgency, pickup, destination };
  });
  return { waiting, assigned: assigned ? getDispatch(assigned.run_id) : null };
}

export function assignNext(caseId, expectedIds) {
  if (![1, 3].includes(caseId) || !Array.isArray(expectedIds)) throw new TypeError('Choose a coordination scenario.');
  const db = getDatabase();
  const id = randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const queue = coordinationQueue();
    if (queue.assigned) throw new QueueConflict('Finish the current coordination run first.');
    const count = caseId === 3 ? 2 : 1;
    const units = queue.waiting.slice(0, count);
    if (units.length !== count || expectedIds.length !== count || units.some((unit, i) => unit.id !== expectedIds[i])) {
      throw new QueueConflict('The queue changed. Review the latest departures before assigning routes.');
    }
    db.prepare('INSERT INTO dispatch_runs VALUES (?, ?, ?, ?)').run(id, caseId, new Date().toISOString(), JSON.stringify(units));
    const assign = db.prepare('UPDATE hospital_departures SET run_id = ? WHERE id = ?');
    units.forEach(unit => assign.run(id, unit.id));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getDispatch(id);
}

export function closeAssignment(id) {
  const result = getDatabase().prepare('UPDATE hospital_departures SET closed_at = ? WHERE run_id = ? AND closed_at IS NULL')
    .run(new Date().toISOString(), id ?? '');
  if (!result.changes) throw new QueueConflict('This assignment is no longer open.');
}

export function getOpenDispatch(id) {
  if (typeof id !== 'string') return null;
  const open = getDatabase().prepare('SELECT 1 FROM hospital_departures WHERE run_id = ? AND closed_at IS NULL LIMIT 1').get(id);
  return open ? getDispatch(id) : null;
}

export function getDispatch(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const entry = getDatabase().prepare('SELECT * FROM dispatch_runs WHERE id = ?').get(id);
  if (!entry) return null;
  const units = JSON.parse(entry.units).map(({ vehicleId, urgency, hospital }) => ({ vehicleId, urgency, hospital }));
  return { id, caseId: entry.case_id, createdAt: entry.created_at, units };
}
