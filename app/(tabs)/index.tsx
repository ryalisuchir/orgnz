import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Linking } from 'react-native';
import { impact } from '../../lib/haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, radius, type } from '../../lib/theme';
import { Card, DifficultyDots, ImportanceFlag, StatusPill, SectionLabel, EmptyState, PrimaryButton } from '../../components/ui';
import { FadeInView, StaggeredList, animateLayout } from '../../components/animations';
import { listTasks, listClassBlocks, listEvents, setTaskStatus, Task, Event as OrgEvent } from '../../lib/data';
import { expandBlock, ClassOccurrence } from '../../lib/schedule';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Today() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [classesToday, setClassesToday] = useState<ClassOccurrence[]>([]);
  const [eventsToday, setEventsToday] = useState<OrgEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [allTasks, blocks, events] = await Promise.all([
      listTasks(),
      listClassBlocks(),
      listEvents({ from: todayStr(), to: todayStr() }),
    ]);
    setTasks(allTasks);
    setEventsToday(events);

    const today = new Date();
    const occurrences = (blocks ?? []).flatMap((b: any) => expandBlock(b, today, today));
    occurrences.sort((a, b) => a.startTime.localeCompare(b.startTime));
    setClassesToday(occurrences);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < todayStr());
  const dueToday = tasks.filter((t) => t.status !== 'done' && t.due_date === todayStr());
  const upcoming = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date > todayStr());
  const noDate = tasks.filter((t) => t.status !== 'done' && !t.due_date);

  async function markDone(t: Task) {
    impact('medium');
    animateLayout();
    await setTaskStatus(t.id, 'done');
    load();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.accent} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={type.display}>Today</Text>
            <Text style={type.subtitle}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
            onPress={() => {
              impact('light');
              router.push('/add-task');
            }}
          >
            <Text style={{ color: color.white, fontWeight: '700', fontSize: 20, lineHeight: 20 }}>+</Text>
          </Pressable>
        </View>

        {tasks.length === 0 && !refreshing ? (
          <EmptyState
            icon="📝"
            title="No tasks yet"
            subtitle="Add your first assignment and it'll show up here and in Notion Calendar."
            action={<PrimaryButton title="Add a task" onPress={() => router.push('/add-task')} />}
          />
        ) : null}

        {tasks.length === 0 && !refreshing ? null : (
          <>
            <View style={styles.subtitleRow}>
              <Text style={type.subtitle}>Overview</Text>
              <Pressable onPress={() => router.push('/day-review')}>
                <Text style={[type.caption, { color: color.accent, fontWeight: '700' }]}>Review my day →</Text>
              </Pressable>
            </View>

            <View style={styles.statsRow}>
              <StatBox value={dueToday.length} label="Due" />
              <StatBox value={overdue.length} label="Overdue" />
              <StatBox value={upcoming.length} label="Upcoming" />
              <StatBox value={noDate.length} label="Unscheduled" />
            </View>
          </>
        )}

        {classesToday.length > 0 && (
          <>
            <SectionLabel>Classes today</SectionLabel>
            <StaggeredList>
              {classesToday.map((c, i) => (
                <View key={i} style={styles.classRow}>
                  <Text style={type.caption}>
                    {c.startTime.slice(0, 5)}–{c.endTime.slice(0, 5)}
                  </Text>
                  <Text style={[type.bodyMedium, { flex: 1, marginLeft: space.md }]}>{c.label ?? 'Class'}</Text>
                  {c.location ? <Text style={type.caption}>{c.location}</Text> : null}
                </View>
              ))}
            </StaggeredList>
          </>
        )}

        {eventsToday.length > 0 && (
          <>
            <SectionLabel>Tests &amp; deadlines today</SectionLabel>
            <View style={{ gap: space.sm }}>
              {eventsToday.map((e) => (
                <View key={e.id} style={styles.classRow}>
                  <Text style={type.caption}>{e.start_time ? e.start_time.slice(0, 5) : 'All day'}</Text>
                  <View style={{ flex: 1, marginLeft: space.md }}>
                    <Text style={type.bodyMedium}>{e.title}</Text>
                    {e.categories?.name ? <Text style={type.caption}>{e.categories.name}</Text> : null}
                  </View>
                  {e.location ? <Text style={type.caption}>{e.location}</Text> : null}
                </View>
              ))}
            </View>
          </>
        )}

        {overdue.length > 0 && <TaskSection title="Overdue" tasks={overdue} onDone={markDone} onOpen={(id) => router.push(`/task/${id}`)} />}
        <TaskSection title="Due today" tasks={dueToday} onDone={markDone} onOpen={(id) => router.push(`/task/${id}`)} emptyText="Nothing due today — nice." />
        <TaskSection title="No due date" tasks={noDate} onDone={markDone} onOpen={(id) => router.push(`/task/${id}`)} />
        <TaskSection title="Upcoming" tasks={upcoming.slice(0, 10)} onDone={markDone} onOpen={(id) => router.push(`/task/${id}`)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[type.caption, { color: color.inkFaint }]}>{label}</Text>
    </View>
  );
}

function TaskSection({
  title,
  tasks,
  onDone,
  onOpen,
  emptyText,
}: {
  title: string;
  tasks: Task[];
  onDone: (t: Task) => void;
  onOpen: (id: string) => void;
  emptyText?: string;
}) {
  if (tasks.length === 0 && !emptyText) return null;
  return (
    <FadeInView delay={100} direction="up">
      <SectionLabel>{title}</SectionLabel>
      {tasks.length === 0 ? (
        <Text style={type.caption}>{emptyText}</Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {tasks.map((t) => (
            <Pressable key={t.id} onPress={() => onOpen(t.id)}>
              <Card accentColor={t.categories?.color}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyMedium}>{t.title}</Text>
                    <Text style={type.caption}>{t.categories?.name ?? 'No class'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
                      <ImportanceFlag value={t.importance} />
                      <DifficultyDots value={t.difficulty} />
                      <StatusPill status={t.status} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: space.xs }}>
                    {t.notion_page_id ? (
                      <Pressable
                        onPress={() => {
                          impact('light');
                          Linking.openURL('https://calendar.notion.so/');
                        }}
                        style={styles.calendarButton}
                        hitSlop={8}
                      >
                        <Text style={{ fontSize: 15 }}>📅</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => onDone(t)}
                      style={styles.checkButton}
                      hitSlop={8}
                    >
                      <Text style={{ color: color.accent, fontSize: 18 }}>✓</Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.line,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  checkButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarButton: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
