import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { activeLineIndex, lineProgress } from '../lib/lyrics';
import type { LyricLine } from '../lib/types';

interface Props {
  lines: LyricLine[];
  position: number;
  onSeek?: (time: number) => void;
  fontSize?: number;
  activeColor: string;
  inactiveColor: string;
  pastColor?: string;
  /** Fill the active line word-by-word (karaoke style). */
  karaoke?: boolean;
  highlightColor?: string;
  /** Fraction of the viewport height where the active line sits. */
  anchor?: number;
  scrollEnabled?: boolean;
}

/** Auto-scrolling synced lyrics. Tap a line to jump there. */
export function LyricsView({
  lines,
  position,
  onSeek,
  fontSize = 26,
  activeColor,
  inactiveColor,
  pastColor,
  karaoke,
  highlightColor,
  anchor = 0.35,
  scrollEnabled = true,
}: Props) {
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const height = useRef(0);
  const userScrolling = useRef(0);
  const active = activeLineIndex(lines, position);

  useEffect(() => {
    if (Date.now() - userScrolling.current < 3000) return;
    const y = offsets.current[Math.max(0, active)];
    if (y === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, y - height.current * anchor), animated: true });
  }, [active, anchor]);

  return (
    <ScrollView
      ref={scroll}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => (height.current = e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => (userScrolling.current = Date.now())}
      onMomentumScrollEnd={() => (userScrolling.current = Date.now())}
      contentContainerStyle={{ paddingVertical: 40, paddingHorizontal: 22 }}
    >
      {lines.map((line, i) => {
        const isActive = i === active;
        const color = isActive ? activeColor : i < active ? pastColor ?? inactiveColor : inactiveColor;
        const textStyle = { fontSize, lineHeight: fontSize * 1.3, fontWeight: '800' as const };
        return (
          <Pressable
            key={`${i}-${line.time}`}
            onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}
            onPress={() => onSeek?.(line.time)}
            style={styles.line}
          >
            {line.text ? (
              karaoke && isActive ? (
                <KaraokeLine line={line} position={position} style={textStyle} base={inactiveColor} fill={highlightColor ?? activeColor} />
              ) : (
                <Text style={[textStyle, { color, opacity: isActive ? 1 : 0.85 }]}>{line.text}</Text>
              )
            ) : (
              <Text style={[textStyle, { color, fontSize: fontSize * 0.8 }]}>♪</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Splits a line into words and colors each by how far the singer should be. */
export function KaraokeLine({
  line,
  position,
  style,
  base,
  fill,
}: {
  line: LyricLine;
  position: number;
  style: object;
  base: string;
  fill: string;
}) {
  const progress = lineProgress(line, position);
  const total = line.text.length || 1;
  const parts: { w: string; start: number; end: number }[] = [];
  let consumed = 0;
  for (const w of line.text.split(/(\s+)/)) {
    parts.push({ w, start: consumed / total, end: (consumed + w.length) / total });
    consumed += w.length;
  }
  return (
    <Text style={style}>
      {parts.map(({ w, start, end }, i) => {
        const done = progress >= end;
        const partial = !done && progress > start;
        return (
          <Text key={i} style={{ color: done || partial ? fill : base, opacity: partial ? 0.75 : 1 }}>
            {w}
          </Text>
        );
      })}
    </Text>
  );
}

export function PlainLyrics({ text, color, fontSize = 20 }: { text: string; color: string; fontSize?: number }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 22 }}>
      <View>
        <Text style={{ color, fontSize, lineHeight: fontSize * 1.45, fontWeight: '700' }}>{text}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: 8 },
});
