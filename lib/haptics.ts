import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const STYLE_MAP: Record<string, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
};

export async function impact(style: keyof typeof STYLE_MAP = 'light') {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(STYLE_MAP[style]);
  } catch {
    // ignore unsupported devices/web
  }
}
