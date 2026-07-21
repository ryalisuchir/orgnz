import React, { useCallback, useState } from 'react';
import { impact } from '../../lib/haptics';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, radius, type, category6 } from '../../lib/theme';
import { Card, PrimaryButton, SectionLabel, EmptyState } from '../../components/ui';
import { listCategories, createCategory, updateCategory, createClassBlock, Category } from '../../lib/data';
import { buildRRule, summarizeRRule, WEEKDAY_OPTIONS } from '../../lib/schedule';
import { listNotionDatabases, listNotionPages, createNotionDatabase } from '../../lib/notion';

const KINDS: { key: Category['kind']; label: string }[] = [
  { key: 'class', label: 'Class' },
  { key: 'club', label: 'Club' },
  { key: 'research', label: 'Research/EC' },
  { key: 'other', label: 'Other' },
];

export default function Classes() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [databases, setDatabases] = useState<{ id: string; title: string; url: string }[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    listCategories().then(setCategories);
    listNotionDatabases().then((res) => {
      if (res.databases) setDatabases(res.databases);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}>
        <View style={styles.headerRow}>
          <Text style={type.display}>Classes</Text>
          <Pressable style={styles.addButton} onPress={() => setShowForm((s) => !s)}>
            <Text style={{ color: color.white, fontWeight: '700', fontSize: 20, lineHeight: 20 }}>
              {showForm ? '×' : '+'}
            </Text>
          </Pressable>
        </View>
        <Text style={type.subtitle}>Classes, clubs, and research/EC groups — each customizable.</Text>

        {showForm && <NewCategoryForm databases={databases} onDone={() => { setShowForm(false); load(); }} />}

        <SectionLabel>All ({categories.length})</SectionLabel>
        <View style={{ gap: space.sm }}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                impact('light');
                router.push(`/class/${c.id}`);
              }}
            >
              <Card accentColor={c.color}>
                <Text style={type.bodyMedium}>{c.name}</Text>
                <Text style={type.caption}>{c.kind}{c.notion_database_id ? ' • synced to own Notion DB' : ''}</Text>
              </Card>
            </Pressable>
          ))}
          {categories.length === 0 && !showForm && (
            <EmptyState
              icon="📚"
              title="No classes yet"
              subtitle="Add classes, clubs, or research groups so tasks can be organized and color-coded."
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NewCategoryForm({ databases, onDone }: { databases: { id: string; title: string; url: string }[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Category['kind']>('class');
  const [colorPick, setColorPick] = useState(category6[0]);
  const [notionDbId, setNotionDbId] = useState<string | null>(null);
  const [localDatabases, setLocalDatabases] = useState(databases);
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [pages, setPages] = useState<{ id: string; title: string; url: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [dbTitle, setDbTitle] = useState('');
  const [creatingStatus, setCreatingStatus] = useState<string | null>(null);
  const [addSchedule, setAddSchedule] = useState(true);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:15');
  const [interval, setIntervalWeeks] = useState(1);
  const [saving, setSaving] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  React.useEffect(() => setLocalDatabases(databases), [databases]);

  React.useEffect(() => {
    if (isCreatingDb && pages.length === 0) {
      listNotionPages().then((res) => setPages(res.pages ?? []));
    }
    if (isCreatingDb && !dbTitle && name) {
      setDbTitle(name);
    }
  }, [isCreatingDb, name]);

  function toggleDay(code: string) {
    setSelectedDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setConflictWarning(null);
    try {
      const category = await createCategory({ name: name.trim(), kind, color: colorPick, notion_database_id: notionDbId });
      if (notionDbId) {
        // Persist the selected database on the category for future syncs.
        await updateCategory(category.id, { notion_database_id: notionDbId });
      }
      if (addSchedule && selectedDays.length > 0) {
        const { conflicts } = await createClassBlock({
          category_id: category.id,
          label: name.trim(),
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          dtstart: new Date().toISOString().slice(0, 10),
          rrule: buildRRule(selectedDays, interval),
        });
        if (conflicts.length > 0) {
          setConflictWarning(
            `Heads up: this overlaps with "${conflicts[0].label ?? 'another block'}" (${conflicts[0].start_time.slice(0, 5)}–${conflicts[0].end_time.slice(0, 5)}). Saved anyway — adjust the time if that's not intentional.`
          );
        }
      }
      setName('');
      setSelectedDays([]);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const preview = selectedDays.length ? summarizeRRule(buildRRule(selectedDays, interval)) : null;
  const timesValid = startTime < endTime;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionLabel>Name</SectionLabel>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. BME 201, ALCSI, Research Lab"
        placeholderTextColor={color.inkFaint}
      />

      <SectionLabel>Type</SectionLabel>
      <View style={styles.chipRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k.key}
            onPress={() => setKind(k.key)}
            style={[styles.chip, kind === k.key && { backgroundColor: color.accent, borderColor: color.accent }]}
          >
            <Text style={{ color: kind === k.key ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
              {k.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>Color</SectionLabel>
      <View style={styles.chipRow}>
        {category6.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColorPick(c)}
            style={[styles.swatch, { backgroundColor: c }, colorPick === c && styles.swatchActive]}
          />
        ))}
      </View>

      <SectionLabel>Notion Calendar color</SectionLabel>
      <Text style={[type.caption, { marginBottom: space.sm }]}>
        Notion Calendar gives each database its own color. Pick a separate Notion database for this class so its events appear in that color.
      </Text>
      {localDatabases.length === 0 && !isCreatingDb ? (
        <Text style={[type.caption, { color: color.inkFaint }]}>
          No Notion databases found. Connect Notion in Settings and make sure this integration can access your databases.
        </Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {localDatabases.map((db) => (
            <Pressable
              key={db.id}
              onPress={() => setNotionDbId(notionDbId === db.id ? null : db.id)}
              style={[
                styles.dbOption,
                notionDbId === db.id && { borderColor: color.accent, backgroundColor: color.accentSoft },
              ]}
            >
              <Text style={[type.body, { color: notionDbId === db.id ? color.accent : color.ink }]}>
                {notionDbId === db.id ? '✓ ' : ''}{db.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => {
          setIsCreatingDb((prev) => {
            if (prev) {
              setDbTitle('');
              setSelectedPageId('');
            }
            return !prev;
          });
        }}
        style={{ marginTop: space.sm, paddingVertical: space.sm, alignSelf: 'flex-start' }}
      >
        <Text style={[type.bodyMedium, { color: color.accent }]}>
          {isCreatingDb ? '− Cancel new database' : '+ Create new Notion database for this class'}
        </Text>
      </Pressable>

      {isCreatingDb && (
        <View
          style={{
            marginTop: space.sm,
            padding: space.md,
            backgroundColor: color.surfaceRaised,
            borderRadius: radius.md,
            gap: space.md,
          }}
        >
          <Text style={[type.caption, { color: color.inkSoft }]}>
            This creates a new Notion database under a page you choose. Notion Calendar colors are per-database, so to make events purple (or any color), open Notion Calendar, find this database in the left sidebar, and set its color there. The class color below is applied to the Category select option inside the database.
          </Text>

          <Text style={type.label}>DATABASE TITLE</Text>
          <TextInput
            style={styles.input}
            value={dbTitle}
            onChangeText={setDbTitle}
            placeholder="e.g. ECE 201 Database"
            placeholderTextColor={color.inkFaint}
          />

          <Text style={type.label}>PARENT PAGE</Text>
          <TextInput
            style={styles.input}
            value={selectedPageId}
            onChangeText={setSelectedPageId}
            placeholder="Paste a Notion page URL or ID"
            placeholderTextColor={color.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {pages.length > 0 && (
            <>
              <Text style={type.label}>OR SELECT A PAGE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: space.sm, paddingVertical: space.xs }}>
                  {pages.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedPageId(p.id)}
                      style={[
                        styles.chip,
                        selectedPageId === p.id && { backgroundColor: color.accent, borderColor: color.accent },
                      ]}
                    >
                      <Text
                        style={{
                          color: selectedPageId === p.id ? color.white : color.inkSoft,
                          fontSize: 13,
                          fontWeight: '600',
                        }}
                      >
                        {p.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          <PrimaryButton
            title={creatingStatus ?? 'Create & select database'}
            onPress={async () => {
              setCreatingStatus('Creating…');
              const res = await createNotionDatabase(selectedPageId, dbTitle.trim(), name.trim(), colorPick);
              if (res.error || !res.database) {
                Alert.alert('Could not create database', res.error ?? 'Unknown error');
                setCreatingStatus(null);
                return;
              }
              setLocalDatabases((prev) => [res.database!, ...prev]);
              setNotionDbId(res.database.id);
              setIsCreatingDb(false);
              setCreatingStatus(null);
              setDbTitle('');
              setSelectedPageId('');
            }}
            disabled={!!creatingStatus || !selectedPageId.trim() || !dbTitle.trim() || !name.trim()}
          />
        </View>
      )}

      <Pressable onPress={() => setAddSchedule((s) => !s)} style={{ marginTop: space.lg }}>
        <Text style={[type.subtitle, { color: color.accent }]}>{addSchedule ? '− Hide recurring schedule' : '+ Add recurring schedule'}</Text>
      </Pressable>

      {addSchedule && (
        <>
          <SectionLabel>Repeats on — pick the days this meets (different every day is fine, just add another block later)</SectionLabel>
          <View style={styles.chipRow}>
            {WEEKDAY_OPTIONS.map((d) => (
              <Pressable
                key={d.code}
                onPress={() => toggleDay(d.code)}
                style={[styles.dayCircle, selectedDays.includes(d.code) && { backgroundColor: color.accent, borderColor: color.accent }]}
              >
                <Text style={{ color: selectedDays.includes(d.code) ? color.white : color.ink, fontWeight: '700', fontSize: 12 }}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>START</Text>
              <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="10:00" placeholderTextColor={color.inkFaint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>END</Text>
              <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="11:15" placeholderTextColor={color.inkFaint} />
            </View>
          </View>
          {!timesValid && <Text style={[type.caption, { color: color.danger, marginTop: space.xs }]}>End time should be after start time.</Text>}

          <SectionLabel>Repeat frequency</SectionLabel>
          <View style={styles.chipRow}>
            {[1, 2].map((n) => (
              <Pressable
                key={n}
                onPress={() => setIntervalWeeks(n)}
                style={[styles.chip, interval === n && { backgroundColor: color.accent, borderColor: color.accent }]}
              >
                <Text style={{ color: interval === n ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
                  {n === 1 ? 'Every week' : 'Every other week'}
                </Text>
              </Pressable>
            ))}
          </View>
          {preview && <Text style={[type.caption, { marginTop: space.sm }]}>Preview: {preview}, {startTime}–{endTime}</Text>}
        </>
      )}

      {conflictWarning && <Text style={[type.caption, { color: color.warn, marginTop: space.md }]}>{conflictWarning}</Text>}

      <View style={{ marginTop: space.xl }}>
        <PrimaryButton
          title={saving ? 'Saving…' : 'Save class'}
          onPress={save}
          disabled={saving || !name.trim() || (addSchedule && selectedDays.length > 0 && !timesValid)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  swatch: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: color.ink },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  dbOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
});
