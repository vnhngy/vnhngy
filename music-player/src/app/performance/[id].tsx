import { useAudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pause as pauseMusic, play as playMusic, playList, seek as seekMusic, setVolume } from '../../audio/engine';
import { Artwork } from '../../components/Artwork';
import { IconButton, PrimaryButton, Txt } from '../../components/ui';
import { confirm } from '../../lib/actions';
import { deleteLocalFile } from '../../lib/files';
import { formatTime, relativeDate } from '../../lib/format';
import { scoreLabel } from '../../lib/karaoke';
import { useTheme } from '../../lib/theme';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';

export default function PerformanceScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rec = useLibrary((s) => s.recordings.find((r) => r.id === id));
  const track = useLibrary((s) => (rec ? s.tracks[rec.trackId] : undefined));
  const lyrics = useLibrary((s) => (rec ? s.lyrics[rec.trackId] : undefined));
  const removeRecording = useLibrary((s) => s.removeRecording);
  const voice = useAudioPlayer(rec?.uri ?? null, { updateInterval: 250 });
  const [mode, setMode] = useState<'voice' | 'mix' | null>(null);
  const [shown, setShown] = useState(0);

  // Count the score up for a little drama.
  useEffect(() => {
    if (!rec) return;
    let n = 0;
    const id2 = setInterval(() => {
      n = Math.min(rec.score, n + Math.max(1, Math.round(rec.score / 30)));
      setShown(n);
      if (n >= rec.score) clearInterval(id2);
    }, 30);
    return () => clearInterval(id2);
  }, [rec]);

  useEffect(() => {
    const sub = voice.addListener('playbackStatusUpdate', (st) => {
      if (!st.didJustFinish) return;
      pauseMusic();
      setMode(null);
    });
    return () => sub.remove();
  }, [voice]);

  useEffect(
    () => () => {
      if (mode === 'mix') {
        pauseMusic();
        setVolume(1);
      }
    },
    [mode],
  );

  if (!rec) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Txt dim>Aufnahme nicht gefunden.</Txt>
        <PrimaryButton label="Zurück" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const stopAll = () => {
    voice.pause();
    if (mode === 'mix') pauseMusic();
    setMode(null);
  };

  const playVoice = async () => {
    stopAll();
    await voice.seekTo(rec.lead ?? 0);
    voice.play();
    setMode('voice');
  };

  const playMix = async () => {
    if (!track) return;
    stopAll();
    if (usePlayer.getState().current?.id !== track.id) {
      await playList([track], 0, { type: 'karaoke', name: 'Karaoke' }, { play: false });
    }
    pauseMusic();
    setVolume(0.6);
    await Promise.all([seekMusic(rec.songOffset), voice.seekTo(rec.lead ?? 0)]);
    playMusic();
    voice.play();
    setMode('mix');
  };

  const sungLines = (lyrics?.synced ?? []).filter((_, i) => (rec.lineScores[i] ?? -1) >= 0);
  const scored = rec.lineScores.map((s, i) => ({ s, line: lyrics?.synced?.[i] })).filter((x) => x.s >= 0 && x.line?.text.trim());
  const best = [...scored].sort((a, b) => b.s - a.s).slice(0, 3);
  const weakest = [...scored].sort((a, b) => a.s - b.s).slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[t.accent, t.bg]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.top}>
          <IconButton name="close" size={28} color="#fff" onPress={() => (stopAll(), router.back())} label="Schließen" />
          <View style={{ flex: 1 }} />
          <IconButton
            name="share-outline"
            color="#fff"
            onPress={() =>
              Share.share({
                message: `🎤 ${rec.singer} hat „${track?.title ?? 'einen Song'}“ gesungen und ${rec.score} von 100 Punkten geholt! (${scoreLabel(rec.score)}) – Klangraum Karaoke`,
              })
            }
            label="Teilen"
          />
        </View>

        <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
          <Artwork uri={track?.artwork} seed={rec.trackId} size={120} radius={10} />
          <Txt bold size={18} color="#fff" style={{ marginTop: 12, textAlign: 'center' }}>
            {track?.title ?? 'Unbekannter Song'}
          </Txt>
          <Txt color="rgba(255,255,255,0.8)" size={14}>
            🎤 {rec.singer} · {relativeDate(rec.createdAt)}
          </Txt>
          <Txt bold size={88} color="#fff" style={{ marginTop: 10 }}>
            {shown}
          </Txt>
          <Txt bold size={20} color="#fff">
            {scoreLabel(rec.score)}
          </Txt>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Meter label="Timing – im richtigen Moment gesungen" value={rec.timing} color={t.accent} />
          <Meter label="Stabilität – gleichmäßige Stimme" value={rec.stability} color={t.accent} />
          <Txt dim size={12} style={{ marginTop: 10, lineHeight: 17 }}>
            Die Bewertung misst, ob du während der Songtext-Zeilen hörbar gesungen hast und wie gleichmäßig deine Stimme war. Die Tonhöhe
            wird nicht ausgewertet.
          </Txt>
        </View>

        {scored.length ? (
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            <Txt bold size={16}>
              Zeile für Zeile
            </Txt>
            <View style={styles.bars}>
              {rec.lineScores.map((s, i) =>
                s >= 0 ? (
                  <View
                    key={i}
                    style={[styles.bar, { height: 6 + (s / 100) * 54, backgroundColor: s >= 70 ? t.accent : s >= 40 ? '#F5C518' : t.danger }]}
                  />
                ) : null,
              )}
            </View>
            <Txt dim size={12}>
              {sungLines.length} Zeilen gesungen
            </Txt>
            {best.length ? (
              <>
                <Txt bold style={{ marginTop: 14 }}>
                  💚 Stärkste Zeilen
                </Txt>
                {best.map((b, i) => (
                  <Txt key={`b${i}`} dim size={14} lines={1} style={{ marginTop: 4 }}>
                    {b.line?.text} · {b.s}
                  </Txt>
                ))}
                <Txt bold style={{ marginTop: 12 }}>
                  🎯 Hier geht noch was
                </Txt>
                {weakest.map((b, i) => (
                  <Txt key={`w${i}`} dim size={14} lines={1} style={{ marginTop: 4 }}>
                    {b.line?.text} · {b.s}
                  </Txt>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: t.surface, gap: 10 }]}>
          <Txt bold size={16}>
            Aufnahme anhören · {formatTime(rec.duration)}
          </Txt>
          <PrimaryButton
            label={mode === 'voice' ? 'Stopp' : 'Nur meine Stimme'}
            icon={mode === 'voice' ? 'stop' : 'person'}
            variant={mode === 'voice' ? 'accent' : 'subtle'}
            onPress={mode === 'voice' ? stopAll : playVoice}
          />
          {track ? (
            <PrimaryButton
              label={mode === 'mix' ? 'Stopp' : 'Stimme + Musik'}
              icon={mode === 'mix' ? 'stop' : 'musical-notes'}
              variant={mode === 'mix' ? 'accent' : 'subtle'}
              onPress={mode === 'mix' ? stopAll : playMix}
            />
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 20 }}>
          {track ? (
            <PrimaryButton
              label="Nochmal singen"
              icon="refresh"
              onPress={() => {
                stopAll();
                router.replace({ pathname: '/karaoke-session', params: { trackId: track.id } });
              }}
            />
          ) : null}
          <PrimaryButton
            label="Aufnahme löschen"
            icon="trash-outline"
            variant="outline"
            onPress={() =>
              confirm('Aufnahme löschen?', 'Das kann nicht rückgängig gemacht werden.', 'Löschen', () => {
                stopAll();
                deleteLocalFile(rec.uri);
                removeRecording(rec.id);
                router.back();
              })
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt size={14}>{label}</Txt>
        <Txt bold size={14}>
          {value}
        </Txt>
      </View>
      <View style={styles.meterTrack}>
        <View style={{ width: `${value}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  card: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 64, marginVertical: 10 },
  bar: { flex: 1, borderRadius: 2, minWidth: 2 },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(127,127,127,0.25)', marginTop: 6, overflow: 'hidden' },
});

