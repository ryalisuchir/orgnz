import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Platform, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { color, space, radius, type } from '../../lib/theme';
import { Card, SectionLabel, StatusPill } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  listTasks,
  listClassBlocks,
  listEvents,
  listDeliverablesForCategory,
  getDeliverableSignedUrl,
  deleteEvent,
  Task,
  Event as OrgEvent,
  Deliverable,
} from '../../lib/data';
import { summarizeRRule } from '../../lib/schedule';
import { fuzzyMatchDeliverables } from '../../lib/fuzzy';

type DeliverableWithTask = Deliverable & { tasks: { title: string; due_date: string | null } };

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableWithTask[]>([]);
  const [query, setQuery] = useState('');

  async function load() {
    const { data } = await supabase.from('categories').select('name').eq('id', id).single();
    setName(data?.name ?? '');
    setBlocks((await listClassBlocks(id)) ?? []);
    setTasks(await listTasks({ categoryId: id }));
    setEvents(await listEvents({ categoryId: id }));
    setDeliverables((await listDeliverablesForCategory(id)) as any);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function removeEvent(eventId: string) {
    await deleteEvent(eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  const filtered = fuzzyMatchDeliverables(query, deliverables);

  async function openDeliverable(d: Deliverable) {
    const url = await getDeliverableSignedUrl(d.storage_path);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      await Linking.openURL(url);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space.lg }}>
      <Text style={type.display}>{name}</Text>

      {blocks.length > 0 && (
        <>
          <SectionLabel>Schedule</SectionLabel>
          <View style={{ gap: space.sm }}>
            {blocks.map((b) => (
              <View key={b.id} style={styles.blockRow}>
                <Text style={type.bodyMedium}>{summarizeRRule(b.rrule)}</Text>
                <Text style={type.caption}>
                  {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} {b.location ? `· ${b.location}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionLabel>Tests &amp; deadlines ({events.length})</SectionLabel>
      <View style={{ gap: space.sm }}>
        {events.map((e) => (
          <View key={e.id} style={styles.blockRow}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyMedium}>{e.title}</Text>
                <Text style={type.caption}>
                  {e.event_date}
                  {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ''}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert('Remove this?', e.title, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeEvent(e.id) },
                  ])
                }
                hitSlop={8}
              >
                <Text style={{ color: color.inkFaint, fontSize: 13 }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {events.length === 0 && <Text style={type.caption}>No tests or deadlines logged for this class yet.</Text>}
      </View>

      <SectionLabel>Tasks ({tasks.length})</SectionLabel>
      <View style={{ gap: space.sm }}>
        {tasks.map((t) => (
          <Pressable key={t.id} onPress={() => router.push(`/task/${t.id}`)}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={type.bodyMedium}>{t.title}</Text>
                <StatusPill status={t.status} />
              </View>
            </Card>
          </Pressable>
        ))}
        {tasks.length === 0 && <Text style={type.caption}>No tasks logged for this class yet.</Text>}
      </View>

      <SectionLabel>Find a past submission</SectionLabel>
      <Text style={[type.caption, { marginBottom: space.sm }]}>
        Fuzzy search across every deliverable you've uploaded for this class — search by assignment name or the file
        itself.
      </Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. lab report 3, midterm study guide…"
        placeholderTextColor={color.inkFaint}
      />
      <View style={{ gap: space.sm, marginTop: space.md }}>
        {filtered.map((d) => (
          <Pressable key={d.id} onPress={() => openDeliverable(d)} style={styles.deliverableRow}>
            <Text style={{ fontSize: 16 }}>📄</Text>
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Text style={type.bodyMedium} numberOfLines={1}>{d.file_name}</Text>
              <Text style={type.caption}>{d.tasks?.title}</Text>
            </View>
          </Pressable>
        ))}
        {deliverables.length === 0 && <Text style={type.caption}>Nothing uploaded yet.</Text>}
        {deliverables.length > 0 && filtered.length === 0 && <Text style={type.caption}>No matches for "{query}".</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blockRow: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
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
  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
