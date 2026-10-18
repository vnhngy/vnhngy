import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { formatTime } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Txt } from './ui';

interface Props {
  value: number;
  max: number;
  onSeek: (value: number) => void;
  showTimes?: boolean;
  color?: string;
  formatValue?: (v: number) => string;
}

/** Draggable progress / value slider without native dependencies. */
export function SeekBar({ value, max, onSeek, showTimes = true, color, formatValue = formatTime }: Props) {
  const t = useTheme();
  const width = useRef(1);
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const grantX = useRef(0);
  const maxRef = useRef(max);
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    maxRef.current = max;
    onSeekRef.current = onSeek;
  });

  const valueAt = (x: number) => Math.max(0, Math.min(1, x / width.current)) * maxRef.current;

  // Refs are only read inside the gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        grantX.current = e.nativeEvent.locationX;
        dragRef.current = valueAt(grantX.current);
        setDrag(dragRef.current);
      },
      onPanResponderMove: (_e, g) => {
        dragRef.current = valueAt(grantX.current + g.dx);
        setDrag(dragRef.current);
      },
      onPanResponderRelease: () => {
        if (dragRef.current != null) onSeekRef.current(dragRef.current);
        dragRef.current = null;
        setDrag(null);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDrag(null);
      },
    }),
  );

  const shown = drag ?? value;
  const pct = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0;
  const fill = color ?? (drag != null ? t.accent : t.text);

  return (
    <View>
      <View
        style={styles.touch}
        onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width || 1)}
        {...responder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: t.dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)' }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fill }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${pct * 100}%`, backgroundColor: fill, transform: [{ scale: drag != null ? 1.4 : 1 }] }]} />
      </View>
      {showTimes ? (
        <View style={styles.times}>
          <Txt dim size={12}>
            {formatValue(shown)}
          </Txt>
          <Txt dim size={12}>
            {max > 0 ? (formatValue === formatTime ? `-${formatTime(Math.max(0, max - shown))}` : formatValue(max)) : '--:--'}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, top: 8 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
});
