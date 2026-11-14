import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Collection } from '../../components/Collection';
import { Chip, EmptyState } from '../../components/ui';
import { audius, GENRES } from '../../lib/audius';
import { useAsync } from '../../lib/useAsync';
import { useLibrary } from '../../store/library';

type Range = 'week' | 'month' | 'allTime';

export default function GenreScreen() {
  const { name: raw } = useLocalSearchParams<{ name: string }>();
  const name = decodeURIComponent(raw ?? '');
  const isTrending = name === 'Trending';
  const genre = GENRES.find((g) => g.name === name);
  const [range, setRange] = useState<Range>('week');
  const data = useAsync(`genre:${name}:${range}`, () => audius.trending(isTrending ? undefined : name, range));
  const allTracks = useLibrary((s) => s.tracks);
  const pushRecent = useLibrary((s) => s.pushRecent);
  const title = isTrending ? 'Angesagt' : genre?.label ?? name;

  useEffect(() => {
    pushRecent({ kind: 'genre', id: name, name: title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Mix in songs you already know from this genre (like a personal mix).
  const tracks = useMemo(() => {
    const online = data.data ?? [];
    if (isTrending) return online;
    const known = Object.values(allTracks).filter((tr) => tr.genre === name && !online.some((o) => o.id === tr.id));
    const merged = [...online];
    known.slice(0, 10).forEach((tr, i) => merged.splice(Math.min(merged.length, i * 3 + 2), 0, tr));
    return merged;
  }, [data.data, allTracks, isTrending, name]);

  return (
    <Collection
      title={title}
      subtitle={range === 'week' ? 'Top der Woche' : range === 'month' ? 'Top des Monats' : 'Beste aller Zeiten'}
      seed={`genre:${name}`}
      icon={isTrending ? 'flame' : 'disc'}
      colors={genre ? [genre.color, '#121212'] : ['#E8115B', '#121212']}
      tracks={tracks}
      loading={data.loading}
      error={data.error}
      onRefresh={data.reload}
      context={{ type: 'genre', id: name, name: title }}
      headerExtra={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          <Chip label="Diese Woche" active={range === 'week'} onPress={() => setRange('week')} />
          <Chip label="Dieser Monat" active={range === 'month'} onPress={() => setRange('month')} />
          <Chip label="Allzeit" active={range === 'allTime'} onPress={() => setRange('allTime')} />
        </ScrollView>
      }
      empty={<EmptyState icon="musical-notes-outline" title="Keine Songs gefunden" />}
    />
  );
}
