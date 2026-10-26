import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initEngine } from '../audio/engine';
import { AddToPlaylistSheet, Toast, TrackMenuSheet } from '../components/Sheets';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useHydrated() {
  const stores = [useSettings, useLibrary, usePlayer] as const;
  const [ready, setReady] = useState(() => stores.every((s) => s.persist.hasHydrated()));
  useEffect(() => {
    if (ready) return;
    const check = () => stores.every((s) => s.persist.hasHydrated()) && setReady(true);
    const unsubs = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return ready;
}

export default function RootLayout() {
  const t = useTheme();
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    initEngine()
      .catch(() => {})
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, [hydrated]);

  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme : DefaultTheme).colors,
      background: t.bg,
      card: t.bg,
      text: t.text,
      primary: t.accent,
      border: t.border,
    },
  };

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: '#121212' }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="lyrics" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="karaoke-session" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-track" options={{ presentation: 'modal' }} />
        </Stack>
        <TrackMenuSheet />
        <AddToPlaylistSheet />
        <Toast />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
