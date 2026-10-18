import type { LyricLine } from './types';

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Superstar 🌟';
  if (score >= 75) return 'Bühnenreif 🎤';
  if (score >= 60) return 'Stark 💪';
  if (score >= 40) return 'Gut dabei 🙂';
  return 'Übung macht den Meister';
}

export interface MeterSample {
  /** Song position in seconds. */
  t: number;
  /** Microphone level in dBFS (-160 … 0). */
  db: number;
}

export interface KaraokeScore {
  score: number;
  /** How consistently the singer was audible while lyrics were due (0-100). */
  timing: number;
  /** How steady the voice level was while singing (0-100). */
  stability: number;
  /** 0-100 per lyric line; -1 for lines that were not reached. */
  lineScores: number[];
}

/**
 * Scores a performance from microphone levels.
 *
 * This is a presence/timing score, not pitch detection: a line counts as
 * "sung" when the microphone level rises clearly above the room noise
 * measured during the countdown. Singing during long instrumental gaps
 * costs a few points.
 */
export function scorePerformance(lines: LyricLine[], samples: MeterSample[], noiseFloorDb: number, sensitivityDb: number): KaraokeScore {
  const threshold = Math.max(-55, noiseFloorDb + sensitivityDb);
  const lastT = samples.length ? samples[samples.length - 1].t : 0;

  const lineScores = lines.map((line) => {
    if (!line.text.trim() || line.time > lastT) return -1;
    const singEnd = Math.min(line.end, line.time + Math.max(1.5, line.text.length * 0.09 + 1));
    const window = samples.filter((s) => s.t >= line.time - 0.2 && s.t <= singEnd + 0.3);
    if (!window.length) return -1;
    const voiced = window.filter((s) => s.db > threshold).length / window.length;
    // Most lines contain short breaths, so ~70 % voiced already counts as a full line.
    return Math.round(Math.min(1, voiced / 0.7) * 100);
  });

  const scored = lineScores.filter((s) => s >= 0);
  const timing = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;

  const voicedDb = samples.filter((s) => s.db > threshold).map((s) => s.db);
  let stability = 0;
  if (voicedDb.length > 5) {
    const mean = voicedDb.reduce((a, b) => a + b, 0) / voicedDb.length;
    const sd = Math.sqrt(voicedDb.reduce((a, b) => a + (b - mean) ** 2, 0) / voicedDb.length);
    stability = Math.max(0, Math.min(100, 100 - (sd - 3) * 8));
  }

  // Penalty for singing over long instrumental stretches (> 6 s without lyrics).
  let gapSamples = 0;
  let gapVoiced = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const gapStart = lines[i].time + Math.max(1.5, lines[i].text.length * 0.09 + 1.5);
    const gapEnd = lines[i + 1].time - 0.5;
    if (gapEnd - gapStart < 6) continue;
    for (const s of samples) {
      if (s.t > gapStart && s.t < gapEnd) {
        gapSamples++;
        if (s.db > threshold) gapVoiced++;
      }
    }
  }
  const gapPenalty = gapSamples ? (gapVoiced / gapSamples) * 15 : 0;

  const score = Math.round(Math.max(0, Math.min(100, timing * 0.8 + stability * 0.2 - gapPenalty)));
  return { score, timing: Math.round(timing), stability: Math.round(stability), lineScores };
}
