import { Platform } from 'react-native';

export const color = {
  bg: '#0D0D0C',
  surface: '#191918',
  surfaceRaised: '#212120',
  line: '#2E2E2C',
  lineSoft: '#242422',
  ink: '#EDEDEC',
  inkSoft: '#A09F9A',
  inkFaint: '#6B6A66',
  accent: '#8B7FFF',
  accentSoft: '#8B7FFF16',
  accentMuted: '#8B7FFF10',
  white: '#FFFFFF',
  danger: '#EF4444',
  dangerSoft: '#EF444416',
  success: '#4ADE80',
  successSoft: '#4ADE8016',
  warn: '#F59E0B',
  warnSoft: '#F59E0B16',
};

// 6-color palette offered when creating a category
export const category6 = ['#8B7FFF', '#4ADE80', '#F59E0B', '#EF4444', '#3B82F6', '#C084FC'];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });

export const type = {
  display: { fontFamily, fontSize: 30, fontWeight: '700' as const, color: color.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily, fontSize: 15, fontWeight: '500' as const, color: color.inkSoft, marginTop: 2 },
  bodyMedium: { fontFamily, fontSize: 15, fontWeight: '600' as const, color: color.ink },
  body: { fontFamily, fontSize: 15, fontWeight: '400' as const, color: color.ink, lineHeight: 21 },
  caption: { fontFamily, fontSize: 12.5, fontWeight: '500' as const, color: color.inkFaint },
  label: { fontFamily, fontSize: 11, fontWeight: '700' as const, color: color.inkFaint, letterSpacing: 0.6 },
};
