import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { playList } from '../../audio/engine';
import { CardRow, QuickTile, type CardItem } from '../../components/MediaCard';
import { TrackRow } from '../../components/TrackRow';
import { Chip, IconButton, Screen, SectionTitle, Txt } from '../../components/ui';
import { audius, GENRES } from '../../lib/audius';
import { greeting } from '../../lib/format';
import { recentTracks, since, topGenres } from '../../lib/insights';
import { useTheme } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';
import { useLibrary } from '../../store/library';
import { useSettings } from '../../store/settings';

export default function HomeScreen() {
  const t = useTheme();
  const offline = useSettings((s) => s.offlineMode);
  const history = useLibrary((s) => s.history);
  const tracks = useLibrary((s) => s.tracks);
  const recent = useLibrary((s) => s.recent);
  const likedCount = useLibrary((s) => Object.keys(s.liked).length);
  const playlists = useLibrary((s) => s.playlists);
  const downloadsCount = useLibrary((s) => Object.keys(s.downloads).length);

  const trending = useAsync(offline ? null : 'trending:week', () => audius.trending());
  const playlistsTrending = useAsync(offline ? null : 'playlists:trending', () => audius.trendingPlaylists());
  const underground = useAsync(offline ? null : 'underground', () => audius.undergroundTrending());

  const recentlyPlayed = useMemo(() => recentTracks(history, tracks, 15), [history, tracks]);
  const favGenres = useMemo(() => topGenres(since(history, 60), tracks).slice(0, 6), [history, tracks]);

  const quick: CardItem[] = useMemo(() => {
    const items: CardItem[] = [
      { key: 'liked', title: 'Lieblingssongs', icon: 'heart', colors: ['#4A1FFF', '#A4C8D8'], onPress: () => router.push('/playlist/liked') },
    ];
    for (const r of recent) {
      if (items.length >= 6) break;
      if (r.kind === 'liked') continue;
      const path = r.kind === 'playlist' ? `/playlist/${r.id}` : r.kind === 'artist' ? `/artist/${encodeURIComponent(r.id)}` : r.kind === 'album' ? `/album/${r.id}` : `/genre/${encodeURIComponent(r.id)}`;
      items.push({ key: `${r.kind}:${r.id}`, title: r.name, artwork: r.artwork, round: r.kind === 'artist', onPress: () => router.push(path) });
    }
    for (const p of playlists) {
      if (items.length >= 6) break;
      if (items.some((i) => i.key === `playlist:${p.id}`)) continue;
      items.push({ key: `playlist:${p.id}`, title: p.name, onPress: () => router.push(`/playlist/${p.id}`) });
    }
    if (items.length < 6 && downloadsCount) {
      items.push({ key: 'downloads', title: 'Downloads', icon: 'arrow-down-circle', colors: ['#0B7A3E', '#1ED760'], onPress: () => router.push('/playlist/downloads') });
    }
    return items;
  }, [recent, playlists, downloadsCount]);

  const mixes: CardItem[] = favGenres.map((g, i) => {
    const genre = GENRES.find((x) => x.name === g.item);
    return {
      key: `mix:${g.item}`,
      title: `Mix ${i + 1}: ${genre?.label ?? g.item}`,
      subtitle: 'Basierend auf deinem Musikgeschmack',
      icon: 'disc',
      colors: [genre?.color ?? '#555', '#121212'],
      onPress: () => router.push(`/genre/${encodeURIComponent(g.item)}`),
    };
  });

  const refreshing = trending.loading && !!trending.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            tintColor={t.accent}
            refreshing={refreshing}
            onRefresh={() => {
              trending.reload();
              playlistsTrending.reload();
              underground.reload();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Txt size={24} bold style={{ flex: 1 }}>
            {greeting()}
          </Txt>
          <IconButton name="stats-chart-outline" onPress={() => router.push('/stats')} label="Dein Rückblick" />
          <IconButton name="time-outline" onPress={() => router.push('/history')} label="Verlauf" />
          <IconButton name="settings-outline" onPress={() => router.push('/settings')} label="Einstellungen" />
        </View>

        {offline ? (
          <View style={[styles.banner, { backgroundColor: t.surfaceAlt }]}>
            <Txt bold>Offline-Modus aktiv</Txt>
            <Txt dim size={13} style={{ marginTop: 4 }}>
              Es werden nur heruntergeladene und importierte Songs angezeigt.
            </Txt>
          </View>
        ) : null}

        <View style={styles.quickGrid}>
          {quick.map((item) => (
            <QuickTile key={item.key} item={item} />
          ))}
        </View>

        {recentlyPlayed.length ? (
          <>
            <SectionTitle title="Zuletzt gehört" action="Alle" onAction={() => router.push('/history')} />
            <CardRow
              size={130}
              items={recentlyPlayed.map((tr, i) => ({
                key: tr.id,
                title: tr.title,
                subtitle: tr.artist,
                artwork: tr.artwork,
                onPress: () => playList(recentlyPlayed, i, { type: 'other', name: 'Zuletzt gehört' }),
              }))}
            />
          </>
        ) : null}

        {mixes.length ? (
          <>
            <SectionTitle title="Deine Mixe" />
            <CardRow items={mixes} />
          </>
        ) : null}

        {!offline ? (
          <>
            <SectionTitle title="Angesagt diese Woche" action="Mehr" onAction={() => router.push('/genre/Trending')} />
            {trending.error ? (
              <Txt dim style={{ paddingHorizontal: 16 }}>
                {trending.error}
              </Txt>
            ) : (
              (trending.data ?? []).slice(0, 6).map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  onPress={() => playList(trending.data ?? [], i, { type: 'genre', id: 'Trending', name: 'Angesagt diese Woche' })}
                />
              ))
            )}

            {playlistsTrending.data?.length ? (
              <>
                <SectionTitle title="Beliebte Playlists" />
                <CardRow
                  items={playlistsTrending.data.slice(0, 12).map((p) => ({
                    key: p.id,
                    title: p.name,
                    subtitle: `von ${p.artist}`,
                    artwork: p.artwork,
                    onPress: () => router.push(`/album/${p.id}`),
                  }))}
                />
              </>
            ) : null}

            {underground.data?.length ? (
              <>
                <SectionTitle title="Neue Entdeckungen" />
                <CardRow
                  size={130}
                  items={underground.data.slice(0, 15).map((tr, i) => ({
                    key: tr.id,
                    title: tr.title,
                    subtitle: tr.artist,
                    artwork: tr.artwork,
                    onPress: () => playList(underground.data ?? [], i, { type: 'other', name: 'Neue Entdeckungen' }),
                  }))}
                />
              </>
            ) : null}

            <SectionTitle title="Genres entdecken" />
            <View style={styles.chips}>
              {GENRES.map((g) => (
                <Chip key={g.name} label={g.label} onPress={() => router.push(`/genre/${encodeURIComponent(g.name)}`)} />
              ))}
            </View>
          </>
        ) : null}

        {likedCount === 0 && !recentlyPlayed.length ? (
          <View style={[styles.banner, { backgroundColor: t.surfaceAlt, marginTop: 26 }]}>
            <Txt bold>Willkommen bei Klangraum 👋</Txt>
            <Txt dim size={13} style={{ marginTop: 4, lineHeight: 19 }}>
              Tippe auf einen Song, um ihn abzuspielen. Mit ♥ speicherst du Lieblingssongs, im Tab „Bibliothek“ kannst du eigene
              Musikdateien importieren, und unter „Karaoke“ singst du mit Live-Songtext und Bewertung.
            </Txt>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 6 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  banner: { marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 10 },
});
