import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Artwork } from '../../components/Artwork';
import { PromptSheet } from '../../components/Sheets';
import { Chip, IconButton, Screen, Txt } from '../../components/ui';
import { importAudioFiles } from '../../lib/files';
import { useTheme } from '../../lib/theme';
import { useLibrary } from '../../store/library';
import { toast } from '../../store/ui';

type Filter = 'all' | 'playlists' | 'artists' | 'albums' | 'downloads' | 'device';
type Sort = 'recent' | 'alpha';

interface Row {
  key: string;
  title: string;
  subtitle: string;
  artwork?: string;
  round?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  colors?: [string, string];
  pinned?: boolean;
  at: number;
  kind: Filter;
  onPress: () => void;
}

export default function LibraryScreen() {
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const lib = useLibrary();

  const rows = useMemo(() => {
    const out: Row[] = [];
    const likedCount = Object.keys(lib.liked).length;
    out.push({
      key: 'liked',
      title: 'Lieblingssongs',
      subtitle: `Playlist · ${likedCount} Songs`,
      icon: 'heart',
      colors: ['#4A1FFF', '#A4C8D8'],
      pinned: true,
      at: Infinity,
      kind: 'playlists',
      onPress: () => router.push('/playlist/liked'),
    });
    const dl = Object.keys(lib.downloads).length;
    if (dl)
      out.push({
        key: 'downloads',
        title: 'Downloads',
        subtitle: `${dl} Songs offline`,
        icon: 'arrow-down-circle',
        colors: ['#0B7A3E', '#1ED760'],
        pinned: true,
        at: Infinity,
        kind: 'downloads',
        onPress: () => router.push('/playlist/downloads'),
      });
    out.push({
      key: 'local',
      title: 'Auf dem Gerät',
      subtitle: `${lib.localIds.length} importierte Songs`,
      icon: 'phone-portrait',
      colors: ['#E8115B', '#F59B23'],
      pinned: true,
      at: Infinity,
      kind: 'device',
      onPress: () => router.push('/playlist/local'),
    });
    for (const p of lib.playlists) {
      const first = lib.tracks[p.trackIds[0]];
      out.push({
        key: p.id,
        title: p.name,
        subtitle: `Playlist · ${p.trackIds.length} Songs`,
        artwork: first?.artwork,
        pinned: p.pinned,
        at: p.updatedAt,
        kind: 'playlists',
        onPress: () => router.push(`/playlist/${p.id}`),
      });
    }
    for (const a of lib.followedArtists) {
      out.push({
        key: `artist:${a.id}`,
        title: a.name,
        subtitle: 'Künstler',
        artwork: a.picture,
        round: true,
        icon: 'person',
        at: 0,
        kind: 'artists',
        onPress: () => router.push(`/artist/${a.id}`),
      });
    }
    // Artists from imported files.
    const localArtists = new Set(lib.localIds.map((id) => lib.tracks[id]?.artist).filter(Boolean));
    for (const name of localArtists) {
      out.push({
        key: `local-artist:${name}`,
        title: name,
        subtitle: 'Künstler · Auf dem Gerät',
        round: true,
        icon: 'person',
        at: 0,
        kind: 'artists',
        onPress: () => router.push(`/artist/${encodeURIComponent(`local:${name}`)}`),
      });
    }
    for (const al of lib.savedAlbums) {
      out.push({
        key: `album:${al.id}`,
        title: al.name,
        subtitle: `${al.isAlbum ? 'Album' : 'Playlist'} · ${al.artist}`,
        artwork: al.artwork,
        at: 0,
        kind: 'albums',
        onPress: () => router.push(`/album/${al.id}`),
      });
    }
    return out;
  }, [lib]);

  const visible = rows
    .filter((r) => filter === 'all' || r.kind === filter || (filter === 'device' && r.key === 'local'))
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return sort === 'alpha' ? a.title.localeCompare(b.title, 'de') : b.at - a.at;
    });

  const doImport = async () => {
    setImporting(true);
    try {
      const tracks = await importAudioFiles();
      if (tracks.length) {
        lib.addLocalTracks(tracks);
        toast(`${tracks.length} ${tracks.length === 1 ? 'Song' : 'Songs'} importiert`);
      }
    } catch {
      toast('Import fehlgeschlagen');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Txt size={26} bold style={{ flex: 1 }}>
          Bibliothek
        </Txt>
        <IconButton name={importing ? 'hourglass-outline' : 'download-outline'} onPress={doImport} disabled={importing} label="Musik importieren" />
        <IconButton name="add" size={30} onPress={() => setCreating(true)} label="Playlist erstellen" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
        {(
          [
            ['all', 'Alle'],
            ['playlists', 'Playlists'],
            ['artists', 'Künstler'],
            ['albums', 'Alben'],
            ['downloads', 'Heruntergeladen'],
            ['device', 'Auf dem Gerät'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <Chip key={k} label={label} active={filter === k} onPress={() => setFilter(filter === k ? 'all' : k)} />
        ))}
      </ScrollView>
      <Pressable style={styles.sort} onPress={() => setSort(sort === 'recent' ? 'alpha' : 'recent')}>
        <Ionicons name="swap-vertical" size={16} color={t.text} />
        <Txt size={13} bold>
          {sort === 'recent' ? 'Zuletzt geändert' : 'Alphabetisch'}
        </Txt>
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {visible.map((r) => (
          <Pressable key={r.key} onPress={r.onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}>
            <Artwork uri={r.artwork} seed={r.key} size={64} round={r.round} icon={r.icon} colors={r.colors} />
            <View style={{ flex: 1 }}>
              <Txt bold size={16} lines={1}>
                {r.title}
              </Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 }}>
                {r.pinned ? <Ionicons name="pin" size={12} color={t.accent} /> : null}
                <Txt dim size={13} lines={1}>
                  {r.subtitle}
                </Txt>
              </View>
            </View>
          </Pressable>
        ))}
        {filter === 'device' || filter === 'all' ? (
          <Pressable onPress={doImport} style={styles.row}>
            <View style={[styles.addBox, { backgroundColor: t.surfaceAlt }]}>
              <Ionicons name="folder-open-outline" size={28} color={t.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt bold size={16}>
                Musikdateien importieren
              </Txt>
              <Txt dim size={13}>
                MP3, M4A, WAV, FLAC … aus Dateien oder iCloud
              </Txt>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
      <PromptSheet
        visible={creating}
        title="Gib deiner Playlist einen Namen"
        placeholder="Meine Playlist"
        onClose={() => setCreating(false)}
        onSubmit={(name) => {
          const id = lib.createPlaylist(name);
          router.push(`/playlist/${id}`);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 7 },
  addBox: { width: 64, height: 64, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
