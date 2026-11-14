import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearUpNext, jumpTo, moveUpNext, playFromUpNext, removeFromUpNext, removeUpcoming } from '../audio/engine';
import { TrackRow } from '../components/TrackRow';
import { IconButton, Txt } from '../components/ui';
import { useTheme } from '../lib/theme';
import { upcomingFromContext, usePlayer } from '../store/player';

export default function QueueScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = usePlayer();
  const upcoming = upcomingFromContext(s);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.header, { paddingTop: 12 }]}>
        <IconButton name="chevron-down" size={28} onPress={() => router.back()} label="Schließen" />
        <Txt bold size={18} style={{ flex: 1, textAlign: 'center' }}>
          Warteschlange
        </Txt>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {s.current ? (
          <>
            <Txt bold size={16} style={styles.section}>
              Läuft gerade
            </Txt>
            <TrackRow track={s.current} onPress={() => router.back()} />
          </>
        ) : null}

        {s.upNext.length ? (
          <>
            <View style={styles.sectionRow}>
              <Txt bold size={16} style={{ flex: 1 }}>
                Als Nächstes in der Warteschlange
              </Txt>
              <IconButton name="trash-outline" size={20} color={t.textDim} onPress={clearUpNext} label="Warteschlange leeren" />
            </View>
            {s.upNext.map((tr, i) => (
              <TrackRow
                key={`${tr.id}-${i}`}
                track={tr}
                onPress={() => playFromUpNext(i)}
                right={
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton name="chevron-up" size={20} disabled={i === 0} onPress={() => moveUpNext(i, i - 1)} />
                    <IconButton name="chevron-down" size={20} disabled={i === s.upNext.length - 1} onPress={() => moveUpNext(i, i + 1)} />
                    <IconButton name="close" size={20} color={t.textDim} onPress={() => removeFromUpNext(i)} />
                  </View>
                }
              />
            ))}
          </>
        ) : null}

        {upcoming.length ? (
          <>
            <Txt bold size={16} style={styles.section}>
              Als Nächstes{s.context ? ` aus: ${s.context.name}` : ''}
              {s.shuffle ? ' (zufällig)' : ''}
            </Txt>
            {upcoming.slice(0, 100).map(({ track, orderPos }) => (
              <TrackRow
                key={`${track.id}-${orderPos}`}
                track={track}
                onPress={() => jumpTo(orderPos)}
                right={<IconButton name="close" size={20} color={t.textDim} onPress={() => removeUpcoming(orderPos)} label="Entfernen" />}
              />
            ))}
          </>
        ) : (
          <Txt dim style={{ padding: 16 }}>
            {s.repeat === 'all' ? 'Danach beginnt die Wiedergabe von vorn.' : 'Danach geht es mit Autoplay weiter (ähnliche Songs), sofern aktiviert.'}
          </Txt>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  section: { paddingHorizontal: 16, marginTop: 18, marginBottom: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 18, marginBottom: 6 },
});
