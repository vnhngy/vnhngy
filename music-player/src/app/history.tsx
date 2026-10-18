import { useMemo } from 'react';
import { SectionList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playTrack } from '../audio/engine';
import { TrackRow } from '../components/TrackRow';
import { EmptyState, Header, Screen, Txt } from '../components/ui';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Heute';
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function HistoryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const history = useLibrary((s) => s.history);
  const tracks = useLibrary((s) => s.tracks);

  const sections = useMemo(() => {
    const out: { title: string; data: { key: string; trackId: string; at: number }[] }[] = [];
    for (let i = history.length - 1; i >= 0 && i >= history.length - 500; i--) {
      const e = history[i];
      if (!tracks[e.trackId]) continue;
      const title = dayLabel(e.at);
      if (!out.length || out[out.length - 1].title !== title) out.push({ title, data: [] });
      out[out.length - 1].data.push({ key: `${e.at}-${i}`, trackId: e.trackId, at: e.at });
    }
    return out;
  }, [history, tracks]);

  return (
    <Screen>
      <Header title="Verlauf" back />
      {sections.length ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          renderSectionHeader={({ section }) => (
            <Txt bold size={16} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.bg }}>
              {section.title}
            </Txt>
          )}
          renderItem={({ item }) => {
            const tr = tracks[item.trackId];
            return (
              <TrackRow
                track={tr}
                subtitle={`${tr.artist} · ${new Date(item.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                onPress={() => playTrack(tr, { type: 'other', name: 'Verlauf' })}
              />
            );
          }}
        />
      ) : (
        <EmptyState icon="time-outline" title="Noch nichts gehört" text="Hier erscheinen Songs, die du länger als 30 Sekunden gehört hast." />
      )}
    </Screen>
  );
}
