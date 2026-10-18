import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { Chip, Header, PrimaryButton, Screen, Txt } from '../components/ui';
import { GENRES } from '../lib/audius';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { toast } from '../store/ui';

export default function EditTrackScreen() {
  const t = useTheme();
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const track = useLibrary((s) => s.tracks[trackId]);
  const updateTrack = useLibrary((s) => s.updateTrack);
  const [title, setTitle] = useState(track?.title ?? '');
  const [artist, setArtist] = useState(track?.artist ?? '');
  const [album, setAlbum] = useState(track?.album ?? '');
  const [genre, setGenre] = useState(track?.genre ?? '');

  if (!track) return null;

  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <View style={{ marginTop: 14 }}>
      <Txt dim size={13}>
        {label}
      </Txt>
      <TextInput value={value} onChangeText={onChange} style={[styles.input, { color: t.text, borderColor: t.border }]} placeholderTextColor={t.textMuted} />
    </View>
  );

  return (
    <Screen padTop={false}>
      <Header title="Songdetails bearbeiten" back />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <Artwork uri={track.artwork} seed={track.id} size={120} />
        </View>
        {field('Titel', title, setTitle)}
        {field('Künstler', artist, setArtist)}
        {field('Album', album, setAlbum)}
        {field('Genre', genre, setGenre)}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {GENRES.map((g) => (
            <Chip key={g.name} label={g.label} active={genre === g.name} onPress={() => setGenre(g.name)} />
          ))}
        </View>
        <Txt dim size={12} style={{ marginTop: 10, lineHeight: 17 }}>
          Korrekte Angaben zu Titel und Künstler helfen, den passenden Songtext für Lyrics und Karaoke zu finden.
        </Txt>
        <PrimaryButton
          label="Speichern"
          style={{ marginTop: 24 }}
          onPress={() => {
            const patch = { title: title.trim() || track.title, artist: artist.trim() || track.artist, album: album.trim() || undefined, genre: genre.trim() || undefined };
            updateTrack(track.id, patch);
            const cur = usePlayer.getState();
            if (cur.current?.id === track.id) usePlayer.setState({ current: { ...cur.current, ...patch } });
            usePlayer.setState((s) => ({ tracks: s.tracks.map((x) => (x.id === track.id ? { ...x, ...patch } : x)) }));
            toast('Gespeichert');
            router.back();
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 4 },
});
