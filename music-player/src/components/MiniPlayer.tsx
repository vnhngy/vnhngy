import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { next, toggle } from '../audio/engine';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { Artwork } from './Artwork';
import { IconButton, Txt } from './ui';

export function MiniPlayer() {
  const t = useTheme();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const progress = usePlayer((s) => (s.duration > 0 ? s.position / s.duration : 0));
  const liked = useLibrary((s) => (current ? !!s.liked[current.id] : false));
  const toggleLike = useLibrary((s) => s.toggleLike);

  if (!current) return null;

  return (
    <Pressable onPress={() => router.push('/player')} style={[styles.wrap, { backgroundColor: t.elevated }]}>
      <View style={styles.row}>
        <Artwork uri={current.artwork} seed={current.id} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt bold size={14} lines={1}>
            {current.title}
          </Txt>
          <Txt dim size={13} lines={1}>
            {current.artist}
          </Txt>
        </View>
        <IconButton
          name={liked ? 'heart' : 'heart-outline'}
          color={liked ? t.accent : t.text}
          onPress={() => toggleLike(current)}
          label="Gefällt mir"
        />
        {buffering ? (
          <ActivityIndicator color={t.text} style={{ width: 32 }} />
        ) : (
          <IconButton name={playing ? 'pause' : 'play'} size={28} onPress={toggle} label={playing ? 'Pause' : 'Abspielen'} />
        )}
        <IconButton name="play-skip-forward" size={22} onPress={() => next()} label="Weiter" />
      </View>
      <View style={[styles.progressTrack, { backgroundColor: 'rgba(127,127,127,0.3)' }]}>
        <View style={{ width: `${progress * 100}%`, height: 2, backgroundColor: t.text }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 8, marginBottom: 6, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10 },
  progressTrack: { height: 2, marginHorizontal: 8 },
});
