import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Collection } from '../../components/Collection';
import { EmptyState } from '../../components/ui';
import { downloadTracks, shareTrackList } from '../../lib/actions';
import { audius } from '../../lib/audius';
import { useAsync } from '../../lib/useAsync';
import { useLibrary } from '../../store/library';
import { toast, useUi } from '../../store/ui';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = useAsync(`playlist:${id}`, () => audius.playlist(id));
  const tracks = useAsync(`playlist-tracks:${id}`, () => audius.playlistTracks(id));
  const saved = useLibrary((s) => s.savedAlbums.some((a) => a.id === id));
  const toggleSave = useLibrary((s) => s.toggleSaveAlbum);
  const pushRecent = useLibrary((s) => s.pushRecent);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const upsertTracks = useLibrary((s) => s.upsertTracks);
  const openAdd = useUi((s) => s.openAddToPlaylist);

  useEffect(() => {
    if (album.data) pushRecent({ kind: 'album', id, name: album.data.name, artwork: album.data.artwork });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.data]);

  if (album.error && !album.data) {
    return <EmptyState icon="cloud-offline-outline" title="Konnte nicht geladen werden" text={album.error} />;
  }

  const list = tracks.data ?? [];
  const a = album.data;

  return (
    <Collection
      title={a?.name ?? ''}
      subtitle={a ? `${a.isAlbum ? 'Album' : 'Playlist'} · ${a.artist}` : undefined}
      description={a?.description}
      seed={id}
      artwork={a?.artwork}
      tracks={list}
      loading={tracks.loading}
      error={tracks.error}
      onRefresh={tracks.reload}
      context={{ type: 'album', id, name: a?.name ?? 'Album' }}
      actions={
        a
          ? [
              {
                icon: saved ? 'checkmark-circle' : 'add-circle-outline',
                label: saved ? 'Gespeichert' : 'In Bibliothek speichern',
                active: saved,
                onPress: () => toast(toggleSave(a) ? 'In deiner Bibliothek gespeichert' : 'Aus Bibliothek entfernt'),
              },
              { icon: 'arrow-down-circle-outline', label: 'Alle herunterladen', onPress: () => downloadTracks(list) },
              {
                icon: 'copy-outline',
                label: 'Als eigene Playlist kopieren',
                onPress: () => {
                  upsertTracks(list);
                  createPlaylist(a.name, list.map((x) => x.id), `Kopie von ${a.artist}`);
                  toast('Als Playlist kopiert');
                },
              },
              { icon: 'albums-outline', label: 'Zu Playlist hinzufügen', onPress: () => openAdd(list) },
              { icon: 'share-outline', label: 'Teilen', onPress: () => shareTrackList(a.name, list) },
            ]
          : []
      }
      empty={<EmptyState icon="musical-notes-outline" title="Keine Songs" />}
    />
  );
}
