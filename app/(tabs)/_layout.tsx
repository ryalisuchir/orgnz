import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { impact } from '../../lib/haptics';
import { color, space, radius, type } from '../../lib/theme';

const TABS = [
  { name: 'index', label: 'Today', glyph: '✦' },
  { name: 'classes', label: 'Classes', glyph: '▤' },
  { name: 'past', label: 'Past', glyph: '⏳' },
  { name: 'performance', label: 'Stats', glyph: '▲' },
  { name: 'settings', label: 'Settings', glyph: '⚙' },
];

function TabBar({ state, descriptors, navigation }: any) {
  const activeIndex = state.index;
  const indicatorAnim = useRef(new Animated.Value(activeIndex)).current;
  const [layoutWidth, setLayoutWidth] = React.useState(0);

  useEffect(() => {
    Animated.spring(indicatorAnim, {
      toValue: activeIndex,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorAnim]);

  const tabWidth = layoutWidth / TABS.length;
  const indicatorWidth = tabWidth * 0.85;
  const indicatorMargin = (tabWidth - indicatorWidth) / 2;

  return (
    <BlurView intensity={24} tint="dark" style={styles.blur}>
      <View style={styles.container} onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}>
        {layoutWidth > 0 && (
          <Animated.View
            style={[
              styles.indicator,
              {
                width: indicatorWidth,
                left: indicatorMargin,
                transform: [
                  {
                    translateX: indicatorAnim.interpolate({
                      inputRange: [0, TABS.length - 1],
                      outputRange: [0, (TABS.length - 1) * tabWidth],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        {TABS.map((tab, i) => {
          const isFocused = state.index === i;
          return (
            <Pressable
              key={tab.name}
              onPress={() => {
                impact('light');
                navigation.navigate({ name: tab.name, merge: true });
              }}
              style={styles.tab}
            >
              <Text style={[styles.glyph, isFocused && styles.glyphActive]}>{tab.glyph}</Text>
              <Text style={[styles.label, isFocused && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </BlurView>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="classes" />
      <Tabs.Screen name="past" />
      <Tabs.Screen name="performance" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blur: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: Platform.OS === 'web' ? 'rgba(13,13,12,0.72)' : undefined,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    height: Platform.OS === 'ios' ? 84 : 64,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    left: 0,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.line,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  glyph: {
    fontSize: 18,
    color: color.inkFaint,
    marginBottom: 2,
  },
  glyphActive: {
    color: color.accent,
  },
  label: {
    ...type.caption,
    fontSize: 10,
    color: color.inkFaint,
  },
  labelActive: {
    color: color.ink,
    fontWeight: '700',
  },
});
