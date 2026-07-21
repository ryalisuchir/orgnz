// components/animations.tsx
// Apple-level animation primitives using only React Native's built-in
// Animated API (no Reanimated dependency). All spring-based for that
// characteristic Apple fluidity.

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  ViewStyle,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Spring configs (tuned for Apple-like feel) ---------------------------

export const springGentle = {
  // Subtle scale bounce — for button presses and card hovers
  tension: 300,
  friction: 20,
  useNativeDriver: true,
};

export const springBouncy = {
  // More pronounced bounce — for entrance animations
  tension: 200,
  friction: 15,
  useNativeDriver: true,
};

export const springSnappy = {
  // Quick, crisp response — for toggles and switches
  tension: 400,
  friction: 25,
  useNativeDriver: true,
};

// ---- Layout animation preset (Apple-style smooth reordering) --------------

export function animateLayout() {
  LayoutAnimation.configureNext({
    duration: 350,
    create: {
      type: LayoutAnimation.Types.spring,
      property: LayoutAnimation.Properties.scaleXY,
      springDamping: 0.8,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.8,
    },
    delete: {
      type: LayoutAnimation.Types.spring,
      property: LayoutAnimation.Properties.scaleXY,
      springDamping: 0.8,
    },
  });
}

// ---- FadeInView — slides up + fades in on mount ---------------------------

export function FadeInView({
  children,
  delay = 0,
  style,
  direction = 'up', // 'up' | 'left' | 'none'
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
  direction?: 'up' | 'left' | 'none';
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(direction === 'none' ? 0 : 12)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.spring(opacity, { toValue: 1, ...springBouncy }),
      Animated.spring(translate, { toValue: 0, ...springBouncy }),
      Animated.spring(scale, { toValue: 1, ...springBouncy }),
    ]);
    if (delay > 0) {
      Animated.sequence([Animated.delay(delay), animation]).start();
    } else {
      animation.start();
    }
  }, []);

  const transform: any[] = [{ scale }];
  if (direction !== 'none') {
    transform.push({ translateY: translate });
  }

  return (
    <Animated.View style={[{ opacity, transform }, style]}>
      {children}
    </Animated.View>
  );
}

// ---- ScaleOnPress — wraps Pressable with spring scale + opacity -----------

export function ScaleOnPress({
  children,
  onPress,
  style,
  scaleTo = 0.96,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ((pressed: boolean) => ViewStyle);
  scaleTo?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleTo,
      ...springGentle,
    }).start();
  }, [scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      ...springGentle,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={({ pressed }) => {
        const baseStyle = typeof style === 'function' ? style(pressed) : style;
        return baseStyle as ViewStyle;
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ---- StaggeredList — animates children in sequence ------------------------

export function StaggeredList({
  children,
  staggerMs = 60,
}: {
  children: React.ReactNode[];
  staggerMs?: number;
}) {
  return (
    <>
      {React.Children.map(children, (child, i) => (
        <FadeInView key={i} delay={i * staggerMs} direction="up">
          {child}
        </FadeInView>
      ))}
    </>
  );
}

// ---- Pulse — subtle attention-drawing animation ---------------------------

export function Pulse({
  children,
  active = true,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.03,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      {children}
    </Animated.View>
  );
}
