import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { playList, playTrack } from '../../audio/engine';
import { Artwork } from '../../components/Artwork';
import { TrackRow } from '../../components/TrackRow';
import { Chip, IconButton, ListItem, Loading, Screen, SectionTitle, Txt } from '../../components/ui';
import { audius, GENRES, MOODS } from '../../lib/audius';
import { searchLyrics, type LrclibRecord } from '../../lib/lyrics';
import { useTheme } from '../../lib/theme';
import type { Album, Artist, Track } from '../../lib/types';
import { useLibrary } from '../../store/library';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/ui';

type Filter = 'all' | 'songs' | 'artists' | 'playlists' | 'mine' | 'lyrics';

interface Results {
  tracks: Track[];
  artists: Artist[];
  playlists: Album[];
  lyrics: LrclibRecord[];
}

const EMPTY: Results = { tracks: [], artists: [], playlists: [], lyrics: [] };

export default function SearchScreen() {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = useSettings((s) => s.offlineMode);
  const recentSearches = useLibrary((s) => s.recentSearches);
  const addRecentSearch = useLibrary((s) => s.addRecentSearch);
  const clearRecentSearches = useLibrary((s) => s.clearRecentSearches);
  const allTracks = useLibrary((s) => s.tracks);
  const localIds = useLibrary((s) => s.localIds);
  const downloads = useLibrary((s) => s.downloads);
  const liked = useLibrary((s) => s.liked);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const id = setTimeout(() => {
      setDebounced(q);
      if (!q || offline) return;
      setLoading(true);
      setError(null);
      search(q);
    }, 350);
    const search = (q: string) =>
      Promise.allSettled([
        audius.searchTracks(q),
        audius.searchArtists(q),
        audius.searchPlaylists(q),
        filter === 'lyrics' ? searchLyrics(q) : Promise.resolve([] as LrclibRecord[]),
      ]).then(([tr, ar, pl, ly]) => {
      if (cancelled) return;
      const val = <T,>(r: PromiseSettledResult<T>, fallback: T) => (r.status === 'fulfilled' ? r.value : fallback);
      setResults({ tracks: val(tr, []), artists: val(ar, []), playlists: val(pl, []), lyrics: val(ly, []) });
      if (tr.status === 'rejected' && ar.status === 'rejected') setError((tr.reason as Error).message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, offline, filter]);

  const mine = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    const ids = new Set([...localIds, ...Object.keys(downloads), ...Object.keys(liked)]);
    return [...ids]
      .map((id) => allTracks[id])
      .filter((tr) => tr && `${tr.title} ${tr.artist} ${tr.album ?? ''}`.toLowerCase().includes(q));
  }, [debounced, localIds, downloads, liked, allTracks]);

  const commit = () => {
    if (query.trim()) addRecentSearch(query.trim());
  };

  const playFromLyrics = async (rec: LrclibRecord) => {
    commit();
    try {
      const found = await audius.searchTracks(`${rec.trackName} ${rec.artistName}`);
      if (found.length) {
        playTrack(found[0], { type: 'search', name: rec.trackName });
        toast(`Gefunden: ${found[0].title}`);
      } else toast('Song nicht im Katalog – Songtext bleibt verfügbar.');
    } catch {
      toast('Suche fehlgeschlagen');
    }
  };

  const show = (f: Filter) => filter === 'all' || filter === f;

  return (
    <Screen>
      <Txt size={26} bold style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        Suchen
      </Txt>
      <View style={[styles.searchBox, { backgroundColor: t.dark ? '#FFFFFF' : t.surfaceAlt }]}>
        <Ionicons name="search" size={20} color="#333" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={commit}
          placeholder={filter === 'lyrics' ? 'Eine Zeile aus dem Songtext …' : 'Was willst du hören?'}
          placeholderTextColor="#777"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        {query ? <IconButton name="close" size={20} color="#333" onPress={() => setQuery('')} label="Leeren" /> : null}
      </View>

      {debounced ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {(
            [
              ['all', 'Alle'],
              ['songs', 'Songs'],
              ['artists', 'Künstler'],
              ['playlists', 'Playlists'],
              ['mine', 'Meine Musik'],
              ['lyrics', 'Songtext-Suche'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <Chip key={key} label={label} active={filter === key} onPress={() => setFilter(key)} />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss} contentContainerStyle={{ paddingBottom: 40 }}>
        {!debounced ? (
          <>
            {recentSearches.length ? (
              <>
                <SectionTitle title="Letzte Suchen" action="Löschen" onAction={clearRecentSearches} />
                {recentSearches.map((q) => (
                  <ListItem key={q} icon="time-outline" title={q} onPress={() => setQuery(q)} />
                ))}
              </>
            ) : null}
            {!offline ? (
              <>
                <SectionTitle title="Alle durchsuchen" />
                <View style={styles.grid}>
                  {GENRES.map((g) => (
                    <Pressable
                      key={g.name}
                      onPress={() => router.push(`/genre/${encodeURIComponent(g.name)}`)}
                      style={({ pressed }) => [styles.genre, { backgroundColor: g.color, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <Txt bold size={16} color="#fff">
                        {g.label}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
                <SectionTitle title="Nach Stimmung" />
                <View style={[styles.chips, { flexWrap: 'wrap' }]}>
                  {MOODS.map((m) => (
                    <Chip key={m} label={m} onPress={() => setQuery(m)} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
            {show('mine') && mine.length ? (
              <>
                <SectionTitle title="In deiner Bibliothek" />
                {mine.slice(0, filter === 'mine' ? 100 : 4).map((tr, i) => (
                  <TrackRow key={tr.id} track={tr} onPress={() => (commit(), playList(mine, i, { type: 'search', name: debounced }))} />
                ))}
              </>
            ) : null}
            {filter === 'mine' && !mine.length ? <Txt dim style={{ padding: 16 }}>Keine Treffer in deiner Bibliothek.</Txt> : null}

            {offline && filter !== 'mine' ? (
              <Txt dim style={{ padding: 16 }}>Im Offline-Modus wird nur deine Bibliothek durchsucht.</Txt>
            ) : loading && !results.tracks.length ? (
              <Loading />
            ) : error ? (
              <Txt dim style={{ padding: 16 }}>
                {error}
              </Txt>
            ) : (
              <>
                {filter === 'lyrics' ? (
                  <>
                    <SectionTitle title="Songs mit diesem Text" />
                    {results.lyrics.length ? (
                      results.lyrics.map((rec) => (
                        <ListItem
                          key={rec.id}
                          icon="text-outline"
                          title={rec.trackName}
                          subtitle={`${rec.artistName}${rec.syncedLyrics ? ' · synchronisiert' : ''}`}
                          onPress={() => playFromLyrics(rec)}
                        />
                      ))
                    ) : (
                      <Txt dim style={{ paddingHorizontal: 16 }}>{loading ? 'Suche …' : 'Keine Songtexte gefunden.'}</Txt>
                    )}
                  </>
                ) : null}

                {show('artists') && results.artists.length ? (
                  <>
                    <SectionTitle title="Künstler" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
                      {results.artists.slice(0, filter === 'artists' ? 30 : 8).map((a) => (
                        <Pressable key={a.id} onPress={() => (commit(), router.push(`/artist/${a.id}`))} style={{ width: 110, alignItems: 'center' }}>
                          <Artwork uri={a.picture} seed={a.id} size={100} round icon="person" />
                          <Txt bold size={13} lines={1} style={{ marginTop: 6 }}>
                            {a.name}
                          </Txt>
                          <Txt dim size={12}>
                            Künstler{a.verified ? ' ✓' : ''}
                          </Txt>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}

                {show('songs') && results.tracks.length ? (
                  <>
                    <SectionTitle title="Songs" />
                    {results.tracks.slice(0, filter === 'songs' ? 50 : 8).map((tr, i) => (
                      <TrackRow
                        key={tr.id}
                        track={tr}
                        onPress={() => (commit(), playList(results.tracks, i, { type: 'search', name: `„${debounced}“` }))}
                      />
                    ))}
                  </>
                ) : null}

                {show('playlists') && results.playlists.length ? (
                  <>
                    <SectionTitle title="Playlists & Alben" />
                    {results.playlists.slice(0, filter === 'playlists' ? 30 : 5).map((p) => (
                      <Pressable key={p.id} onPress={() => (commit(), router.push(`/album/${p.id}`))} style={styles.plRow}>
                        <Artwork uri={p.artwork} seed={p.id} size={56} />
                        <View style={{ flex: 1 }}>
                          <Txt bold lines={1}>
                            {p.name}
                          </Txt>
                          <Txt dim size={13} lines={1}>
                            {p.isAlbum ? 'Album' : 'Playlist'} · {p.artist}
                          </Txt>
                        </View>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                {!loading && filter !== 'lyrics' && !results.tracks.length && !results.artists.length && !mine.length ? (
                  <Txt dim style={{ padding: 16, textAlign: 'center' }}>
                    Keine Ergebnisse für „{debounced}“.
                  </Txt>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, borderRadius: 8, paddingHorizontal: 10, gap: 6 },
  input: { flex: 1, height: 46, fontSize: 16, color: '#111' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  genre: { flexBasis: '47%', flexGrow: 1, height: 92, borderRadius: 8, padding: 12 },
  plRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
});
