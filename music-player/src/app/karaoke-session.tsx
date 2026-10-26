import { Ionicons } from '@expo/vector-icons';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  configureAudioSession,
  getVolume,
  onTrackEnd,
  pause,
  play,
  playTrack,
  seek,
  setHoldAtEnd,
  setRate,
  setVolume,
} from '../audio/engine';
import { Artwork } from '../components/Artwork';
import { LyricsView } from '../components/LyricsView';
import { SeekBar } from '../components/SeekBar';
import { Chip, IconButton, PrimaryButton, Txt } from '../components/ui';
import { persistRecording } from '../lib/files';
import { coverColors, uid } from '../lib/format';
import { scorePerformance, type MeterSample } from '../lib/karaoke';
import { activeLineIndex } from '../lib/lyrics';
import { useTheme } from '../lib/theme';
import { useLyrics } from '../lib/useLyrics';
import { useSmoothPosition } from '../lib/usePosition';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';

type Phase = 'setup' | 'countdown' | 'singing' | 'saving';

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export default function KaraokeSession() {
  useKeepAwake();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
  const current = usePlayer((s) => s.current);
  const duration = usePlayer((s) => s.duration);
  const stored = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const track = stored ?? (current && (!trackId || current.id === trackId) ? current : undefined);
  const { lyrics, loading, notFound } = useLyrics(track);
  const settings = useSettings();
  const addRecording = useLibrary((s) => s.addRecording);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const position = useSmoothPosition(60);

  const [phase, setPhaseState] = useState<Phase>('setup');
  const [count, setCount] = useState(0);
  const [recordVoice, setRecordVoice] = useState(true);
  const [tempo, setTempo] = useState(1);
  const [musicVolume, setMusicVolume] = useState(settings.karaokeMusicVolume);
  const [level, setLevel] = useState(0);
  const [liveScore, setLiveScore] = useState<number | null>(null);

  const samples = useRef<MeterSample[]>([]);
  const noise = useRef<number[]>([]);
  const recordStartedAt = useRef(0);
  const songStartedAt = useRef(0);
  const songOffset = useRef(0);
  const phaseRef = useRef<Phase>('setup');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const previous = useRef({ volume: getVolume(), rate: usePlayer.getState().rate });

  const offset = lyrics?.offset ?? 0;
  const lines = useMemo(() => lyrics?.synced ?? [], [lyrics]);
  const lyricPos = position + offset;

  // Restore normal playback when leaving.
  useEffect(() => {
    const prev = previous.current;
    return () => {
      setHoldAtEnd(false);
      setVolume(prev.volume);
      setRate(prev.rate);
      if (recorder.isRecording) recorder.stop().catch(() => {});
      configureAudioSession(false).catch(() => {});
    };
  }, [recorder]);

  useEffect(() => {
    setVolume(musicVolume);
  }, [musicVolume]);

  // Sample the microphone level.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'singing') return;
    const id = setInterval(() => {
      if (!recorder.isRecording) return;
      const db = recorder.getStatus().metering ?? -160;
      setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
      if (phaseRef.current === 'countdown') noise.current.push(db);
      else samples.current.push({ t: usePlayer.getState().position + offset, db });
    }, 100);
    return () => clearInterval(id);
  }, [phase, recorder, offset]);

  // Live score every two seconds.
  useEffect(() => {
    if (phase !== 'singing' || !recordVoice || !lines.length) return;
    const id = setInterval(() => {
      const floor = median(noise.current);
      setLiveScore(scorePerformance(lines, samples.current, floor, settings.karaokeSensitivity).score);
    }, 2000);
    return () => clearInterval(id);
  }, [phase, recordVoice, lines, settings.karaokeSensitivity]);

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'singing' || !track) return;
    setPhase('saving');
    pause();
    let uri: string | null = null;
    if (recordVoice && recorder.isRecording) {
      try {
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        uri = null;
      }
    }
    const sungFor = Math.max(0, usePlayer.getState().position - songOffset.current);
    if (!uri || sungFor < 10) {
      router.back();
      if (recordVoice && sungFor < 10) toast('Zu kurz für eine Bewertung');
      return;
    }
    const id = uid('rec_');
    const result = scorePerformance(lines, samples.current, median(noise.current), settings.karaokeSensitivity);
    let saved: string;
    try {
      saved = persistRecording(uri, id);
    } catch {
      saved = uri;
    }
    addRecording({
      id,
      trackId: track.id,
      singer: settings.singerName,
      uri: saved,
      ...result,
      songOffset: songOffset.current,
      duration: sungFor + (songStartedAt.current - recordStartedAt.current) / 1000,
      lead: (songStartedAt.current - recordStartedAt.current) / 1000,
      createdAt: Date.now(),
    });
    router.replace(`/performance/${id}`);
  }, [track, recordVoice, recorder, lines, settings.karaokeSensitivity, settings.singerName, addRecording]);

  useEffect(() => onTrackEnd(() => setTimeout(() => finish(), 300)), [finish]);

  const start = async () => {
    if (!track) return;
    if (recordVoice) {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Mikrofon nicht erlaubt', 'Ohne Mikrofon kannst du mitsingen, aber es gibt keine Aufnahme und keine Bewertung.', [
          { text: 'OK' },
        ]);
        setRecordVoice(false);
        return;
      }
    }
    setHoldAtEnd(true);
    setRate(tempo);
    setVolume(musicVolume);
    if (usePlayer.getState().current?.id !== track.id) {
      await playTrack(track, { type: 'karaoke', name: 'Karaoke' }).catch(() => {});
    }
    pause();
    await seek(0);
    songOffset.current = 0;

    samples.current = [];
    noise.current = [];
    if (recordVoice) {
      try {
        await configureAudioSession(true);
        await recorder.prepareToRecordAsync();
        recorder.record();
        recordStartedAt.current = Date.now();
      } catch {
        toast('Aufnahme konnte nicht gestartet werden');
        setRecordVoice(false);
      }
    }

    const n = Math.max(1, settings.karaokeCountdown);
    setPhase('countdown');
    for (let i = n; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 1000));
      if (phaseRef.current !== 'countdown') return;
    }
    songStartedAt.current = Date.now();
    if (!recordStartedAt.current) recordStartedAt.current = songStartedAt.current;
    setPhase('singing');
    play();
  };

  const cancel = () => {
    if (phase === 'singing' || phase === 'countdown') {
      Alert.alert('Auftritt beenden?', 'Willst du speichern und deine Bewertung sehen?', [
        { text: 'Weitersingen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            pause();
            router.back();
          },
        },
        { text: 'Speichern', onPress: finish },
      ]);
    } else router.back();
  };

  if (!track) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Txt dim>Kein Song ausgewählt.</Txt>
        <PrimaryButton label="Schließen" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const [c1, c2] = coverColors(track.id);
  const idx = activeLineIndex(lines, lyricPos);
  const nextLine = lines[idx + 1];
  const gapCountdown = nextLine && (idx < 0 || !lines[idx].text.trim() || lyricPos > lines[idx].end - 0.2) ? nextLine.time - lyricPos : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <LinearGradient colors={[c2, '#000', c1]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton name="close" size={28} color="#fff" onPress={cancel} label="Beenden" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt bold color="#fff" lines={1}>
            {track.title}
          </Txt>
          <Txt color="rgba(255,255,255,0.7)" size={13} lines={1}>
            {track.artist} · 🎤 {settings.singerName}
          </Txt>
        </View>
        {phase === 'singing' && liveScore !== null ? (
          <View style={[styles.scoreBubble, { borderColor: t.accent }]}>
            <Txt bold color="#fff" size={16}>
              {liveScore}
            </Txt>
          </View>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {phase === 'setup' ? (
        <View style={{ flex: 1, padding: 22 }}>
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <Artwork uri={track.artwork} seed={track.id} size={170} radius={12} />
          </View>
          <View style={[styles.panel, { marginTop: 22 }]}>
            {loading ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color="#fff" />
                <Txt color="#fff">Suche synchronisierten Songtext …</Txt>
              </View>
            ) : lines.length ? (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={20} color={t.accent} />
                <Txt color="#fff">Songtext bereit · {lines.filter((l) => l.text.trim()).length} Zeilen</Txt>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={styles.statusRow}>
                  <Ionicons name="alert-circle" size={20} color="#F5C518" />
                  <Txt color="#fff" style={{ flex: 1 }}>
                    {notFound || lyrics ? 'Kein synchronisierter Songtext gefunden.' : 'Songtext nicht verfügbar.'}
                  </Txt>
                </View>
                <PrimaryButton
                  label="Songtext hinzufügen"
                  variant="subtle"
                  icon="create-outline"
                  onPress={() => router.push({ pathname: '/lyrics', params: { trackId: track.id } })}
                />
              </View>
            )}

            <View style={styles.optionRow}>
              <Ionicons name="mic" size={20} color="#fff" />
              <Txt color="#fff" style={{ flex: 1 }}>
                Gesang aufnehmen & bewerten
              </Txt>
              <Switch value={recordVoice} onValueChange={setRecordVoice} trackColor={{ true: t.accent }} />
            </View>

            <Txt color="rgba(255,255,255,0.75)" size={13} style={{ marginTop: 14 }}>
              Musiklautstärke {Math.round(musicVolume * 100)} %
            </Txt>
            <SeekBar value={musicVolume} max={1} onSeek={setMusicVolume} showTimes={false} color="#fff" />

            <Txt color="rgba(255,255,255,0.75)" size={13} style={{ marginTop: 8 }}>
              Tempo zum Üben
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {[0.8, 0.9, 1].map((r) => (
                <Chip key={r} label={r === 1 ? 'Original' : `${Math.round(r * 100)} %`} active={tempo === r} onPress={() => setTempo(r)} />
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <PrimaryButton label="Los geht's!" icon="mic" onPress={start} style={{ paddingVertical: 16 }} />
          <Txt color="rgba(255,255,255,0.6)" size={12} style={{ textAlign: 'center', marginTop: 10 }}>
            Tipp: Kopfhörer verwenden, damit nur deine Stimme aufgenommen wird.
          </Txt>
        </View>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {lines.length ? (
              <LyricsView
                lines={lines}
                position={phase === 'countdown' ? -1 : lyricPos}
                fontSize={settings.lyricsFontSize + 4}
                activeColor="#FFFFFF"
                inactiveColor="rgba(255,255,255,0.35)"
                pastColor="rgba(255,255,255,0.2)"
                karaoke
                highlightColor={t.accent}
                anchor={0.4}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.center}>
                <Ionicons name="musical-notes" size={64} color="rgba(255,255,255,0.6)" />
                <Txt color="#fff" bold size={20} style={{ marginTop: 12 }}>
                  Freestyle! 🎶
                </Txt>
              </View>
            )}
            {phase === 'singing' && gapCountdown !== null && gapCountdown > 0 && gapCountdown <= 3.2 ? (
              <View pointerEvents="none" style={styles.gapCount}>
                <Txt bold size={22} color={t.accent}>
                  {'● '.repeat(Math.ceil(gapCountdown)).trim()}
                </Txt>
              </View>
            ) : null}
          </View>

          {phase === 'countdown' ? (
            <View pointerEvents="none" style={styles.countdown}>
              <Txt bold size={120} color="#fff">
                {count}
              </Txt>
              {recordVoice ? (
                <Txt color="rgba(255,255,255,0.75)">Ruhe bitte – wir messen die Raumlautstärke …</Txt>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
            {recordVoice ? (
              <View style={styles.meterRow}>
                <Ionicons name="mic" size={16} color={level > 0.15 ? t.accent : 'rgba(255,255,255,0.5)'} />
                <View style={styles.meterTrack}>
                  <View style={[styles.meterFill, { width: `${level * 100}%`, backgroundColor: level > 0.85 ? '#FF5A5F' : t.accent }]} />
                </View>
              </View>
            ) : null}
            <SeekBar value={position} max={duration} onSeek={() => {}} color="#fff" />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
              {phase === 'saving' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <PrimaryButton label={recordVoice ? 'Fertig & bewerten' : 'Beenden'} icon="flag" onPress={phase === 'singing' ? finish : cancel} />
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function median(values: number[]): number {
  if (!values.length) return -50;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6 },
  panel: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  scoreBubble: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  gapCount: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  bottom: { paddingHorizontal: 22, paddingTop: 8 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
});
