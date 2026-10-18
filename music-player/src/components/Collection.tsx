import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playList, toggle } from '../audio/engine';
import { coverColors, formatDuration } from '../lib/format';
import { useTheme } from '../lib/theme';
import type { PlayContext, Track } from '../lib/types';
import { usePlayer } from '../store/player';
import { Artwork } from './Artwork';
import { TrackRow } from './TrackRow';
import { IconButton, Loading, PlayFab, Txt, type IconName } from './ui';

interface Action {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  description?: string;
  artwork?: string;
  seed: string;
  icon?: IconName;
  colors?: [string, string];
  round?: boolean;
  tracks: Track[];
  context: PlayContext;
  actions?: Action[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  empty?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  numbered?: boolean;
  playlistId?: string;
  renderRight?: (track: Track, index: number) => ReactNode;
}

export function Collection(p: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const isThisContext = usePlayer((s) => s.context?.type === p.context.type && s.context?.id === p.context.id && !!s.current);
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const total = p.tracks.reduce((a, tr) => a + (tr.duration || 0), 0);
  const [c1] = p.colors ?? coverColors(p.seed);

  const header = (
    <View>
      <LinearGradient colors={[c1, t.bg]} style={[styles.hero, { paddingTop: insets.top + 50 }]}>
        <Artwork uri={p.artwork} seed={p.seed} size={200} round={p.round} radius={6} icon={p.icon} colors={p.colors} style={styles.shadow} />
      </LinearGradient>
      <View style={styles.meta}>
        <Txt bold size={26} lines={2}>
          {p.title}
        </Txt>
        {p.description ? (
          <Txt dim size={13} lines={3} style={{ marginTop: 6 }}>
            {p.description}
          </Txt>
        ) : null}
        <Txt dim size={13} style={{ marginTop: 6 }}>
          {[p.subtitle, p.tracks.length ? `${p.tracks.length} Songs` : null, total ? formatDuration(total) : null].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      <View style={styles.actions}>
        {(p.actions ?? []).map((a) => (
          <IconButton key={a.label} name={a.icon} size={24} color={a.active ? t.accent : t.textDim} onPress={a.onPress} label={a.label} />
        ))}
        <View style={{ flex: 1 }} />
        {p.tracks.length ? (
          <>
            <IconButton
              name="shuffle"
              size={26}
              color={shuffle ? t.accent : t.textDim}
              onPress={() => playList(p.tracks, 0, p.context, { shuffle: true })}
              label="Zufällig abspielen"
            />
            <PlayFab playing={isThisContext && playing} onPress={() => (isThisContext ? toggle() : playList(p.tracks, 0, p.context, { shuffle: false }))} />
          </>
        ) : null}
      </View>
      {p.headerExtra}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={p.tracks}
        keyExtractor={(tr, i) => `${tr.id}-${i}`}
        ListHeaderComponent={header}
        refreshControl={p.onRefresh ? <RefreshControl refreshing={false} onRefresh={p.onRefresh} tintColor={t.accent} /> : undefined}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            showArtwork={!p.numbered}
            playlistId={p.playlistId}
            playlistIndex={p.playlistId ? index : undefined}
            onPress={() => playList(p.tracks, index, p.context, { shuffle: false })}
            right={p.renderRight?.(item, index)}
          />
        )}
        ListEmptyComponent={p.loading ? <Loading /> : p.error ? <Txt dim style={{ padding: 16 }}>{p.error}</Txt> : <>{p.empty}</>}
        ListFooterComponent={<View style={{ paddingBottom: insets.bottom + 40 }}>{p.footer}</View>}
      />
      <View style={[styles.back, { top: insets.top + 4 }]}>
        <IconButton name="chevron-back" size={28} onPress={() => router.back()} label="Zurück" style={styles.backBtn} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 18 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  meta: { paddingHorizontal: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  back: { position: 'absolute', left: 8 },
  backBtn: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, width: 40, height: 40 },
});
