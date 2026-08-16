import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SINGER_COOKIE } from "@/lib/singer";

export async function GET() {
  const entries = await prisma.queueEntry.findMany({
    where: { status: { in: ["WAITING", "PLAYING"] } },
    orderBy: [{ status: "asc" }, { position: "asc" }],
    include: { singer: true, song: true },
  });

  // PLAYING soll immer zuerst erscheinen, danach WAITING nach Position.
  const playing = entries.filter((e) => e.status === "PLAYING");
  const waiting = entries.filter((e) => e.status === "WAITING");

  return NextResponse.json({ playing, waiting });
}

const addSchema = z.object({
  youtubeId: z.string().min(3),
  title: z.string().min(1),
  channelTitle: z.string().default("YouTube"),
  thumbnailUrl: z.string().url(),
  durationSeconds: z.number().int().positive().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const singerId = req.cookies.get(SINGER_COOKIE)?.value;
  if (!singerId) {
    return NextResponse.json(
      { error: "Bitte zuerst deinen Namen unter /join eingeben." },
      { status: 401 }
    );
  }
  const singer = await prisma.singer.findUnique({ where: { id: singerId } });
  if (!singer) {
    return NextResponse.json(
      { error: "Dein Profil wurde nicht gefunden. Bitte erneut auf /join anmelden." },
      { status: 401 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Song in der lokalen YouTube-Datenbank anlegen/aktualisieren.
  const song = await prisma.song.upsert({
    where: { youtubeId: data.youtubeId },
    update: { timesRequested: { increment: 1 } },
    create: {
      youtubeId: data.youtubeId,
      title: data.title,
      channelTitle: data.channelTitle,
      thumbnailUrl: data.thumbnailUrl,
      durationSeconds: data.durationSeconds ?? null,
      timesRequested: 1,
    },
  });

  const last = await prisma.queueEntry.findFirst({
    where: { status: { in: ["WAITING", "PLAYING"] } },
    orderBy: { position: "desc" },
  });
  const nextPosition = (last?.position ?? 0) + 1;

  const entry = await prisma.queueEntry.create({
    data: {
      singerId: singer.id,
      songId: song.id,
      position: nextPosition,
    },
    include: { singer: true, song: true },
  });

  return NextResponse.json({ entry });
}
