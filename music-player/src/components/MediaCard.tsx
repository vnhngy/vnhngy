import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Artwork } from './Artwork';
import type { IconName } from './ui';
import { Txt } from './ui';

export interface CardItem {
  key: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  round?: boolean;
  icon?: IconName;
  colors?: [string, string];
  onPress: () => void;
}

export function MediaCard({ item, size = 150 }: { item: CardItem; size?: number }) {
  return (
    <Pressable onPress={item.onPress} style={({ pressed }) => [{ width: size, opacity: pressed ? 0.7 : 1 }]}>
      <Artwork uri={item.artwork} seed={item.key} size={size} round={item.round} radius={6} icon={item.icon} colors={item.colors} />
      <Txt bold size={14} lines={2} style={{ marginTop: 8, textAlign: item.round ? 'center' : 'left' }}>
        {item.title}
      </Txt>
      {item.subtitle ? (
        <Txt dim size={12} lines={2} style={{ marginTop: 2, textAlign: item.round ? 'center' : 'left' }}>
          {item.subtitle}
        </Txt>
      ) : null}
    </Pressable>
  );
}

export function CardRow({ items, size }: { items: CardItem[]; size?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => (
        <MediaCard key={item.key} item={item} size={size} />
      ))}
    </ScrollView>
  );
}

export function QuickTile({ item }: { item: CardItem }) {
  return (
    <Pressable onPress={item.onPress} style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}>
      <Artwork uri={item.artwork} seed={item.key} size={54} radius={0} icon={item.icon} colors={item.colors} />
      <View style={{ flex: 1, paddingHorizontal: 8 }}>
        <Txt bold size={13} lines={2}>
          {item.title}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 14 },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(127,127,127,0.18)',
  },
});
