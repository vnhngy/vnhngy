import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Katalog aller bereits gesungenen/gesuchten Songs — die "gewachsene" Datenbank. */
export async function GET(req: NextRequest) {
  const sort = req.nextUrl.searchParams.get("sort") ?? "popular";
  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 20), 50);

  const orderBy =
    sort === "recent"
      ? [{ lastPlayedAt: "desc" as const }]
      : [{ timesPlayed: "desc" as const }, { timesRequested: "desc" as const }];

  const songs = await prisma.song.findMany({
    where: { timesPlayed: { gt: 0 } },
    orderBy,
    take,
  });

  return NextResponse.json({ songs });
}
