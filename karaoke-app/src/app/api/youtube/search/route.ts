import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchYoutube } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const karaokeOnly = req.nextUrl.searchParams.get("karaokeOnly") !== "false";

  if (query.length < 2) {
    return NextResponse.json({ results: [], source: "none" });
  }

  // 1) Zuerst in der eigenen (bereits gesungenen/gecachten) Song-Datenbank suchen —
  //    schnell, kostenlos und zeigt Partyklassiker sofort ganz oben.
  const localMatches = await prisma.song.findMany({
    where: { title: { contains: query } },
    orderBy: [{ timesPlayed: "desc" }, { timesRequested: "desc" }],
    take: 8,
  });

  let youtubeResults: Awaited<ReturnType<typeof searchYoutube>> = [];
  let youtubeError: string | null = null;
  try {
    youtubeResults = await searchYoutube(query, karaokeOnly);
  } catch (err) {
    youtubeError = err instanceof Error ? err.message : "Unbekannter Fehler";
  }

  const localIds = new Set(localMatches.map((s) => s.youtubeId));
  const merged = [
    ...localMatches.map((s) => ({
      youtubeId: s.youtubeId,
      title: s.title,
      channelTitle: s.channelTitle,
      thumbnailUrl: s.thumbnailUrl,
      durationSeconds: s.durationSeconds,
      inCatalog: true,
      timesPlayed: s.timesPlayed,
    })),
    ...youtubeResults
      .filter((r) => !localIds.has(r.youtubeId))
      .map((r) => ({ ...r, inCatalog: false, timesPlayed: 0 })),
  ];

  return NextResponse.json({
    results: merged,
    source: youtubeError ? "local-only" : "youtube",
    youtubeError,
  });
}
