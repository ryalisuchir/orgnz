import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { impact } from '../../lib/haptics';
import { color, space, radius, type } from '../../lib/theme';
import { Card, SectionLabel, StatusPill, DifficultyDots, ImportanceFlag, EmptyState } from '../../components/ui';
import {
  listTasks,
  listAllDeliverables,
  getDeliverableSignedUrl,
  Task,
  DeliverableWithTask,
} from '../../lib/data';
import { fuzzyMatch } from '../../lib/fuzzy';

type PastItem = Task & { deliverables: DeliverableWithTask[] };

type Filter = 'all' | 'done' | 'not_done' | 'deliverables';

function buildItems(tasks: Task[], deliverables: DeliverableWithTask[]): PastItem[] {
  const byTask: Record<string, DeliverableWithTask[]> = {};
  for (const d of deliverables) {
    if (d.task_id) {
      byTask[d.task_id] = byTask[d.task_id] ?? [];
      byTask[d.task_id].push(d);
    }
  }
  return tasks.map((t) => ({ ...t, deliverables: byTask[t.id] ?? [] }));
}

function searchFields(item: PastItem): string[] {
  return [
    item.title,
    item.notes ?? '',
    item.categories?.name ?? '',
    ...item.deliverables.map((d) => d.file_name),
  ];
}

async function openDeliverableFile(d: DeliverableWithTask) {
  try {
    const url = await getDeliverableSignedUrl(d.storage_path);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      await Linking.openURL(url);
    }
  } catch (e: any) {
    Alert.alert('Could not open file', e?.message ?? 'Could not open file');
  }
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
  { key: 'not_done', label: 'Not done' },
  { key: 'deliverables', label: 'Has files' },
];

export default function Past() {
  const router = useRouter();
  const [items, setItems] = useState<PastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, deliverables] = await Promise.all([listTasks(), listAllDeliverables()]);
      // Sort by due date descending so the most recent work is on top.
      tasks.sort((a, b) => {
        if (a.due_date && b.due_date) return b.due_date.localeCompare(a.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
      });
      setItems(buildItems(tasks, deliverables));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  let filtered = fuzzyMatch(query, items, searchFields);
  if (filter === 'done') filtered = filtered.filter((i) => i.status === 'done');
  if (filter === 'not_done') filtered = filtered.filter((i) => i.status !== 'done');
  if (filter === 'deliverables') filtered = filtered.filter((i) => i.deliverables.length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}
          ListHeaderComponent={
            <View>
              <View style={styles.headerRow}>
                <Text style={type.display}>Past</Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>{filtered.length} item(s)</Text>
              </View>
              <Text style={type.subtitle}>Search every assignment and deliverable.</Text>

              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="e.g. lab report, essay, screenshot…"
                placeholderTextColor={color.inkFaint}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
              >
                {FILTERS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.filterChip, filter === f.key && { backgroundColor: color.accent, borderColor: color.accent }]}
                  >
                    <Text
                      style={{
                        color: filter === f.key ? color.white : color.inkSoft,
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                impact('light');
                router.push(`/task/${item.id}`);
              }}
            >
              <Card accentColor={item.categories?.color} style={{ marginBottom: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyMedium}>{item.title}</Text>
                    <Text style={type.caption}>
                      {item.categories?.name ?? 'No class'}
                      {item.due_date ? ` · ${formatDueDate(item.due_date)}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                      <ImportanceFlag value={item.importance} />
                      <DifficultyDots value={item.difficulty} />
                      <StatusPill status={item.status} />
                    </View>
                  </View>
                </View>

                {item.deliverables.length > 0 && (
                  <>
                    <View style={styles.divider} />
                    <Text style={[type.label, { marginBottom: space.xs }]}>DELIVERABLES</Text>
                    {item.deliverables.map((d) => (
                      <Pressable
                        key={d.id}
                        onPress={(e) => {
                          e.stopPropagation();
                          impact('light');
                          openDeliverableFile(d);
                        }}
                        style={styles.fileRow}
                      >
                        <Text style={{ fontSize: 16 }}>📄</Text>
                        <Text style={[type.body, { flex: 1, marginLeft: space.sm }]} numberOfLines={1}>
                          {d.file_name}
                        </Text>
                        <Text style={[type.caption, { color: color.accent, fontWeight: '700' }]}>View</Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={color.accent} style={{ marginTop: space.xl }} />
            ) : (
              <EmptyState
                icon="📚"
                title="No past assignments"
                subtitle={query ? 'Try a different search term.' : 'Completed and past tasks will show up here.'}
              />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function formatDueDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
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
    marginTop: space.md,
  },
  filterChip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  divider: {
    height: 1,
    backgroundColor: color.line,
    marginVertical: space.md,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.xs,
  },
});
