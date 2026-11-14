import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeekBar } from '../components/SeekBar';
import { Chip, Header, ListItem, Screen, Txt } from '../components/ui';
import { confirm } from '../lib/actions';
import { formatBytes, storageUsage } from '../lib/files';
import { ACCENTS, useTheme, type AccentKey } from '../lib/theme';
import { useLibrary } from '../store/library';
import { useSettings, type ThemeMode } from '../store/settings';
import { toast } from '../store/ui';

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const clearHistory = useLibrary((x) => x.clearHistory);
  const downloads = useLibrary((x) => Object.keys(x.downloads).length);
  const usage = useMemo(() => {
    try {
      return storageUsage();
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloads]);

  const toggle = (label: string, sub: string, value: boolean, key: keyof typeof s, icon: keyof typeof Ionicons.glyphMap) => (
    <ListItem
      icon={icon}
      title={label}
      subtitle={sub}
      right={<Switch value={value} onValueChange={(v) => s.set({ [key]: v })} trackColor={{ true: t.accent }} />}
    />
  );

  return (
    <Screen>
      <Header title="Einstellungen" back />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Section title="Darstellung" />
        <View style={styles.chips}>
          {(
            [
              ['system', 'System'],
              ['dark', 'Dunkel'],
              ['light', 'Hell'],
            ] as [ThemeMode, string][]
          ).map(([k, label]) => (
            <Chip key={k} label={label} active={s.themeMode === k} onPress={() => s.set({ themeMode: k })} />
          ))}
        </View>
        <Txt dim size={13} style={styles.label}>
          Akzentfarbe
        </Txt>
        <View style={styles.colors}>
          {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
            <Pressable key={k} onPress={() => s.set({ accent: k })} accessibilityLabel={ACCENTS[k].name}>
              <View style={[styles.swatch, { backgroundColor: ACCENTS[k].color, borderColor: s.accent === k ? t.text : 'transparent' }]}>
                {s.accent === k ? <Ionicons name="checkmark" size={18} color="#000" /> : null}
              </View>
            </Pressable>
          ))}
        </View>

        <Section title="Wiedergabe" />
        <View style={styles.block}>
          <Txt>Überblenden: {s.crossfade ? `${s.crossfade} s` : 'aus'}</Txt>
          <Txt dim size={13} style={{ marginTop: 2 }}>
            Songs gehen fließend ineinander über.
          </Txt>
          <SeekBar value={s.crossfade} max={12} onSeek={(v) => s.set({ crossfade: Math.round(v) })} showTimes={false} />
        </View>
        {toggle('Autoplay', 'Wenn die Warteschlange endet, laufen ähnliche Songs weiter.', s.autoplay, 'autoplay', 'infinite-outline')}
        {toggle('Sanfter Start', 'Jeder Song wird kurz eingeblendet.', s.smoothStart, 'smoothStart', 'trending-up-outline')}
        {toggle('Songtext im Player', 'Zeigt die Songtext-Vorschau unter den Steuerelementen.', s.showLyricsInPlayer, 'showLyricsInPlayer', 'text-outline')}
        {toggle('Haptisches Feedback', 'Leichte Vibration bei Tipp-Aktionen.', s.haptics, 'haptics', 'phone-portrait-outline')}

        <Section title="Offline & Speicher" />
        {toggle('Offline-Modus', 'Nur heruntergeladene und importierte Musik verwenden – spart mobile Daten.', s.offlineMode, 'offlineMode', 'cloud-offline-outline')}
        {usage ? (
          <View style={styles.block}>
            <Txt>Downloads: {formatBytes(usage.downloads)}</Txt>
            <Txt>Importierte Musik: {formatBytes(usage.music)}</Txt>
            <Txt>Karaoke-Aufnahmen: {formatBytes(usage.recordings)}</Txt>
          </View>
        ) : null}

        <Section title="Karaoke" />
        <View style={styles.block}>
          <Txt>Countdown: {s.karaokeCountdown} s</Txt>
          <SeekBar value={s.karaokeCountdown} max={10} onSeek={(v) => s.set({ karaokeCountdown: Math.max(1, Math.round(v)) })} showTimes={false} />
          <Txt style={{ marginTop: 8 }}>Mikrofon-Empfindlichkeit: {s.karaokeSensitivity} dB über Raumlautstärke</Txt>
          <Txt dim size={13}>
            Niedriger = leiser Gesang zählt schon. Höher = robuster in lauter Umgebung.
          </Txt>
          <SeekBar value={s.karaokeSensitivity} max={25} onSeek={(v) => s.set({ karaokeSensitivity: Math.max(3, Math.round(v)) })} showTimes={false} />
          <Txt style={{ marginTop: 8 }}>Standard-Musiklautstärke: {Math.round(s.karaokeMusicVolume * 100)} %</Txt>
          <SeekBar value={s.karaokeMusicVolume} max={1} onSeek={(v) => s.set({ karaokeMusicVolume: Math.round(v * 20) / 20 })} showTimes={false} />
        </View>

        <Section title="Daten" />
        <ListItem
          icon="trash-outline"
          title="Hörverlauf löschen"
          subtitle="Setzt „Zuletzt gehört“, Mixe und deinen Rückblick zurück."
          danger
          onPress={() => confirm('Verlauf löschen?', 'Statistiken und Empfehlungen werden zurückgesetzt.', 'Löschen', () => (clearHistory(), toast('Verlauf gelöscht')))}
        />

        <Section title="Über" />
        <View style={styles.block}>
          <Txt bold>Klangraum 1.0</Txt>
          <Txt dim size={13} style={{ marginTop: 4, lineHeight: 19 }}>
            Musikkatalog: Audius (freie, legal streambare Musik unabhängiger Künstler:innen). Songtexte: LRCLIB (offene Datenbank für
            synchronisierte Songtexte). Eigene Dateien bleiben auf deinem Gerät.
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title }: { title: string }) {
  const t = useTheme();
  return (
    <Txt bold size={13} color={t.accent} style={{ paddingHorizontal: 16, marginTop: 26, marginBottom: 6, letterSpacing: 0.6 }}>
      {title.toUpperCase()}
    </Txt>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  label: { paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  colors: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, flexWrap: 'wrap' },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  block: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
});
