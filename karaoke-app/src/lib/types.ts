export interface SongDTO {
  id: string;
  youtubeId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  timesPlayed: number;
  timesRequested: number;
}

export interface SingerDTO {
  id: string;
  name: string;
}

export type QueueStatus = "WAITING" | "PLAYING" | "PLAYED" | "SKIPPED";

export interface QueueEntryDTO {
  id: string;
  position: number;
  status: QueueStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  singer: SingerDTO;
  song: SongDTO;
}
