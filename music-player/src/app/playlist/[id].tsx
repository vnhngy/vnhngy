import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Collection } from '../../components/Collection';
import { PromptSheet, Sheet } from '../../components/Sheets';
import { EmptyState, IconButton, ListItem, PrimaryButton, Txt } from '../../components/ui';
import { confirm, downloadTracks, shareTrackList } from '../../lib/actions';
import { importAudioFiles } from '../../lib/files';
import { useTheme } from '../../lib/theme';
import type { Track } from '../../lib/types';
import { likedTracks, useLibrary } from '../../store/library';
import { toast } from '../../store/ui';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const lib = useLibrary();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<'name' | 'description' | null>(null);
  const [reorder, setReorder] = useState(false);

  const playlist = lib.playlists.find((p) => p.id === id);

  const tracks: Track[] = useMemo(() => {
    if (id === 'liked') return likedTracks(lib);
    if (id === 'downloads') return Object.keys(lib.downloads).map((tid) => lib.tracks[tid]).filter(Boolean);
    if (id === 'local') return lib.localIds.map((tid) => lib.tracks[tid]).filter(Boolean);
    return (playlist?.trackIds ?? []).map((tid) => lib.tracks[tid]).filter(Boolean);
  }, [id, lib, playlist]);

  const special = id === 'liked' || id === 'downloads' || id === 'local';
  const title = id === 'liked' ? 'Lieblingssongs' : id === 'downloads' ? 'Downloads' : id === 'local' ? 'Auf dem Gerät' : playlist?.name ?? 'Playlist';

  useEffect(() => {
    if (playlist) lib.pushRecent({ kind: 'playlist', id: playlist.id, name: playlist.name, artwork: tracks[0]?.artwork });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.id]);

  if (!special && !playlist) {
    return <EmptyState icon="alert-circle-outline" title="Playlist nicht gefunden" text="Sie wurde vielleicht gelöscht." />;
  }

  const importFiles = async () => {
    try {
      const imported = await importAudioFiles();
      if (imported.length) {
        lib.addLocalTracks(imported);
        toast(`${imported.length} Songs importiert`);
      }
    } catch {
      toast('Import fehlgeschlagen');
    }
  };

  const actions = [
    ...(tracks.some((tr) => tr.source === 'audius')
      ? [{ icon: 'arrow-down-circle-outline' as const, label: 'Alle herunterladen', onPress: () => downloadTracks(tracks) }]
      : []),
    ...(id === 'local' ? [{ icon: 'add-circle-outline' as const, label: 'Importieren', onPress: importFiles }] : []),
    { icon: 'share-outline' as const, label: 'Teilen', onPress: () => shareTrackList(title, tracks) },
    ...(playlist ? [{ icon: 'ellipsis-horizontal' as const, label: 'Mehr', onPress: () => setMenu(true) }] : []),
  ];

  return (
    <>
      <Collection
        title={title}
        subtitle={playlist ? 'Deine Playlist' : undefined}
        description={playlist?.description}
        seed={id}
        artwork={special ? undefined : tracks[0]?.artwork}
        icon={id === 'liked' ? 'heart' : id === 'downloads' ? 'arrow-down-circle' : id === 'local' ? 'phone-portrait' : 'musical-notes'}
        colors={id === 'liked' ? ['#4A1FFF', '#A4C8D8'] : id === 'downloads' ? ['#0B7A3E', '#1ED760'] : id === 'local' ? ['#E8115B', '#F59B23'] : undefined}
        tracks={tracks}
        context={{ type: id === 'liked' ? 'liked' : 'playlist', id, name: title }}
        actions={actions}
        playlistId={playlist?.id}
        headerExtra={
          reorder ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 }}>
              <Txt dim style={{ flex: 1 }}>
                Reihenfolge ändern
              </Txt>
              <PrimaryButton label="Fertig" variant="subtle" onPress={() => setReorder(false)} style={{ paddingVertical: 6 }} />
            </View>
          ) : null
        }
        renderRight={
          reorder && playlist
            ? (_tr, index) => (
                <View style={{ flexDirection: 'row' }}>
                  <IconButton name="chevron-up" disabled={index === 0} onPress={() => lib.movePlaylistTrack(playlist.id, index, index - 1)} />
                  <IconButton
                    name="chevron-down"
                    disabled={index === tracks.length - 1}
                    onPress={() => lib.movePlaylistTrack(playlist.id, index, index + 1)}
                  />
                  <IconButton name="remove-circle-outline" color={t.danger} onPress={() => lib.removeFromPlaylist(playlist.id, index)} />
                </View>
              )
            : undefined
        }
        empty={
          id === 'liked' ? (
            <EmptyState icon="heart-outline" title="Songs, die dir gefallen" text="Tippe bei einem Song auf ♥, um ihn hier zu speichern." />
          ) : id === 'downloads' ? (
            <EmptyState icon="arrow-down-circle-outline" title="Noch keine Downloads" text="Lade Songs herunter, um sie ohne Internet zu hören." />
          ) : id === 'local' ? (
            <EmptyState icon="folder-open-outline" title="Eigene Musik importieren" text="Füge MP3s und andere Audiodateien von deinem Gerät hinzu.">
              <PrimaryButton label="Dateien auswählen" icon="add" onPress={importFiles} />
            </EmptyState>
          ) : (
            <EmptyState icon="musical-notes-outline" title="Lass uns deine Playlist füllen" text="Tippe bei einem Song auf ⋮ und wähle „Zur Playlist hinzufügen“.">
              <PrimaryButton label="Songs suchen" icon="search" onPress={() => router.push('/search')} />
            </EmptyState>
          )
        }
      />

      {playlist ? (
        <>
          <Sheet visible={menu} onClose={() => setMenu(false)}>
            <ListItem icon="create-outline" title="Namen ändern" onPress={() => (setMenu(false), setTimeout(() => setEditing('name'), 300))} />
            <ListItem
              icon="document-text-outline"
              title="Beschreibung bearbeiten"
              onPress={() => (setMenu(false), setTimeout(() => setEditing('description'), 300))}
            />
            <ListItem icon="swap-vertical" title="Reihenfolge ändern" onPress={() => (setMenu(false), setReorder(true))} />
            <ListItem
              icon={playlist.pinned ? 'pin' : 'pin-outline'}
              title={playlist.pinned ? 'Nicht mehr anheften' : 'Anheften'}
              onPress={() => (setMenu(false), lib.updatePlaylist(playlist.id, { pinned: !playlist.pinned }))}
            />
            <ListItem
              icon="copy-outline"
              title="Duplizieren"
              onPress={() => {
                setMenu(false);
                lib.createPlaylist(`${playlist.name} (Kopie)`, playlist.trackIds, playlist.description);
                toast('Playlist dupliziert');
              }}
            />
            <ListItem
              icon="trash-outline"
              title="Playlist löschen"
              danger
              onPress={() => {
                setMenu(false);
                confirm('Playlist löschen?', `„${playlist.name}“ wird dauerhaft gelöscht.`, 'Löschen', () => {
                  lib.deletePlaylist(playlist.id);
                  router.back();
                });
              }}
            />
          </Sheet>
          <PromptSheet
            visible={editing !== null}
            title={editing === 'name' ? 'Playlist umbenennen' : 'Beschreibung'}
            initial={editing === 'name' ? playlist.name : playlist.description}
            multiline={editing === 'description'}
            onClose={() => setEditing(null)}
            onSubmit={(v) => lib.updatePlaylist(playlist.id, editing === 'name' ? { name: v.trim() || playlist.name } : { description: v.trim() })}
          />
        </>
      ) : null}
    </>
  );
}
