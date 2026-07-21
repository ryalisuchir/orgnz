import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { color, space, radius, type } from '../lib/theme';
import { Card, SectionLabel, PrimaryButton, DifficultyDots, ImportanceFlag } from '../components/ui';
import { listTasks, carryOverUnfinished, Task } from '../lib/data';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayReview() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [carrying, setCarrying] = useState(false);

  useEffect(() => {
    listTasks().then((all) => setTasks(all.filter((t) => t.due_date === todayStr())));
  }, []);

  const completed = tasks.filter((t) => t.status === 'done');
  const inProgress = tasks.filter((t) => t.status === 'in_progress');
  const skipped = tasks.filter((t) => t.status === 'not_started' || t.status === 'carried_over');
  const rate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  async function carryOverAll() {
    setCarrying(true);
    try {
      const count = await carryOverUnfinished(todayStr());
      Alert.alert('Carried over', `${count} task${count === 1 ? '' : 's'} moved to tomorrow.`);
      router.back();
    } finally {
      setCarrying(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}>
      <Text style={type.display}>Today's review</Text>
      <Text style={type.subtitle}>
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {rate}%
        completed
      </Text>

      <TaskGroup title={`Done (${completed.length})`} tasks={completed} />
      <TaskGroup title={`In progress (${inProgress.length})`} tasks={inProgress} />
      <TaskGroup title={`Not started / carried over (${skipped.length})`} tasks={skipped} />

      {skipped.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <PrimaryButton
            title={carrying ? 'Carrying over…' : `Carry ${skipped.length} unfinished to tomorrow`}
            onPress={carryOverAll}
            disabled={carrying}
          />
        </View>
      )}
    </ScrollView>
  );
}

function TaskGroup({ title, tasks }: { title: string; tasks: Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      <View style={{ gap: space.sm }}>
        {tasks.map((t) => (
          <Card key={t.id} accentColor={t.categories?.color}>
            <Text style={type.bodyMedium}>{t.title}</Text>
            <Text style={type.caption}>{t.categories?.name ?? 'No class'}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <ImportanceFlag value={t.importance} />
              <DifficultyDots value={t.difficulty} />
            </View>
          </Card>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({});
