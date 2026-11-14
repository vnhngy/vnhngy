import { useColorScheme } from 'react-native';
import { useSettings } from '../store/settings';

export const ACCENTS = {
  gruen: { name: 'Grün', color: '#1ED760' },
  violett: { name: 'Violett', color: '#A66CFF' },
  pink: { name: 'Pink', color: '#FF4F9A' },
  blau: { name: 'Blau', color: '#3D9BFF' },
  orange: { name: 'Orange', color: '#FF8A3D' },
  gelb: { name: 'Gelb', color: '#F5C518' },
} as const;

export type AccentKey = keyof typeof ACCENTS;

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  elevated: string;
  text: string;
  textDim: string;
  textMuted: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
}

const dark = {
  dark: true,
  bg: '#121212',
  surface: '#1C1C1C',
  surfaceAlt: '#262626',
  elevated: '#2E2E2E',
  text: '#FFFFFF',
  textDim: '#B3B3B3',
  textMuted: '#7A7A7A',
  border: '#333333',
  danger: '#FF5A5F',
};

const light = {
  dark: false,
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEFEF',
  elevated: '#E6E6E6',
  text: '#111111',
  textDim: '#555555',
  textMuted: '#8A8A8A',
  border: '#DDDDDD',
  danger: '#D93036',
};

export function useTheme(): Theme {
  const system = useColorScheme();
  const mode = useSettings((s) => s.themeMode);
  const accentKey = useSettings((s) => s.accent);
  const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';
  const accent = ACCENTS[accentKey]?.color ?? ACCENTS.gruen.color;
  return { ...(isDark ? dark : light), accent, onAccent: '#000000' };
}
