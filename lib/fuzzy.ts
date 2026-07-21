// Simple client-side fuzzy filter over an already-loaded list, so the
// class-detail search box feels instant without a round trip per keystroke.
// For larger histories, swap this for the fuzzy_match_deliverables RPC
// (migration 0003_fuzzy_search.sql) which uses the pg_trgm index server-side.

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Subsequence-based score: rewards contiguous matches and matches near the
// start of the string, tolerant of typos/partial words like "lab rpt".
function score(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q) return 0;
  if (t.includes(q)) return 100 - Math.max(0, t.indexOf(q));

  let qi = 0;
  let run = 0;
  let best = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  const matchedAll = qi === q.length;
  return matchedAll ? best * 3 : 0;
}

export function fuzzyMatchDeliverables<T extends { file_name: string; tasks?: { title: string } | null }>(
  query: string,
  items: T[]
): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({
      item,
      s: Math.max(score(query, item.file_name), score(query, item.tasks?.title ?? '')),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}

// Generic fuzzy filter over any list. `getFields` returns one or more strings
// to score against for each item. Useful for searching past tasks + deliverables.
export function fuzzyMatch<T>(
  query: string,
  items: T[],
  getFields: (item: T) => (string | null | undefined)[]
): T[] {
  if (!query.trim()) return items;
  const q = normalize(query);
  return items
    .map((item) => {
      const fields = getFields(item).filter((f): f is string => !!f);
      const s = Math.max(...fields.map((f) => score(q, f)), 0);
      return { item, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}
