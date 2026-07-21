import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { impact } from '../lib/haptics';
import { color, space, radius, type } from '../lib/theme';
import { ScaleOnPress, FadeInView, springGentle } from './animations';

export function Card({
  children,
  accentColor,
  style,
  delay,
}: {
  children: React.ReactNode;
  accentColor?: string | null;
  style?: ViewStyle;
  delay?: number;
}) {
  return (
    <FadeInView delay={delay ?? 0} direction="up">
      <View style={[styles.card, style]}>
        {accentColor ? <View style={[styles.cardAccent, { backgroundColor: accentColor }]} /> : null}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </FadeInView>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <ScaleOnPress
      onPress={() => {
        impact('light');
        onPress();
      }}
      disabled={disabled}
      scaleTo={0.97}
    >
      <View style={[styles.primaryBtn, disabled && { opacity: 0.4 }]}>
        <Text style={styles.primaryBtnText}>{title}</Text>
      </View>
    </ScaleOnPress>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <ScaleOnPress
      onPress={() => {
        impact('light');
        onPress();
      }}
      disabled={disabled}
      scaleTo={0.97}
    >
      <View style={[styles.secondaryBtn, disabled && { opacity: 0.4 }]}>
        <Text style={styles.secondaryBtnText}>{title}</Text>
      </View>
    </ScaleOnPress>
  );
}

export function Skeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <FadeInView key={i} delay={i * 80} direction="none">
          <View
            style={{
              height: 72,
              borderRadius: radius.lg,
              backgroundColor: color.surfaceRaised,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: color.ink,
                opacity: 0.06,
              }}
            />
          </View>
        </FadeInView>
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <FadeInView direction="up">
      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Text style={{ fontSize: 48, marginBottom: space.md }}>{icon}</Text>
        <Text style={[type.bodyMedium, { textAlign: 'center' }]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.caption, { textAlign: 'center', marginTop: space.xs, maxWidth: 260 }]}>{subtitle}</Text>
        ) : null}
        {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
      </View>
    </FadeInView>
  );
}

export function ImportanceFlag({ value }: { value: number }) {
  return (
    <View style={styles.badge}>
      <Text style={{ fontSize: 11, color: value >= 4 ? color.danger : color.inkSoft, fontWeight: '700' }}>
        {'!'.repeat(value)}
      </Text>
    </View>
  );
}

export function DifficultyDots({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: n <= value ? color.accent : color.lineSoft,
          }}
        />
      ))}
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  carried_over: 'Carried over',
};
const STATUS_COLOR: Record<string, string> = {
  not_started: color.inkFaint,
  in_progress: color.warn,
  done: color.success,
  carried_over: color.danger,
};

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? color.inkFaint;
  return (
    <View style={[styles.pill, { borderColor: c, backgroundColor: c + '18' }]}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '700' }}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

export function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    overflow: 'hidden',
  },
  cardAccent: { width: 4, borderRadius: 2, marginRight: space.md },
  sectionLabel: { ...type.label, marginTop: space.xl, marginBottom: space.sm, color: color.inkFaint },
  primaryBtn: {
    backgroundColor: color.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: color.white, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: color.ink, fontWeight: '700', fontSize: 14 },
  badge: { paddingHorizontal: 2 },
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
