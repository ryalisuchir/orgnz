import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, radius, type } from '../../lib/theme';
import { Card, SectionLabel } from '../../components/ui';
import { RateBarChart, CategoryShareBar, StatTile } from '../../components/charts';
import { listTaskEvents, listCategories, TaskEvent, Category } from '../../lib/data';
import {
  completionByHour,
  completionByDayOfWeek,
  completionByDifficulty,
  completionByCategory,
  currentStreak,
  avgScheduleLagHours,
  overallCompletionRate,
} from '../../lib/analytics';

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? formatHour(h) : ''));
function formatHour(h: number) {
  const period = h < 12 ? 'a' : 'p';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

export default function Performance() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - space.lg * 2, 480);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listTaskEvents(90), listCategories()]).then(([e, c]) => {
        setEvents(e);
        setCategories(c);
        setLoaded(true);
      });
    }, [])
  );

  if (loaded && events.length < 5) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
        <View style={{ flex: 1, padding: space.lg, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: space.md }}>📊</Text>
          <Text style={type.display}>Performance</Text>
          <Text style={[type.subtitle, { marginTop: space.md, textAlign: 'center' }]}>
            Not enough data yet. Keep marking tasks done, missed, or carried over for a couple of weeks — patterns
            like your best focus hours and which classes tend to slip will show up here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const byHour = completionByHour(events);
  const byDay = completionByDayOfWeek(events);
  const byDifficulty = completionByDifficulty(events);
  const byCategory = completionByCategory(events);
  const streak = currentStreak(events);
  const lag = avgScheduleLagHours(events);
  const overall = overallCompletionRate(events);

  const bestHour = [...byHour].filter((h) => h.total >= 2).sort((a, b) => b.rate - a.rate)[0];
  const worstHour = [...byHour].filter((h) => h.total >= 2).sort((a, b) => a.rate - b.rate)[0];

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categorySlices = byCategory
    .filter((s) => s.categoryId)
    .map((s) => ({
      label: categoryMap.get(s.categoryId!)?.name ?? 'Unknown',
      count: s.count,
      color: categoryMap.get(s.categoryId!)?.color ?? color.inkFaint,
    }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}>
        <Text style={type.display}>Performance</Text>
        <Text style={type.subtitle}>Last 90 days, from your task history — no predictions, just the pattern.</Text>

        <View style={{ flexDirection: 'row', marginTop: space.xl, gap: space.md }}>
          <StatTile label="Streak" value={`${streak}d`} sub="consecutive days with a completion" />
          <StatTile label="Completion" value={`${Math.round(overall * 100)}%`} sub="of tasks finished, not missed" />
          <StatTile
            label="Sched. lag"
            value={lag === null ? '—' : `${lag > 0 ? '+' : ''}${lag.toFixed(1)}h`}
            sub="finished vs. planned"
          />
        </View>

        {bestHour && worstHour && (
          <Card style={{ marginTop: space.lg }}>
            <Text style={type.bodyMedium}>
              You finish the most at {formatHour(bestHour.hour)} ({Math.round(bestHour.rate * 100)}%), and the least
              at {formatHour(worstHour.hour)} ({Math.round(worstHour.rate * 100)}%).
            </Text>
            <Text style={[type.caption, { marginTop: space.xs }]}>
              If a slot keeps underperforming, that's a signal to protect it for something other than deep work —
              orgnz just shows you the pattern, the call is yours.
            </Text>
          </Card>
        )}

        <SectionLabel>Completion rate by hour of day</SectionLabel>
        <Card>
          <RateBarChart
            data={byHour.map((h, i) => ({ ...h, label: HOUR_LABELS[i] }))}
            labelKey="label"
            rateKey="rate"
            totalKey="total"
            width={chartWidth - space.md * 2}
          />
        </Card>

        <SectionLabel>Completion rate by day of week</SectionLabel>
        <Card>
          <RateBarChart data={byDay} labelKey="day" rateKey="rate" totalKey="total" width={chartWidth - space.md * 2} />
        </Card>

        <SectionLabel>Completion rate by difficulty</SectionLabel>
        <Card>
          <RateBarChart
            data={byDifficulty.map((d) => ({ ...d, label: `${d.difficulty}` }))}
            labelKey="label"
            rateKey="rate"
            totalKey="total"
            width={chartWidth - space.md * 2}
          />
        </Card>

        {categorySlices.length > 0 && (
          <>
            <SectionLabel>Task volume by class / club</SectionLabel>
            <Card>
              <CategoryShareBar slices={categorySlices} width={chartWidth - space.md * 2} />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({});
