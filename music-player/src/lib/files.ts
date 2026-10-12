import * as DocumentPicker from 'expo-document-picker';
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { audius } from './audius';
import { uid } from './format';
import type { Track } from './types';

function dir(name: string): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Parses "Artist - Title" style file names into metadata. */
export function metadataFromFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.-]+/, '');
  const parts = base.split(/\s[-–—]\s/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: 'Unbekannter Künstler', title: base.trim() };
}

/** Reads the duration of a local file by briefly loading it. */
function probeDuration(uri: string): Promise<number> {
  return new Promise((resolve) => {
    const player = createAudioPlayer(uri);
    let settled = false;
    const finish = (d: number) => {
      if (settled) return;
      settled = true;
      sub.remove();
      player.remove();
      resolve(d);
    };
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.isLoaded && s.duration > 0) finish(s.duration);
    });
    setTimeout(() => finish(player.duration || 0), 4000);
  });
}

export async function importAudioFiles(): Promise<Track[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const music = dir('music');
  const tracks: Track[] = [];
  for (const asset of result.assets) {
    const id = uid('local:');
    const ext = asset.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.mp3';
    const dest = new File(music, `${id.replace(':', '_')}${ext}`);
    new File(asset.uri).copySync(dest);
    const meta = metadataFromFileName(asset.name);
    tracks.push({
      id,
      source: 'local',
      title: meta.title,
      artist: meta.artist,
      album: 'Importiert',
      duration: await probeDuration(dest.uri),
      uri: dest.uri,
    });
  }
  return tracks;
}

export async function pickLyricsFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}

export function deleteLocalFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export async function downloadTrack(track: Track): Promise<string> {
  const downloads = dir('downloads');
  const dest = new File(downloads, `${track.id.replace(/[^a-z0-9]/gi, '_')}.mp3`);
  if (dest.exists) dest.delete();
  const url = await audius.streamUrl(track.id);
  const file = await File.downloadFileAsync(url, dest);
  return file.uri;
}

export function storageUsage(): { downloads: number; music: number; recordings: number } {
  const size = (name: string) => {
    const d = new Directory(Paths.document, name);
    return d.exists ? d.size ?? 0 : 0;
  };
  return { downloads: size('downloads'), music: size('music'), recordings: size('recordings') };
}

/** Moves a finished karaoke recording into permanent storage. */
export function persistRecording(tempUri: string, id: string): string {
  const src = new File(tempUri);
  const ext = src.extension || '.m4a';
  const dest = new File(dir('recordings'), `${id}${ext}`);
  src.moveSync(dest);
  return dest.uri;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}
