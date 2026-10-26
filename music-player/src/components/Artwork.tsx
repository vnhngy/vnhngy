import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { coverColors } from '../lib/format';

interface Props {
  uri?: string;
  seed: string;
  size: number;
  radius?: number;
  round?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  colors?: [string, string];
  style?: ViewStyle;
}

export function Artwork({ uri, seed, size, radius = 4, round, icon = 'musical-notes', colors, style }: Props) {
  const r = round ? size / 2 : radius;
  const box = { width: size, height: size, borderRadius: r, overflow: 'hidden' as const };
  if (uri) {
    return (
      <View style={[box, style]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={uri} />
      </View>
    );
  }
  return (
    <LinearGradient colors={colors ?? coverColors(seed)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[box, styles.center, style]}>
      <Ionicons name={icon} size={size * 0.42} color="rgba(255,255,255,0.9)" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
