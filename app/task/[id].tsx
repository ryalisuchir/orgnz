import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, Linking, Switch } from 'react-native';
import { impact } from '../../lib/haptics';
import { useLocalSearchParams } from 'expo-router';
import { color, space, radius, type } from '../../lib/theme';
import { SectionLabel, StatusPill, DifficultyDots, ImportanceFlag, SecondaryButton } from '../../components/ui';
import { DeliverableUploader } from '../../components/DeliverableUploader';
import { supabase } from '../../lib/supabase';
import { listDeliverables, deleteDeliverable, updateTask, setTaskStatus, Task, Deliverable } from '../../lib/data';
import { sendTaskToNotion } from '../../lib/notion';

const STATUSES: Task['status'][] = ['not_started', 'in_progress', 'done', 'carried_over'];

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [sendingToNotion, setSendingToNotion] = useState(false);
  const [calendarLink, setCalendarLink] = useState<string | null>(null);
  const [scheduleInNotion, setScheduleInNotion] = useState(false);

  async function load() {
    const { data } = await supabase.from('tasks').select('*, categories(name, color)').eq('id', id).single();
    setTask(data as any);
    setDeliverables(await listDeliverables(id));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!task) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  async function changeStatus(status: Task['status']) {
    // setTaskStatus (not updateTask) is used here so the status change is
    // logged to task_events — this is what powers the performance dashboard.
    await setTaskStatus(task!.id, status);
    load();
  }

  async function handleSendToNotion() {
    impact('light');
    setSendingToNotion(true);
    try {
      const result = await sendTaskToNotion(task!.id, { schedule: scheduleInNotion });
      if (!result.ok) {
        Alert.alert('Notion Sync Failed', result.error ?? 'Check your Notion connection in Settings.', [{ text: 'OK' }]);
      } else {
        setCalendarLink(result.calendarDeepLink ?? 'https://calendar.notion.so/');
        Alert.alert(
          '✓ Sent to Notion',
          scheduleInNotion
            ? 'Task synced and scheduled on your Notion Calendar.'
            : 'Task synced to Notion. It will sit in the unscheduled tray until you drag it onto the calendar.',
          [{ text: 'Done' }]
        );
        load();
      }
    } catch (e: any) {
      Alert.alert('Notion Sync Failed', e?.message ?? 'Network error. Make sure you set a Notion database ID in Settings.');
    } finally {
      setSendingToNotion(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space.lg }}>
      <Text style={type.display}>{task.title}</Text>
      <Text style={type.subtitle}>{task.categories?.name ?? 'No class'}</Text>

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <ImportanceFlag value={task.importance} />
        <DifficultyDots value={task.difficulty} />
        <StatusPill status={task.status} />
      </View>

      <SectionLabel>Status</SectionLabel>
      <View style={styles.chipRow}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            onPress={() => changeStatus(s)}
            style={[styles.chip, task.status === s && { backgroundColor: color.accent, borderColor: color.accent }]}
          >
            <Text style={{ color: task.status === s ? color.white : color.inkSoft, fontSize: 13, fontWeight: '600' }}>
              {s.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      {task.notes ? (
        <>
          <SectionLabel>Notes</SectionLabel>
          <Text style={type.body}>{task.notes}</Text>
        </>
      ) : null}

      <SectionLabel>Deliverables</SectionLabel>
      <DeliverableUploader
        taskId={task.id}
        existing={deliverables}
        onUploaded={(d) => setDeliverables((prev) => [d, ...prev])}
        onDelete={async (d) => {
          await deleteDeliverable(d.id, d.storage_path);
          setDeliverables((prev) => prev.filter((x) => x.id !== d.id));
        }}
      />

      <SectionLabel>Notion</SectionLabel>
      <View style={styles.notionCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ fontSize: 20 }}>{task.notion_page_id ? '🔄' : '📤'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700', color: color.ink }]}>
            {task.notion_page_id ? 'Synced to Notion' : 'Not on Notion'}
          </Text>
          <Text style={[type.caption, { color: color.inkSoft, marginTop: 2 }]}>
            {task.notion_page_id
              ? 'Tap below to update the existing Notion page. The event color in Notion Calendar comes from the database itself, not from this app — open Notion Calendar and change the database color there.'
              : 'Send this task to Notion. It will become a page in your class database. Toggle “Schedule on Notion Calendar” if you also want it to appear on a calendar date.'}
          </Text>
        </View>
        </View>
        <View style={styles.toggleRow}>
          <Switch
            value={scheduleInNotion}
            onValueChange={setScheduleInNotion}
            trackColor={{ true: color.accent, false: color.line }}
            thumbColor={color.white}
            ios_backgroundColor={color.line}
          />
          <View style={{ flex: 1, marginLeft: space.sm }}>
            <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>Schedule on Notion Calendar</Text>
            <Text style={[type.caption, { color: color.inkSoft, marginTop: 2 }]}>
              When on, the due date is written to Notion Calendar. When off, the page stays unscheduled so you can drag it later.
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.notionActionButton,
            sendingToNotion && { opacity: 0.7 },
            pressed && !sendingToNotion && { opacity: 0.85 },
          ]}
          onPress={handleSendToNotion}
          disabled={sendingToNotion}
        >
          {sendingToNotion ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator size="small" color={color.white} />
              <Text style={styles.notionActionButtonText}>Syncing to Notion…</Text>
            </View>
          ) : (
            <Text style={styles.notionActionButtonText}>
              {task.notion_page_id ? '🔄  Update in Notion' : '📤  Send to Notion'}
            </Text>
          )}
        </Pressable>
        {task.notion_page_id ? (
          <Pressable
            style={({ pressed }) => [
              styles.notionCalendarButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              impact('light');
              Linking.openURL(calendarLink ?? 'https://calendar.notion.so/');
            }}
          >
            <Text style={[type.body, { color: color.accent, fontWeight: '700' }]}>
              📅 Open Notion Calendar
            </Text>
            <Text style={[type.caption, { color: color.inkSoft, marginTop: 2 }]}>
              This task appears in your unscheduled tray — drag it onto any time slot
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  notionCard: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.md,
    gap: space.md,
  },
  notionActionButton: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  notionActionButtonText: {
    color: color.white,
    fontSize: 15,
    fontWeight: '700',
  },
  notionCalendarButton: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.accent,
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
