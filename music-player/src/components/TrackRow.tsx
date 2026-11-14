import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatTime } from '../lib/format';
import { useTheme } from '../lib/theme';
import type { Track } from '../lib/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { Artwork } from './Artwork';
import { IconButton, Txt } from './ui';

interface Props {
  track: Track;
  onPress: () => void;
  index?: number;
  showArtwork?: boolean;
  playlistId?: string;
  playlistIndex?: number;
  right?: React.ReactNode;
  subtitle?: string;
}

export const TrackRow = memo(function TrackRow({ track, onPress, index, showArtwork = true, playlistId, playlistIndex, right, subtitle }: Props) {
  const t = useTheme();
  const isCurrent = usePlayer((s) => s.current?.id === track.id);
  const isPlaying = usePlayer((s) => s.current?.id === track.id && s.playing);
  const downloaded = useLibrary((s) => !!s.downloads[track.id]);
  const liked = useLibrary((s) => !!s.liked[track.id]);
  const openMenu = useUi((s) => s.openTrackMenu);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => openMenu({ track, playlistId, playlistIndex })}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}
    >
      {index !== undefined && !showArtwork ? (
        <View style={styles.index}>
          {isCurrent ? (
            <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={t.accent} />
          ) : (
            <Txt dim>{index + 1}</Txt>
          )}
        </View>
      ) : null}
      {showArtwork ? <Artwork uri={track.artwork} seed={track.id} size={50} /> : null}
      <View style={styles.meta}>
        <Txt lines={1} size={16} color={isCurrent ? t.accent : undefined} bold={isCurrent}>
          {track.title}
        </Txt>
        <View style={styles.sub}>
          {liked ? <Ionicons name="heart" size={12} color={t.accent} style={{ marginRight: 4 }} /> : null}
          {downloaded || track.source === 'local' ? (
            <Ionicons name="arrow-down-circle" size={13} color={t.accent} style={{ marginRight: 4 }} />
          ) : null}
          <Txt dim size={13} lines={1} style={{ flexShrink: 1 }}>
            {subtitle ?? `${track.artist}${track.duration ? ` · ${formatTime(track.duration)}` : ''}`}
          </Txt>
        </View>
      </View>
      {right ?? (
        <IconButton name="ellipsis-vertical" size={20} color={t.textDim} onPress={() => openMenu({ track, playlistId, playlistIndex })} label="Optionen" />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, gap: 12 },
  index: { width: 26, alignItems: 'center' },
  meta: { flex: 1, minWidth: 0 },
  sub: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
});
