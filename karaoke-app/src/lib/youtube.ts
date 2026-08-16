export interface YoutubeSearchResult {
  youtubeId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Number(s ?? 0);
}

/**
 * Sucht Songs über die offizielle YouTube-Datenbank (Data API v3).
 * So kann wirklich jedes Lied gefunden werden, das auf YouTube existiert —
 * nicht nur, was bereits lokal gecacht ist.
 */
export async function searchYoutube(
  query: string,
  karaokeOnly = true
): Promise<YoutubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY fehlt. Bitte in .env setzen (siehe README für Anleitung)."
    );
  }

  const searchQuery = karaokeOnly ? `${query} karaoke` : query;
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "16",
    q: searchQuery,
    key: apiKey,
  });

  const searchRes = await fetch(`${SEARCH_URL}?${searchParams.toString()}`, {
    next: { revalidate: 0 },
  });
  if (!searchRes.ok) {
    const body = await searchRes.text();
    throw new Error(`YouTube-Suche fehlgeschlagen (${searchRes.status}): ${body}`);
  }
  const searchData = await searchRes.json();
  const items: Array<{
    id: { videoId: string };
    snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> };
  }> = searchData.items ?? [];

  if (items.length === 0) return [];

  const ids = items.map((item) => item.id.videoId).join(",");
  const videosParams = new URLSearchParams({
    part: "contentDetails",
    id: ids,
    key: apiKey,
  });
  const videosRes = await fetch(`${VIDEOS_URL}?${videosParams.toString()}`, {
    next: { revalidate: 0 },
  });
  const durationById = new Map<string, number>();
  if (videosRes.ok) {
    const videosData = await videosRes.json();
    for (const v of videosData.items ?? []) {
      durationById.set(v.id, parseIsoDuration(v.contentDetails.duration));
    }
  }

  return items.map((item) => ({
    youtubeId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl:
      item.snippet.thumbnails.high?.url ??
      item.snippet.thumbnails.medium?.url ??
      item.snippet.thumbnails.default?.url ??
      `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
    durationSeconds: durationById.get(item.id.videoId) ?? null,
  }));
}
