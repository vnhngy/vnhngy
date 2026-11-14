import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { View, type ColorValue } from 'react-native';
import { MiniPlayer } from '../../components/MiniPlayer';
import { useTheme } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (title: string, icon: IconName, iconActive: IconName) => ({
  title,
  tabBarIcon: ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? iconActive : icon} size={size} color={color as string} />
  ),
});

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.dark ? 'rgba(18,18,18,0.98)' : 'rgba(250,250,250,0.98)', borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
      tabBar={(props) => (
        <View style={{ backgroundColor: t.bg }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="index" options={tab('Start', 'home-outline', 'home')} />
      <Tabs.Screen name="search" options={tab('Suchen', 'search-outline', 'search')} />
      <Tabs.Screen name="library" options={tab('Bibliothek', 'library-outline', 'library')} />
      <Tabs.Screen name="karaoke" options={tab('Karaoke', 'mic-outline', 'mic')} />
    </Tabs>
  );
}
