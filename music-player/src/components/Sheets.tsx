import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addToQueue, playNext, startRadio } from '../audio/engine';
import { deleteLocalTrack, downloadTracks, removeDownload, shareTrack } from '../lib/actions';
import { useTheme } from '../lib/theme';
import { useLibrary } from '../store/library';
import { toast, useUi } from '../store/ui';
import { Artwork } from './Artwork';
import { ListItem, PrimaryButton, Txt } from './ui';

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.grabber, { backgroundColor: t.textMuted }]} />
        {children}
      </View>
    </Modal>
  );
}

export function TrackMenuSheet() {
  const t = useTheme();
  const target = useUi((s) => s.trackMenu);
  const close = useUi((s) => s.closeTrackMenu);
  const openAdd = useUi((s) => s.openAddToPlaylist);
  const liked = useLibrary((s) => (target ? !!s.liked[target.track.id] : false));
  const downloaded = useLibrary((s) => (target ? !!s.downloads[target.track.id] : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);

  const track = target?.track;
  const run = (fn: () => void) => () => {
    close();
    setTimeout(fn, 250);
  };

  return (
    <Sheet visible={!!target} onClose={close}>
      {track ? (
        <ScrollView style={{ maxHeight: 560 }}>
          <View style={styles.head}>
            <Artwork uri={track.artwork} seed={track.id} size={52} />
            <View style={{ flex: 1 }}>
              <Txt bold size={16} lines={1}>
                {track.title}
              </Txt>
              <Txt dim size={13} lines={1}>
                {track.artist}
              </Txt>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <ListItem
            icon={liked ? 'heart' : 'heart-outline'}
            title={liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen'}
            onPress={run(() => toast(toggleLike(track) ? 'Zu Lieblingssongs hinzugefügt' : 'Aus Lieblingssongs entfernt'))}
          />
          <ListItem icon="add-circle-outline" title="Zur Playlist hinzufügen" onPress={run(() => openAdd([track]))} />
          <ListItem icon="play-forward-outline" title="Als Nächstes spielen" onPress={run(() => (playNext(track), toast('Spielt als Nächstes')))} />
          <ListItem icon="list-outline" title="Zur Warteschlange hinzufügen" onPress={run(() => (addToQueue([track]), toast('Zur Warteschlange hinzugefügt')))} />
          {target?.playlistId !== undefined && target.playlistIndex !== undefined ? (
            <ListItem
              icon="remove-circle-outline"
              title="Aus dieser Playlist entfernen"
              onPress={run(() => removeFromPlaylist(target.playlistId!, target.playlistIndex!))}
            />
          ) : null}
          <ListItem icon="mic-outline" title="Karaoke singen" onPress={run(() => router.push({ pathname: '/karaoke-session', params: { trackId: track.id } }))} />
          <ListItem icon="text-outline" title="Songtext anzeigen" onPress={run(() => router.push({ pathname: '/lyrics', params: { trackId: track.id } }))} />
          <ListItem icon="radio-outline" title="Song-Radio starten" onPress={run(() => startRadio(track).catch(() => toast('Radio konnte nicht gestartet werden')))} />
          {track.source === 'audius' ? (
            downloaded ? (
              <ListItem icon="trash-outline" title="Download entfernen" onPress={run(() => removeDownload(track))} />
            ) : (
              <ListItem icon="arrow-down-circle-outline" title="Herunterladen" onPress={run(() => downloadTracks([track]))} />
            )
          ) : null}
          {track.artistId ? (
            <ListItem icon="person-outline" title="Zum Künstler" onPress={run(() => router.push(`/artist/${track.artistId}`))} />
          ) : (
            <ListItem
              icon="person-outline"
              title="Zum Künstler"
              onPress={run(() => router.push(`/artist/${encodeURIComponent(`local:${track.artist}`)}`))}
            />
          )}
          {track.source === 'local' ? (
            <>
              <ListItem icon="create-outline" title="Details bearbeiten" onPress={run(() => router.push({ pathname: '/edit-track', params: { trackId: track.id } }))} />
              <ListItem icon="trash-outline" title="Vom Gerät löschen" danger onPress={run(() => deleteLocalTrack(track))} />
            </>
          ) : null}
          <ListItem icon="share-outline" title="Teilen" onPress={run(() => shareTrack(track))} />
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

export function AddToPlaylistSheet() {
  const t = useTheme();
  const tracks = useUi((s) => s.addToPlaylist);
  const closeSheet = useUi((s) => s.closeAddToPlaylist);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const close = () => {
    setCreating(false);
    setNewName('');
    closeSheet();
  };

  const add = (id: string, name: string) => {
    if (!tracks) return;
    const n = addToPlaylist(id, tracks);
    close();
    toast(n ? `Zu „${name}“ hinzugefügt` : 'Bereits in dieser Playlist');
  };

  return (
    <Sheet visible={!!tracks} onClose={close}>
      <Txt bold size={18} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        Zur Playlist hinzufügen
      </Txt>
      {creating ? (
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
          <TextInput
            autoFocus
            value={newName}
            onChangeText={setNewName}
            placeholder="Name der Playlist"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { color: t.text, borderColor: t.accent }]}
            onSubmitEditing={() => {
              if (!tracks) return;
              const name = newName.trim() || 'Neue Playlist';
              createPlaylist(name, tracks.map((x) => x.id));
              useLibrary.getState().upsertTracks(tracks);
              close();
              toast(`Playlist „${name}“ erstellt`);
            }}
          />
          <Txt dim size={12}>
            Mit Enter bestätigen
          </Txt>
        </View>
      ) : (
        <ListItem icon="add" title="Neue Playlist" onPress={() => setCreating(true)} />
      )}
      <ScrollView style={{ maxHeight: 380 }}>
        {playlists.map((p) => (
          <ListItem key={p.id} icon="musical-notes-outline" title={p.name} subtitle={`${p.trackIds.length} Songs`} onPress={() => add(p.id, p.name)} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function Toast() {
  const t = useTheme();
  const toastState = useUi((s) => s.toast);
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const message = toastState?.message ?? '';

  useEffect(() => {
    if (!toastState) return;
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1900),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [toastState, opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity, bottom: insets.bottom + 140, backgroundColor: t.dark ? '#FFFFFF' : '#222222' }]}>
      <Ionicons name="checkmark-circle" size={18} color={t.dark ? '#111' : '#fff'} />
      <Txt color={t.dark ? '#111' : '#fff'} bold size={14} style={{ flexShrink: 1 }}>
        {message}
      </Txt>
    </Animated.View>
  );
}

export function PromptSheet({
  visible,
  title,
  initial,
  placeholder,
  onSubmit,
  onClose,
  multiline,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  multiline?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {visible ? <PromptBody title={title} initial={initial} placeholder={placeholder} onSubmit={onSubmit} onClose={onClose} multiline={multiline} /> : null}
    </Sheet>
  );
}

function PromptBody({
  title,
  initial,
  placeholder,
  onSubmit,
  onClose,
  multiline,
}: {
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  multiline?: boolean;
}) {
  const t = useTheme();
  const [value, setValue] = useState(initial ?? '');
  return (
    <>
      <View style={{ padding: 16, gap: 14 }}>
        <Txt bold size={18}>
          {title}
        </Txt>
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={t.textMuted}
          multiline={multiline}
          style={[styles.input, { color: t.text, borderColor: t.accent, minHeight: multiline ? 160 : undefined, textAlignVertical: 'top' }]}
        />
        <PrimaryButton
          label="Speichern"
          onPress={() => {
            onSubmit(value);
            onClose();
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8, opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
});
