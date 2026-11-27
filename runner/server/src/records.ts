/** The best time on each course, kept in a small JSON file so it outlives a restart. */
import fs from 'node:fs';
import type { CourseRecord, Records } from '../../shared/src/types.js';

function isRecord(v: unknown): v is CourseRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.color === 'string' &&
    typeof r.bot === 'boolean' &&
    typeof r.timeMs === 'number' &&
    Number.isFinite(r.timeMs) &&
    r.timeMs > 0 &&
    typeof r.at === 'number'
  );
}

/** Reads the file. A missing or damaged file just means no records yet. */
export function loadRecords(file: string): Records {
  const out: Records = {};
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof raw === 'object' && raw !== null) {
      for (const [course, rec] of Object.entries(raw)) if (isRecord(rec)) out[course] = rec;
    }
  } catch {
    /* first run, or unreadable */
  }
  return out;
}

/** Writes the file in one move, so a crash cannot leave half of it. Failing to save never stops the game. */
export function saveRecords(file: string, records: Records): void {
  try {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(records, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  } catch (err) {
    console.error(`Could not save course records to ${file}:`, err instanceof Error ? err.message : err);
  }
}
