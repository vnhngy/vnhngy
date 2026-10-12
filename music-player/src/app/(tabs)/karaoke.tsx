import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Artwork } from '../../components/Artwork';
import { PromptSheet } from '../../components/Sheets';
import { Chip, Loading, Screen, SectionTitle, Txt } from '../../components/ui';
import { audius } from '../../lib/audius';
import { relativeDate } from '../../lib/format';
import { recentTracks } from '../../lib/insights';
import { useTheme } from '../../lib/theme';
import type { Track } from '../../lib/types';
import { likedTracks, useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';

const sing = (track: Track) => router.push({ pathname: '/karaoke-session', params: { trackId: track.id } });

export default function KaraokeTab() {
  const t = useTheme();
  const current = usePlayer((s) => s.current);
  const recordings = useLibrary((s) => s.recordings);
  const tracks = useLibrary((s) => s.tracks);
  const lyrics = useLibrary((s) => s.lyrics);
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const localIds = useLibrary((s) => s.localIds);
  const singer = useSettings((s) => s.singerName);
  const setSettings = useSettings((s) => s.set);
  const [editingSinger, setEditingSinger] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const id = setTimeout(() => {
      setSearching(true);
      audius
        .searchTracks(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(id);
  }, [query]);

  const withLyrics = useMemo(
    () => Object.keys(lyrics).filter((id) => lyrics[id].synced?.length && tracks[id]).map((id) => tracks[id]),
    [lyrics, tracks],
  );

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const pool = [...withLyrics, ...localIds.map((id) => tracks[id]), ...likedTracks({ liked, tracks }), ...recentTracks(history, tracks, 20)];
    return pool.filter((tr) => tr && !seen.has(tr.id) && (seen.add(tr.id), true)).slice(0, 25);
  }, [withLyrics, localIds, tracks, liked, history]);

  const shownResults = query.trim() ? results : null;
  const leaderboard = useMemo(() => [...recordings].sort((a, b) => b.score - a.score).slice(0, 5), [recordings]);
  const singers = useMemo(() => [...new Set(recordings.map((r) => r.singer))], [recordings]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[t.accent, t.bg]} style={styles.hero}>
          <Ionicons name="mic" size={40} color="#fff" />
          <Txt size={30} bold color="#fff" style={{ marginTop: 8 }}>
            Karaoke
          </Txt>
          <Txt color="rgba(255,255,255,0.85)" style={{ marginTop: 4, lineHeight: 20 }}>
            Sing mit Live-Songtext, nimm dich auf und hol dir deine Punktzahl. Tipp: Mit Kopfhörern klingt die Aufnahme am besten.
          </Txt>
          <Pressable onPress={() => setEditingSinger(true)} style={styles.singer}>
            <Ionicons name="person-circle" size={20} color="#fff" />
            <Txt color="#fff" bold>
              Sänger:in: {singer}
            </Txt>
            <Ionicons name="pencil" size={14} color="#fff" />
          </Pressable>
          {singers.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              {singers.map((s) => (
                <Chip key={s} label={s} active={s === singer} onPress={() => setSettings({ singerName: s })} />
              ))}
            </ScrollView>
          ) : null}
        </LinearGradient>

        {current ? (
          <Pressable onPress={() => sing(current)} style={[styles.nowCard, { backgroundColor: t.surfaceAlt }]}>
            <Artwork uri={current.artwork} seed={current.id} size={56} />
            <View style={{ flex: 1 }}>
              <Txt dim size={12}>
                Aktueller Song
              </Txt>
              <Txt bold lines={1}>
                {current.title}
              </Txt>
              <Txt dim size={13} lines={1}>
                {current.artist}
              </Txt>
            </View>
            <View style={[styles.singBtn, { backgroundColor: t.accent }]}>
              <Ionicons name="mic" size={18} color={t.onAccent} />
              <Txt bold color={t.onAccent} size={13}>
                Singen
              </Txt>
            </View>
          </Pressable>
        ) : null}

        <View style={[styles.searchBox, { backgroundColor: t.surfaceAlt }]}>
          <Ionicons name="search" size={18} color={t.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Song zum Singen suchen"
            placeholderTextColor={t.textMuted}
            style={{ flex: 1, height: 44, color: t.text, fontSize: 15 }}
          />
        </View>

        {shownResults ? (
          searching && !shownResults.length ? (
            <Loading />
          ) : (
            shownResults.slice(0, 20).map((tr) => <SingRow key={tr.id} track={tr} hasLyrics={!!lyrics[tr.id]?.synced} />)
          )
        ) : searching && query.trim() ? (
          <Loading />
        ) : (
          <>
            {leaderboard.length ? (
              <>
                <SectionTitle title="Bestenliste 🏆" />
                {leaderboard.map((r, i) => {
                  const tr = tracks[r.trackId];
                  return (
                    <Pressable key={r.id} onPress={() => router.push(`/performance/${r.id}`)} style={styles.row}>
                      <Txt bold size={20} style={{ width: 28, textAlign: 'center' }} color={i === 0 ? '#F5C518' : undefined}>
                        {i + 1}
                      </Txt>
                      <View style={{ flex: 1 }}>
                        <Txt bold lines={1}>
                          {r.singer}
                        </Txt>
                        <Txt dim size={13} lines={1}>
                          {tr?.title ?? 'Unbekannter Song'}
                        </Txt>
                      </View>
                      <Txt bold size={22} color={t.accent}>
                        {r.score}
                      </Txt>
                    </Pressable>
                  );
                })}
              </>
            ) : null}

            {recordings.length ? (
              <>
                <SectionTitle title="Deine Auftritte" />
                {recordings.slice(0, 20).map((r) => {
                  const tr = tracks[r.trackId];
                  return (
                    <Pressable key={r.id} onPress={() => router.push(`/performance/${r.id}`)} style={styles.row}>
                      <Artwork uri={tr?.artwork} seed={r.trackId} size={48} />
                      <View style={{ flex: 1 }}>
                        <Txt bold lines={1}>
                          {tr?.title ?? 'Unbekannter Song'}
                        </Txt>
                        <Txt dim size={13} lines={1}>
                          {r.singer} · {relativeDate(r.createdAt)} · {r.score} Punkte
                        </Txt>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                    </Pressable>
                  );
                })}
              </>
            ) : null}

            <SectionTitle title="Zum Mitsingen" />
            {suggestions.length ? (
              suggestions.map((tr) => <SingRow key={tr.id} track={tr} hasLyrics={!!lyrics[tr.id]?.synced} />)
            ) : (
              <Txt dim style={{ paddingHorizontal: 16, lineHeight: 20 }}>
                Hör ein paar Songs oder importiere deine eigene Musik – hier erscheinen dann Vorschläge. Songtexte werden automatisch über
                LRCLIB gesucht; du kannst auch eigene .lrc-Dateien hinzufügen.
              </Txt>
            )}
          </>
        )}
      </ScrollView>
      <PromptSheet
        visible={editingSinger}
        title="Wer singt?"
        initial={singer}
        placeholder="Name"
        onClose={() => setEditingSinger(false)}
        onSubmit={(name) => setSettings({ singerName: name.trim() || 'Ich' })}
      />
    </Screen>
  );
}

function SingRow({ track, hasLyrics }: { track: Track; hasLyrics: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => sing(track)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}>
      <Artwork uri={track.artwork} seed={track.id} size={48} />
      <View style={{ flex: 1 }}>
        <Txt bold lines={1}>
          {track.title}
        </Txt>
        <Txt dim size={13} lines={1}>
          {track.artist}
          {hasLyrics ? ' · Songtext bereit' : ''}
        </Txt>
      </View>
      <Ionicons name="mic-outline" size={22} color={t.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 28 },
  singer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  nowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 0, padding: 10, borderRadius: 10 },
  singBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 16, borderRadius: 8, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
});
