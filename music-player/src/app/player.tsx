import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cycleRepeat, next, previous, seek, setRate, setShuffle, setSleepTimer, skipBy, toggle } from '../audio/engine';
import { Artwork } from '../components/Artwork';
import { KaraokeLine } from '../components/LyricsView';
import { SeekBar } from '../components/SeekBar';
import { Sheet } from '../components/Sheets';
import { IconButton, ListItem, PlayFab, Txt } from '../components/ui';
import { shareTrack } from '../lib/actions';
import { coverColors } from '../lib/format';
import { activeLineIndex } from '../lib/lyrics';
import { useTheme } from '../lib/theme';
import { useLyrics } from '../lib/useLyrics';
import { useSmoothPosition } from '../lib/usePosition';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const SLEEP = [5, 10, 15, 30, 45, 60, 90];

export default function PlayerScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const s = usePlayer();
  const current = s.current;
  const liked = useLibrary((x) => (current ? !!x.liked[current.id] : false));
  const toggleLike = useLibrary((x) => x.toggleLike);
  const openMenu = useUi((x) => x.openTrackMenu);
  const showLyrics = useSettings((x) => x.showLyricsInPlayer);
  const [sheet, setSheet] = useState<'speed' | 'sleep' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every second while a sleep timer runs, so the countdown updates.
  useEffect(() => {
    if (!s.sleepEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s.sleepEndsAt]);

  useEffect(() => {
    if (!current) router.back();
  }, [current]);

  if (!current) return null;

  const [c1] = coverColors(current.id);
  const artSize = Math.min(width - 48, 420);
  const sleepLeft = s.sleepEndsAt ? Math.max(0, Math.ceil((s.sleepEndsAt - now) / 60000)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[c1, t.bg]} locations={[0, 0.75]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 30 }}>
        <View style={styles.top}>
          <IconButton name="chevron-down" size={28} onPress={() => router.back()} label="Schließen" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt size={11} bold dim style={{ letterSpacing: 1 }}>
              {s.context ? 'WIRD ABGESPIELT VON' : 'WIRD ABGESPIELT'}
            </Txt>
            {s.context ? (
              <Txt size={13} bold lines={1}>
                {s.context.name}
              </Txt>
            ) : null}
          </View>
          <IconButton name="ellipsis-horizontal" onPress={() => openMenu({ track: current })} label="Optionen" />
        </View>

        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Artwork uri={current.artwork} seed={current.id} size={artSize} radius={10} style={styles.artShadow} />
        </View>

        <View style={styles.pad}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Txt size={23} bold lines={1}>
                {current.title}
              </Txt>
              <Pressable
                onPress={() => {
                  router.back();
                  const id = current.artistId ?? encodeURIComponent(`local:${current.artist}`);
                  setTimeout(() => router.push(`/artist/${id}`), 300);
                }}
              >
                <Txt dim size={16} lines={1} style={{ marginTop: 2 }}>
                  {current.artist}
                </Txt>
              </Pressable>
            </View>
            <IconButton
              name={liked ? 'heart' : 'heart-outline'}
              size={28}
              color={liked ? t.accent : t.text}
              onPress={() => toggleLike(current)}
              label="Gefällt mir"
            />
          </View>

          <View style={{ marginTop: 18 }}>
            <SeekBar value={s.position} max={s.duration} onSeek={seek} />
          </View>
          {s.error ? (
            <Txt color={t.danger} size={13} style={{ marginTop: 4 }}>
              {s.error}
            </Txt>
          ) : null}

          <View style={styles.controls}>
            <IconButton name="shuffle" size={26} color={s.shuffle ? t.accent : t.text} onPress={() => setShuffle(!s.shuffle)} label="Zufallswiedergabe" />
            <IconButton name="play-skip-back" size={34} onPress={previous} label="Zurück" />
            {s.buffering ? (
              <View style={[styles.bigPlay, { backgroundColor: t.text }]}>
                <ActivityIndicator color={t.bg} />
              </View>
            ) : (
              <PlayFab playing={s.playing} onPress={toggle} size={70} />
            )}
            <IconButton name="play-skip-forward" size={34} onPress={() => next()} label="Weiter" />
            <View>
              <IconButton name="repeat" size={26} color={s.repeat !== 'off' ? t.accent : t.text} onPress={cycleRepeat} label="Wiederholen" />
              {s.repeat === 'one' ? (
                <View style={[styles.badge, { backgroundColor: t.accent }]}>
                  <Txt size={9} bold color={t.onAccent}>
                    1
                  </Txt>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.secondary}>
            <IconButton name="play-back-outline" size={22} onPress={() => skipBy(-15)} label="15 Sekunden zurück" />
            <Pressable onPress={() => setSheet('speed')} style={styles.pill}>
              <Txt bold size={13} color={s.rate !== 1 ? t.accent : undefined}>
                {s.rate.toString().replace('.', ',')}×
              </Txt>
            </Pressable>
            <Pressable onPress={() => setSheet('sleep')} style={styles.pill}>
              <Ionicons name="moon-outline" size={18} color={s.sleepEndsAt || s.sleepEndOfTrack ? t.accent : t.text} />
              {s.sleepEndsAt ? (
                <Txt size={12} bold color={t.accent}>
                  {sleepLeft} Min.
                </Txt>
              ) : s.sleepEndOfTrack ? (
                <Txt size={12} bold color={t.accent}>
                  Songende
                </Txt>
              ) : null}
            </Pressable>
            <IconButton name="mic-outline" size={22} onPress={() => router.push({ pathname: '/karaoke-session', params: { trackId: current.id } })} label="Karaoke" />
            <IconButton name="list" size={22} onPress={() => router.push('/queue')} label="Warteschlange" />
            <IconButton name="share-outline" size={22} onPress={() => shareTrack(current)} label="Teilen" />
            <IconButton name="play-forward-outline" size={22} onPress={() => skipBy(15)} label="15 Sekunden vor" />
          </View>
          {s.loadingRadio ? (
            <Txt dim size={12} style={{ textAlign: 'center', marginTop: 8 }}>
              Suche ähnliche Songs für Autoplay …
            </Txt>
          ) : null}
        </View>

        {showLyrics ? <LyricsPreview /> : null}

        <View style={[styles.card, { backgroundColor: t.surfaceAlt }]}>
          <Txt bold size={16}>
            Über diesen Song
          </Txt>
          <Txt dim style={{ marginTop: 6 }}>
            {[current.album, current.genre, current.mood, current.source === 'local' ? 'Lokale Datei' : 'Stream über Audius'].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </ScrollView>

      <Sheet visible={sheet === 'speed'} onClose={() => setSheet(null)}>
        <Txt bold size={18} style={{ padding: 16 }}>
          Wiedergabegeschwindigkeit
        </Txt>
        {SPEEDS.map((r) => (
          <ListItem
            key={r}
            title={`${r.toString().replace('.', ',')}×${r === 1 ? ' (Normal)' : ''}`}
            right={s.rate === r ? <Ionicons name="checkmark" size={20} color={t.accent} /> : undefined}
            onPress={() => {
              setRate(r);
              setSheet(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={sheet === 'sleep'} onClose={() => setSheet(null)}>
        <Txt bold size={18} style={{ padding: 16 }}>
          Sleep-Timer
        </Txt>
        {s.sleepEndsAt || s.sleepEndOfTrack ? (
          <ListItem icon="close-circle-outline" title="Timer ausschalten" onPress={() => (setSleepTimer(null), setSheet(null))} />
        ) : null}
        {SLEEP.map((m) => (
          <ListItem key={m} icon="moon-outline" title={`${m} Minuten`} onPress={() => (setSleepTimer(m), setSheet(null))} />
        ))}
        <ListItem icon="musical-note-outline" title="Am Ende des Songs" onPress={() => (setSleepTimer('track'), setSheet(null))} />
      </Sheet>
    </View>
  );
}

function LyricsPreview() {
  const t = useTheme();
  const current = usePlayer((s) => s.current);
  const { lyrics, loading } = useLyrics(current);
  const offset = lyrics?.offset ?? 0;
  const position = useSmoothPosition(120) + offset;
  if (!current) return null;

  const lines = lyrics?.synced;
  const idx = lines ? activeLineIndex(lines, position) : -1;
  const shown = lines ? lines.slice(Math.max(0, idx), Math.max(0, idx) + 4) : [];

  return (
    <Pressable onPress={() => router.push({ pathname: '/lyrics', params: { trackId: current.id } })} style={[styles.card, { backgroundColor: t.dark ? '#3A2A5C' : '#E6DDF7' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Txt bold size={16} style={{ flex: 1 }}>
          Songtext
        </Txt>
        <Ionicons name="expand-outline" size={18} color={t.text} />
      </View>
      {loading && !lyrics ? (
        <ActivityIndicator color={t.text} />
      ) : lines?.length ? (
        shown.map((l, i) =>
          i === 0 && idx >= 0 ? (
            <KaraokeLine key={l.time} line={l} position={position} base={t.textDim} fill={t.text} style={{ fontSize: 20, fontWeight: '800', marginBottom: 8 }} />
          ) : (
            <Txt key={l.time} bold size={20} dim style={{ marginBottom: 8 }}>
              {l.text || '♪'}
            </Txt>
          ),
        )
      ) : lyrics?.plain ? (
        <Txt bold size={18} lines={6} style={{ lineHeight: 26 }}>
          {lyrics.plain}
        </Txt>
      ) : lyrics?.instrumental ? (
        <Txt dim>Instrumental – genieß die Musik 🎶</Txt>
      ) : (
        <Txt dim>Kein Songtext gefunden. Tippe hier, um selbst einen hinzuzufügen.</Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  artShadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  pad: { paddingHorizontal: 24, marginTop: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  bigPlay: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -2, top: -2, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, minWidth: 34, justifyContent: 'center' },
  card: { marginHorizontal: 16, marginTop: 26, padding: 16, borderRadius: 12 },
});
