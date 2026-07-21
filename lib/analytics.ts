import { TaskEvent } from './data';

export type HourBucket = { hour: number; completed: number; missed: number; total: number; rate: number };
export type DayBucket = { day: string; completed: number; total: number; rate: number };
export type DifficultyBucket = { difficulty: number; completed: number; total: number; rate: number };
export type CategorySlice = { categoryId: string | null; count: number };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Completion rate grouped by the hour a task was actually completed —
// this is the "am I a morning or night person" signal.
export function completionByHour(events: TaskEvent[]): HourBucket[] {
  const buckets = new Map<number, { completed: number; missed: number }>();
  for (let h = 0; h < 24; h++) buckets.set(h, { completed: 0, missed: 0 });

  events.forEach((e) => {
    const t = e.completed_time ?? (e.event_type === 'completed' ? e.event_time : null);
    if (!t) return;
    const hour = new Date(t).getHours();
    const b = buckets.get(hour)!;
    if (e.event_type === 'completed') b.completed += 1;
    if (e.event_type === 'missed' || e.event_type === 'carried_over') b.missed += 1;
  });

  return Array.from(buckets.entries()).map(([hour, v]) => {
    const total = v.completed + v.missed;
    return { hour, completed: v.completed, missed: v.missed, total, rate: total ? v.completed / total : 0 };
  });
}

// Same idea but grouped by day-of-week, using event_time (when the log
// entry was recorded) since that best reflects "when did this happen".
export function completionByDayOfWeek(events: TaskEvent[]): DayBucket[] {
  const buckets = new Map<number, { completed: number; total: number }>();
  for (let d = 0; d < 7; d++) buckets.set(d, { completed: 0, total: 0 });

  events
    .filter((e) => ['completed', 'missed', 'carried_over'].includes(e.event_type))
    .forEach((e) => {
      const day = new Date(e.event_time).getDay();
      const b = buckets.get(day)!;
      b.total += 1;
      if (e.event_type === 'completed') b.completed += 1;
    });

  return Array.from(buckets.entries()).map(([day, v]) => ({
    day: DAY_NAMES[day],
    completed: v.completed,
    total: v.total,
    rate: v.total ? v.completed / v.total : 0,
  }));
}

// Completion rate grouped by difficulty tag (1-5) — do hard tasks really
// get finished less often, or does the data say otherwise?
export function completionByDifficulty(events: TaskEvent[]): DifficultyBucket[] {
  const buckets = new Map<number, { completed: number; total: number }>();
  for (let d = 1; d <= 5; d++) buckets.set(d, { completed: 0, total: 0 });

  events
    .filter((e) => e.difficulty && ['completed', 'missed', 'carried_over'].includes(e.event_type))
    .forEach((e) => {
      const b = buckets.get(e.difficulty!)!;
      b.total += 1;
      if (e.event_type === 'completed') b.completed += 1;
    });

  return Array.from(buckets.entries()).map(([difficulty, v]) => ({
    difficulty,
    completed: v.completed,
    total: v.total,
    rate: v.total ? v.completed / v.total : 0,
  }));
}

// Completion rate grouped by category — which classes/clubs actually get
// their tasks finished vs. quietly pile up.
export function completionByCategory(events: TaskEvent[]): (CategorySlice & { completed: number; rate: number })[] {
  const buckets = new Map<string | null, { completed: number; total: number }>();
  events
    .filter((e) => ['completed', 'missed', 'carried_over'].includes(e.event_type))
    .forEach((e) => {
      const key = e.category_id ?? null;
      const b = buckets.get(key) ?? { completed: 0, total: 0 };
      b.total += 1;
      if (e.event_type === 'completed') b.completed += 1;
      buckets.set(key, b);
    });
  return Array.from(buckets.entries()).map(([categoryId, v]) => ({
    categoryId,
    count: v.total,
    completed: v.completed,
    rate: v.total ? v.completed / v.total : 0,
  }));
}

// How many days in a row (up to today) had at least one completed task.
export function currentStreak(events: TaskEvent[]): number {
  const completedDates = new Set(
    events.filter((e) => e.event_type === 'completed').map((e) => new Date(e.event_time).toDateString())
  );
  let streak = 0;
  const cursor = new Date();
  while (completedDates.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Average lag (in hours) between when a task was scheduled and when it was
// actually completed — positive means "later than planned".
export function avgScheduleLagHours(events: TaskEvent[]): number | null {
  const lags = events
    .filter((e) => e.scheduled_time && e.completed_time)
    .map((e) => (new Date(e.completed_time!).getTime() - new Date(e.scheduled_time!).getTime()) / 3600000);
  if (!lags.length) return null;
  return lags.reduce((a, b) => a + b, 0) / lags.length;
}

export function overallCompletionRate(events: TaskEvent[]): number {
  const terminal = events.filter((e) => ['completed', 'missed', 'carried_over'].includes(e.event_type));
  if (!terminal.length) return 0;
  const done = terminal.filter((e) => e.event_type === 'completed').length;
  return done / terminal.length;
}
