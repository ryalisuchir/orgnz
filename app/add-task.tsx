import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { color, space, radius, type } from '../lib/theme';
import { PrimaryButton, SectionLabel } from '../components/ui';
import { listCategories, createTask, createEvent, listClassBlocks, listEvents, suggestFromSimilarTasks, Category, Task } from '../lib/data';
import { expandBlock, timesOverlap } from '../lib/schedule';

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getNextDayOfWeek(dateStr: string, targetDay: number): string {
  // targetDay: 0=Sun, 1=Mon, ... 6=Sat
  const d = new Date(dateStr + 'T00:00:00');
  const currentDay = d.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const todayDate = todayStr();
  if (dateStr === todayDate) return 'Today';
  if (dateStr === addDays(todayDate, 1)) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const QUICK_DATES = [
  { key: 'today', label: 'Today', get: () => todayStr() },
  { key: 'tomorrow', label: 'Tomorrow', get: () => addDays(todayStr(), 1) },
  { key: 'friday', label: 'This Fri', get: () => getNextDayOfWeek(todayStr(), 5) },
  { key: 'monday', label: 'Monday', get: () => getNextDayOfWeek(todayStr(), 1) },
  { key: 'week', label: 'Next week', get: () => addDays(todayStr(), 7) },
];

type Kind = 'task' | 'event';

// Warns (doesn't block) if a new event's time overlaps a class meeting or
// another event that same day — mirrors the class_blocks conflict check.
async function findEventConflict(dateStr: string, start: string, end: string): Promise<string | null> {
  const startWithSeconds = `${start}:00`;
  const endWithSeconds = `${end}:00`;
  const day = new Date(`${dateStr}T00:00:00`);

  const [blocks, sameDayEvents] = await Promise.all([
    listClassBlocks(),
    listEvents({ from: dateStr, to: dateStr }),
  ]);

  for (const b of blocks ?? []) {
    const occurrences = expandBlock(b as any, day, day);
    for (const occ of occurrences) {
      if (timesOverlap(startWithSeconds, endWithSeconds, occ.startTime, occ.endTime)) {
        return `${occ.label ?? 'a class'} (${occ.startTime.slice(0, 5)}–${occ.endTime.slice(0, 5)})`;
      }
    }
  }

  for (const e of sameDayEvents) {
    if (!e.start_time || !e.end_time) continue;
    if (timesOverlap(startWithSeconds, endWithSeconds, e.start_time, e.end_time)) {
      return `${e.title} (${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)})`;
    }
  }
  return null;
}

function confirmConflict(conflictLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('This overlaps with something else', `Conflicts with ${conflictLabel}. Save anyway?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Save anyway', onPress: () => resolve(true) },
    ]);
  });
}

export default function AddTask() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('task');
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // task-only fields
  const [dueDate, setDueDate] = useState('');
  const [importance, setImportance] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [suggestion, setSuggestion] = useState<Task | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // event-only fields (tests, application deadlines — one-off, not recurring)
  const [eventDate, setEventDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');

  const [notes, setNotes] = useState('');

  const debouncedTitle = useDebounced(title, 350);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  // Smart input recognition: as the title settles, fuzzy-match it against
  // past task titles (pg_trgm) and offer to prefill category/importance/
  // difficulty from the closest match. Only meaningful for tasks — events
  // don't carry importance/difficulty.
  useEffect(() => {
    setSuggestionDismissed(false);
    if (kind !== 'task' || !debouncedTitle.trim()) {
      setSuggestion(null);
      return;
    }
    suggestFromSimilarTasks(debouncedTitle).then(setSuggestion);
  }, [debouncedTitle, kind]);

  const showSuggestion = suggestion && !suggestionDismissed && suggestion.title.toLowerCase() !== title.toLowerCase();

  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.category_id) setCategoryId(suggestion.category_id);
    setImportance(suggestion.importance);
    setDifficulty(suggestion.difficulty);
    setSuggestionDismissed(true);
  }

  async function save() {
    if (!title.trim()) return;
    if (kind === 'event' && !eventDate.trim()) return;
    setSaving(true);
    try {
      if (kind === 'task') {
        await createTask({
          title: title.trim(),
          category_id: categoryId,
          due_date: dueDate.trim() || null,
          importance,
          difficulty,
          notes: notes.trim() || null,
        });
      } else {
        if (startTime.trim() && endTime.trim()) {
          const conflict = await findEventConflict(eventDate.trim(), startTime.trim(), endTime.trim());
          if (conflict) {
            const proceed = await confirmConflict(conflict);
            if (!proceed) {
              setSaving(false);
              return;
            }
          }
        }
        await createEvent({
          title: title.trim(),
          category_id: categoryId,
          event_date: eventDate.trim(),
          start_time: startTime.trim() ? `${startTime.trim()}:00`: null,
          end_time: endTime.trim() ? `${endTime.trim()}:00` : null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => setKind('task')}
          style={[styles.kindChip, kind === 'task' && { backgroundColor: color.accent, borderColor: color.accent }]}
        >
          <Text style={{ color: kind === 'task' ? color.white : color.inkSoft, fontSize: 13, fontWeight: '700' }}>
            Task / assignment
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('event')}
          style={[styles.kindChip, kind === 'event' && { backgroundColor: color.accent, borderColor: color.accent }]}
        >
          <Text style={{ color: kind === 'event' ? color.white : color.inkSoft, fontSize: 13, fontWeight: '700' }}>
            Test / deadline
          </Text>
        </Pressable>
      </View>

      <SectionLabel>Title</SectionLabel>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={kind === 'task' ? 'e.g. Problem set 4, Club officer application…' : 'e.g. Midterm 2, Fellowship application due'}
        placeholderTextColor={color.inkFaint}
        autoFocus
      />

      {showSuggestion && (
        <Pressable onPress={applySuggestion} style={styles.suggestionBox}>
          <Text style={[type.caption, { color: color.accent, fontWeight: '700' }]}>SIMILAR TO A PAST TASK</Text>
          <Text style={type.bodyMedium}>{suggestion!.title}</Text>
          <Text style={type.caption}>
            Tap to prefill: {suggestion!.categories?.name ?? 'category'} · importance {suggestion!.importance} · difficulty {suggestion!.difficulty}
          </Text>
        </Pressable>
      )}

      <SectionLabel>Class / club / EC</SectionLabel>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => setCategoryId(null)}
          style={[styles.chip, categoryId === null && { backgroundColor: color.accent, borderColor: color.accent }]}
        >
          <Text style={{ color: categoryId === null ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>None</Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={[styles.chip, categoryId === c.id && { backgroundColor: c.color, borderColor: c.color }]}
          >
            <Text style={{ color: categoryId === c.id ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      {kind === 'task' ? (
        <>
          <SectionLabel>Due date — tap one or type your own</SectionLabel>
          <View style={styles.chipRow}>
            {QUICK_DATES.map((qd) => {
              const date = qd.get();
              const active = dueDate === date;
              return (
                <Pressable
                  key={qd.key}
                  onPress={() => setDueDate(active ? '' : date)}
                  style={[styles.chip, active && { backgroundColor: color.accent, borderColor: color.accent }]}
                >
                  <Text style={{ color: active ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
                    {qd.label}
                  </Text>
                  <Text style={{ color: active ? color.white + 'CC' : color.inkFaint, fontSize: 10, fontWeight: '500', marginLeft: 4 }}>
                    {formatDateLabel(date)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setDueDate('')}
              style={[styles.chip, !dueDate && { backgroundColor: color.accent, borderColor: color.accent }]}
            >
              <Text style={{ color: !dueDate ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
                No date
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.input, { marginTop: space.sm }]}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="Or type custom: YYYY-MM-DD"
            placeholderTextColor={color.inkFaint}
          />

          <SectionLabel>Importance — how much does this matter?</SectionLabel>
          <ScoreSelector value={importance} onChange={setImportance} color={color.danger} />

          <SectionLabel>Difficulty — how much focus does this need?</SectionLabel>
          <ScoreSelector value={difficulty} onChange={setDifficulty} color={color.accent} />
          <Text style={[type.caption, { marginTop: space.xs }]}>
            Tip: schedule high-difficulty tasks earlier in the day and low-difficulty/administrative ones for when
            your focus is fading — orgnz won't do this for you, but the performance tab will show you when you
            actually work best.
          </Text>
        </>
      ) : (
        <>
          <SectionLabel>Date — tap one or type your own</SectionLabel>
          <View style={styles.chipRow}>
            {QUICK_DATES.map((qd) => {
              const date = qd.get();
              const active = eventDate === date;
              return (
                <Pressable
                  key={qd.key}
                  onPress={() => setEventDate(active ? '' : date)}
                  style={[styles.chip, active && { backgroundColor: color.accent, borderColor: color.accent }]}
                >
                  <Text style={{ color: active ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
                    {qd.label}
                  </Text>
                  <Text style={{ color: active ? color.white + 'CC' : color.inkFaint, fontSize: 10, fontWeight: '500', marginLeft: 4 }}>
                    {formatDateLabel(date)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setEventDate('')}
              style={[styles.chip, !eventDate && { backgroundColor: color.accent, borderColor: color.accent }]}
            >
              <Text style={{ color: !eventDate ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
                No date
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.input, { marginTop: space.sm }]}
            value={eventDate}
            onChangeText={setEventDate}
            placeholder="Or type custom: YYYY-MM-DD"
            placeholderTextColor={color.inkFaint}
          />

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>START (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor={color.inkFaint}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>END (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="10:30"
                placeholderTextColor={color.inkFaint}
              />
            </View>
          </View>

          <SectionLabel>Location (optional)</SectionLabel>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Hall building, room 204"
            placeholderTextColor={color.inkFaint}
          />
        </>
      )}

      <SectionLabel>Notes (optional)</SectionLabel>
      <TextInput
        style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything else worth remembering"
        placeholderTextColor={color.inkFaint}
        multiline
      />

      <View style={{ marginTop: space.xl }}>
        <PrimaryButton
          title={saving ? 'Saving…' : kind === 'task' ? 'Add task' : 'Add test / deadline'}
          onPress={save}
          disabled={saving || !title.trim() || (kind === 'event' && !eventDate.trim())}
        />
      </View>
    </ScrollView>
  );
}

function ScoreSelector({ value, onChange, color: c }: { value: number; onChange: (n: number) => void; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          style={[styles.scoreDot, { borderColor: c }, n <= value && { backgroundColor: c }]}
        >
          <Text style={{ color: n <= value ? color.white : c, fontWeight: '700' }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    color: color.ink,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kindChip: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  scoreDot: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  suggestionBox: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
});
