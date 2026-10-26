import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playTrack, seek, toggle } from '../audio/engine';
import { LyricsView, PlainLyrics } from '../components/LyricsView';
import { SeekBar } from '../components/SeekBar';
import { PromptSheet, Sheet } from '../components/Sheets';
import { Chip, IconButton, ListItem, PlayFab, PrimaryButton, Txt } from '../components/ui';
import { pickLyricsFile } from '../lib/files';
import { coverColors } from '../lib/format';
import { lyricsFromRecord, lyricsFromText, searchLyrics, toLrc, type LrclibRecord } from '../lib/lyrics';
import { useTheme } from '../lib/theme';
import { useLyrics } from '../lib/useLyrics';
import { useSmoothPosition } from '../lib/usePosition';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';

export default function LyricsScreen() {
  useKeepAwake();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const duration = usePlayer((s) => s.duration);
  const stored = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const track = stored ?? (current && (!trackId || current.id === trackId) ? current : undefined);
  const isCurrent = !!track && current?.id === track.id;
  const { lyrics, loading, error, notFound, reload } = useLyrics(track);
  const setLyrics = useLibrary((s) => s.setLyrics);
  const setOffset = useLibrary((s) => s.setLyricsOffset);
  const fontSize = useSettings((s) => s.lyricsFontSize);
  const setSettings = useSettings((s) => s.set);
  const smooth = useSmoothPosition(80);
  const [singAlong, setSingAlong] = useState(true);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [alternatives, setAlternatives] = useState<LrclibRecord[] | null>(null);

  if (!track) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Txt dim>Kein Song ausgewählt.</Txt>
        <PrimaryButton label="Schließen" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const offset = lyrics?.offset ?? 0;
  const position = isCurrent ? smooth + offset : -1;
  const [c1, c2] = coverColors(track.id);

  const findAlternatives = async () => {
    setMenu(false);
    try {
      setAlternatives(await searchLyrics(`${track.title} ${track.artist}`));
    } catch {
      toast('Suche fehlgeschlagen');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c1, c2]} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton name="chevron-down" size={28} color="#fff" onPress={() => router.back()} label="Schließen" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt bold color="#fff" lines={1}>
            {track.title}
          </Txt>
          <Txt color="rgba(255,255,255,0.75)" size={13} lines={1}>
            {track.artist}
          </Txt>
        </View>
        <IconButton name="ellipsis-horizontal" color="#fff" onPress={() => setMenu(true)} label="Optionen" />
      </View>

      <View style={{ flex: 1 }}>
        {loading && !lyrics ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : lyrics?.synced?.length ? (
          <LyricsView
            lines={lyrics.synced}
            position={position}
            onSeek={isCurrent ? (time) => seek(Math.max(0, time - offset)) : undefined}
            fontSize={fontSize}
            activeColor="#FFFFFF"
            inactiveColor="rgba(0,0,0,0.55)"
            pastColor="rgba(255,255,255,0.55)"
            karaoke={singAlong}
            highlightColor="#FFFFFF"
          />
        ) : lyrics?.plain ? (
          <PlainLyrics text={lyrics.plain} color="#fff" fontSize={fontSize * 0.8} />
        ) : (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color="#fff" />
            <Txt bold color="#fff" size={18} style={{ marginTop: 12, textAlign: 'center' }}>
              {lyrics?.instrumental ? 'Instrumental' : error ?? (notFound ? 'Kein Songtext gefunden' : 'Kein Songtext')}
            </Txt>
            <View style={{ gap: 10, marginTop: 20 }}>
              <PrimaryButton label="Erneut suchen" icon="refresh" variant="subtle" onPress={reload} />
              <PrimaryButton label="Songtext einfügen" icon="create-outline" variant="subtle" onPress={() => setEditing(true)} />
              <PrimaryButton
                label=".lrc-Datei importieren"
                icon="document-attach-outline"
                variant="subtle"
                onPress={async () => {
                  const text = await pickLyricsFile().catch(() => null);
                  if (text) {
                    setLyrics(track.id, lyricsFromText(text, track.duration));
                    toast('Songtext gespeichert');
                  }
                }}
              />
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {isCurrent ? (
          <>
            <SeekBar value={smooth} max={duration} onSeek={seek} color="#fff" />
            <View style={styles.bottomRow}>
              <Chip label={singAlong ? 'Mitsingen an' : 'Mitsingen aus'} icon="color-wand-outline" active={singAlong} onPress={() => setSingAlong(!singAlong)} />
              <PlayFab playing={playing} onPress={toggle} size={56} />
              <Chip label="Karaoke" icon="mic" onPress={() => router.replace({ pathname: '/karaoke-session', params: { trackId: track.id } })} />
            </View>
          </>
        ) : (
          <PrimaryButton label="Song abspielen" icon="play" onPress={() => playTrack(track)} />
        )}
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <View style={styles.offsetRow}>
          <Txt bold style={{ flex: 1 }}>
            Timing: {offset > 0 ? '+' : ''}
            {offset.toFixed(1).replace('.', ',')} s
          </Txt>
          <IconButton name="remove-circle-outline" size={30} onPress={() => setOffset(track.id, Math.round((offset - 0.5) * 10) / 10)} label="Früher" />
          <IconButton name="refresh-circle-outline" size={30} onPress={() => setOffset(track.id, 0)} label="Zurücksetzen" />
          <IconButton name="add-circle-outline" size={30} onPress={() => setOffset(track.id, Math.round((offset + 0.5) * 10) / 10)} label="Später" />
        </View>
        <Txt dim size={12} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          Wenn der Text zu früh kommt: „+“. Zu spät: „−“.
        </Txt>
        <View style={styles.offsetRow}>
          <Txt bold style={{ flex: 1 }}>
            Schriftgröße
          </Txt>
          <IconButton name="text" size={18} onPress={() => setSettings({ lyricsFontSize: Math.max(16, fontSize - 2) })} label="Kleiner" />
          <IconButton name="text" size={30} onPress={() => setSettings({ lyricsFontSize: Math.min(40, fontSize + 2) })} label="Größer" />
        </View>
        <ListItem icon="search-outline" title="Anderen Songtext wählen" onPress={findAlternatives} />
        <ListItem icon="create-outline" title="Songtext bearbeiten / einfügen" onPress={() => (setMenu(false), setTimeout(() => setEditing(true), 300))} />
        <ListItem
          icon="document-attach-outline"
          title=".lrc-Datei importieren"
          onPress={async () => {
            setMenu(false);
            const text = await pickLyricsFile().catch(() => null);
            if (text) {
              setLyrics(track.id, lyricsFromText(text, track.duration));
              toast('Songtext gespeichert');
            }
          }}
        />
        <ListItem icon="refresh" title="Neu laden" onPress={() => (setMenu(false), reload())} />
      </Sheet>

      <Sheet visible={!!alternatives} onClose={() => setAlternatives(null)}>
        <Txt bold size={18} style={{ padding: 16 }}>
          Songtext auswählen
        </Txt>
        <ScrollView style={{ maxHeight: 420 }}>
          {alternatives?.length ? (
            alternatives.map((rec) => (
              <ListItem
                key={rec.id}
                icon={rec.syncedLyrics ? 'time-outline' : 'document-text-outline'}
                title={`${rec.trackName} – ${rec.artistName}`}
                subtitle={`${rec.syncedLyrics ? 'Synchronisiert' : 'Nur Text'} · ${Math.round(rec.duration / 60)}:${String(Math.round(rec.duration % 60)).padStart(2, '0')}`}
                onPress={() => {
                  setLyrics(track.id, lyricsFromRecord(rec, track.duration));
                  setAlternatives(null);
                  toast('Songtext übernommen');
                }}
              />
            ))
          ) : (
            <Txt dim style={{ padding: 16 }}>
              Keine Alternativen gefunden.
            </Txt>
          )}
        </ScrollView>
      </Sheet>

      <PromptSheet
        visible={editing}
        title="Songtext (LRC oder Klartext)"
        multiline
        initial={lyrics?.synced?.length ? toLrc(lyrics.synced) : lyrics?.plain ?? ''}
        placeholder={'[00:12.50]Erste Zeile\n[00:16.20]Zweite Zeile'}
        onClose={() => setEditing(false)}
        onSubmit={(text) => {
          if (!text.trim()) return;
          setLyrics(track.id, lyricsFromText(text, track.duration));
          toast('Songtext gespeichert');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6 },
  bottom: { paddingHorizontal: 22, paddingTop: 8 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  offsetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});
