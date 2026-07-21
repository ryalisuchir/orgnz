import { RRule } from 'rrule';

export const WEEKDAY_OPTIONS = [
  { code: 'MO', label: 'M', rrule: RRule.MO },
  { code: 'TU', label: 'T', rrule: RRule.TU },
  { code: 'WE', label: 'W', rrule: RRule.WE },
  { code: 'TH', label: 'Th', rrule: RRule.TH },
  { code: 'FR', label: 'F', rrule: RRule.FR },
  { code: 'SA', label: 'Sa', rrule: RRule.SA },
  { code: 'SU', label: 'Su', rrule: RRule.SU },
];

export function buildRRule(dayCodes: string[], intervalWeeks: number): string {
  const byday = dayCodes.join(',');
  return `FREQ=WEEKLY;INTERVAL=${intervalWeeks};BYDAY=${byday}`;
}

export function summarizeRRule(rruleStr: string): string {
  try {
    const rule = RRule.fromString(`RRULE:${rruleStr}`);
    return rule.toText();
  } catch {
    return rruleStr;
  }
}

export type ClassOccurrence = {
  blockId: string;
  date: string; // yyyy-mm-dd
  startTime: string;
  endTime: string;
  label: string | null;
  location: string | null;
  cancelled: boolean;
};

type Block = {
  id: string;
  label: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  dtstart: string;
  rrule: string;
  class_block_exceptions?: {
    exception_date: string;
    is_cancelled: boolean;
    override_start_time: string | null;
    override_end_time: string | null;
    override_location: string | null;
  }[];
};

// Expands a recurring class_block into concrete occurrences between
// rangeStart and rangeEnd (inclusive), applying any one-off exceptions
// (cancellations, prof reschedules) that fall on those dates.
export function expandBlock(block: Block, rangeStart: Date, rangeEnd: Date): ClassOccurrence[] {
  const rule = RRule.fromString(`DTSTART:${toICalDate(block.dtstart)}\nRRULE:${block.rrule}`);
  const dates = rule.between(startOfDay(rangeStart), endOfDay(rangeEnd), true);
  const exceptionsByDate = new Map((block.class_block_exceptions ?? []).map((e) => [e.exception_date, e]));

  return dates
    .map((d) => {
      const dateStr = toDateStr(d);
      const exception = exceptionsByDate.get(dateStr);
      if (exception?.is_cancelled) return null;
      return {
        blockId: block.id,
        date: dateStr,
        startTime: exception?.override_start_time ?? block.start_time,
        endTime: exception?.override_end_time ?? block.end_time,
        label: block.label,
        location: exception?.override_location ?? block.location,
        cancelled: false,
      };
    })
    .filter((x): x is ClassOccurrence => x !== null);
}

// Two blocks conflict if their [start,end) time-of-day ranges overlap,
// used client-side for an immediate check while the create-class form is
// still open (the overlapping_blocks() SQL function does the same check
// server-side as a safety net).
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function toICalDate(isoDate: string): string {
  return isoDate.replace(/-/g, '') + 'T000000';
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// rrule.js always does its internal occurrence math using UTC calendar
// fields (regardless of the DTSTART 'Z' suffix), so the range boundaries
// passed to rule.between() must be built the same way — from the *local*
// calendar date's Y/M/D, reinterpreted as UTC — rather than from local
// wall-clock midnight, which drifts onto the wrong UTC day for any user
// not exactly on UTC. Verified across America/Los_Angeles, Asia/Kolkata,
// and Pacific/Kiritimati.
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
}
function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
}
