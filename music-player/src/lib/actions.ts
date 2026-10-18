import { Alert, Share } from 'react-native';
import { useLibrary } from '../store/library';
import { toast } from '../store/ui';
import { deleteLocalFile, downloadTrack } from './files';
import type { Track } from './types';

const inFlight = new Set<string>();

export async function downloadTracks(tracks: Track[]) {
  const lib = useLibrary.getState();
  const todo = tracks.filter((t) => t.source === 'audius' && !lib.downloads[t.id] && !inFlight.has(t.id));
  if (!todo.length) {
    toast('Bereits heruntergeladen');
    return;
  }
  toast(todo.length === 1 ? 'Download gestartet …' : `${todo.length} Downloads gestartet …`);
  let ok = 0;
  for (const t of todo) {
    inFlight.add(t.id);
    try {
      const uri = await downloadTrack(t);
      useLibrary.getState().upsertTracks([t]);
      useLibrary.getState().setDownload(t.id, uri);
      ok++;
    } catch {
      // reported below
    } finally {
      inFlight.delete(t.id);
    }
  }
  toast(ok === todo.length ? `${ok} ${ok === 1 ? 'Song' : 'Songs'} offline verfügbar` : `${ok} von ${todo.length} Downloads erfolgreich`);
}

export function removeDownload(track: Track) {
  const uri = useLibrary.getState().downloads[track.id];
  if (uri) deleteLocalFile(uri);
  useLibrary.getState().removeDownload(track.id);
  toast('Download entfernt');
}

export function shareTrack(track: Track) {
  const link = track.source === 'audius' ? `\nhttps://audius.co/tracks/${track.id.replace('audius:', '')}` : '';
  Share.share({ message: `🎵 ${track.title} – ${track.artist}${link}\n\nGehört mit Klangraum` }).catch(() => {});
}

export function shareTrackList(name: string, tracks: Track[]) {
  const lines = tracks.map((t, i) => `${i + 1}. ${t.title} – ${t.artist}`).join('\n');
  Share.share({ message: `🎧 Playlist „${name}“\n\n${lines}\n\nErstellt mit Klangraum` }).catch(() => {});
}

export function confirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Abbrechen', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function deleteLocalTrack(track: Track) {
  confirm('Aus Bibliothek entfernen?', `„${track.title}“ wird von diesem Gerät gelöscht.`, 'Entfernen', () => {
    if (track.uri) deleteLocalFile(track.uri);
    useLibrary.getState().removeLocalTrack(track.id);
    toast('Song entfernt');
  });
}
