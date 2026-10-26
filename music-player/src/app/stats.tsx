import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playList } from '../audio/engine';
import { Artwork } from '../components/Artwork';
import { Chip, EmptyState, Header, PrimaryButton, Screen, SectionTitle, Txt } from '../components/ui';
import { GENRES } from '../lib/audius';
import { listeningByHour, since, streakDays, topArtists, topGenres, topTracks } from '../lib/insights';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';
import { toast } from '../store/ui';

type Range = 7 | 30 | 365 | null;

export default function StatsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const history = useLibrary((s) => s.history);
  const tracks = useLibrary((s) => s.tracks);
  const recordings = useLibrary((s) => s.recordings);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [range, setRange] = useState<Range>(30);

  const h = useMemo(() => since(history, range), [history, range]);
  const minutes = Math.round(h.reduce((a, e) => a + e.seconds, 0) / 60);
  const tTracks = useMemo(() => topTracks(h, tracks).slice(0, 10), [h, tracks]);
  const tArtists = useMemo(() => topArtists(h, tracks).slice(0, 5), [h, tracks]);
  const tGenres = useMemo(() => topGenres(h, tracks).slice(0, 5), [h, tracks]);
  const hours = useMemo(() => listeningByHour(h), [h]);
  const maxHour = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  const streak = useMemo(() => streakDays(history), [history]);
  const karaokeBest = recordings.reduce((a, r) => Math.max(a, r.score), 0);

  return (
    <Screen>
      <Header title="Dein Rückblick" back />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.chips}>
          {(
            [
              [7, '7 Tage'],
              [30, '30 Tage'],
              [365, 'Jahr'],
              [null, 'Gesamt'],
            ] as [Range, string][]
          ).map(([r, label]) => (
            <Chip key={label} label={label} active={range === r} onPress={() => setRange(r)} />
          ))}
        </View>

        {!h.length ? (
          <EmptyState icon="stats-chart-outline" title="Noch keine Daten" text="Hör ein bisschen Musik – Songs zählen ab 30 Sekunden Wiedergabe." />
        ) : (
          <>
            <View style={styles.tiles}>
              <Tile value={minutes.toLocaleString('de-DE')} label="Minuten gehört" color={t.accent} />
              <Tile value={String(h.length)} label="Wiedergaben" color="#3D9BFF" />
              <Tile value={`${streak} 🔥`} label="Tage in Folge" color="#FF8A3D" />
              <Tile value={karaokeBest ? String(karaokeBest) : '–'} label="Karaoke-Bestwert" color="#FF4F9A" />
            </View>

            <SectionTitle title="Deine Top-Songs" />
            {tTracks.map((r, i) => (
              <Pressable
                key={r.item.id}
                style={styles.row}
                onPress={() => playList(tTracks.map((x) => x.item), i, { type: 'other', name: 'Deine Top-Songs' })}
              >
                <Txt bold size={18} style={{ width: 26 }}>
                  {i + 1}
                </Txt>
                <Artwork uri={r.item.artwork} seed={r.item.id} size={44} />
                <View style={{ flex: 1 }}>
                  <Txt bold lines={1}>
                    {r.item.title}
                  </Txt>
                  <Txt dim size={13} lines={1}>
                    {r.item.artist}
                  </Txt>
                </View>
                <Txt dim size={13}>
                  {r.count}×
                </Txt>
              </Pressable>
            ))}
            {tTracks.length >= 3 ? (
              <PrimaryButton
                label="Als Playlist speichern"
                icon="add"
                variant="outline"
                style={{ marginHorizontal: 16, marginTop: 10 }}
                onPress={() => {
                  const id = createPlaylist(`Meine Top-Songs (${range ? `${range} Tage` : 'gesamt'})`, tTracks.map((x) => x.item.id));
                  toast('Playlist erstellt');
                  router.push(`/playlist/${id}`);
                }}
              />
            ) : null}

            <SectionTitle title="Top-Künstler" />
            {tArtists.map((r, i) => (
              <Pressable
                key={r.item.name}
                style={styles.row}
                onPress={() => router.push(`/artist/${r.item.id ?? encodeURIComponent(`local:${r.item.name}`)}`)}
              >
                <Txt bold size={18} style={{ width: 26 }}>
                  {i + 1}
                </Txt>
                <Artwork uri={r.item.artwork} seed={r.item.name} size={44} round icon="person" />
                <Txt bold style={{ flex: 1 }} lines={1}>
                  {r.item.name}
                </Txt>
                <Txt dim size={13}>
                  {Math.round(r.seconds / 60)} Min.
                </Txt>
              </Pressable>
            ))}

            {tGenres.length ? (
              <>
                <SectionTitle title="Deine Genres" />
                {tGenres.map((g) => {
                  const pct = g.count / tGenres[0].count;
                  const info = GENRES.find((x) => x.name === g.item);
                  return (
                    <View key={g.item} style={{ paddingHorizontal: 16, marginBottom: 10 }}>
                      <Txt size={14}>{info?.label ?? g.item}</Txt>
                      <View style={[styles.barTrack, { backgroundColor: t.surfaceAlt }]}>
                        <View style={{ width: `${pct * 100}%`, height: 10, borderRadius: 5, backgroundColor: info?.color ?? t.accent }} />
                      </View>
                    </View>
                  );
                })}
              </>
            ) : null}

            <SectionTitle title="Wann du hörst" />
            <View style={styles.hours}>
              {hours.map((m, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '70%', height: 4 + (m / maxHour) * 90, borderRadius: 2, backgroundColor: i === peak ? t.accent : t.elevated }} />
                </View>
              ))}
            </View>
            <View style={[styles.hourLabels]}>
              {[0, 6, 12, 18, 23].map((hh) => (
                <Txt key={hh} dim size={11}>
                  {hh} Uhr
                </Txt>
              ))}
            </View>
            <Txt dim style={{ paddingHorizontal: 16, marginTop: 8 }}>
              Am meisten hörst du gegen {peak} Uhr.
            </Txt>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <Txt bold size={26} color="#000">
        {value}
      </Txt>
      <Txt size={13} color="rgba(0,0,0,0.75)" bold>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 6 },
  barTrack: { height: 10, borderRadius: 5, marginTop: 4, overflow: 'hidden' },
  hours: { flexDirection: 'row', alignItems: 'flex-end', height: 100, paddingHorizontal: 12 },
  hourLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 4 },
});
