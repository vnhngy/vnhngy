import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  status: z.enum(["WAITING", "PLAYING", "PLAYED", "SKIPPED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const json = await req.json().catch(() => null);
  const parsed = statusSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
  }
  const { status } = parsed.data;

  const entry = await prisma.queueEntry.findUnique({ where: { id: params.id } });
  if (!entry) {
    return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  }

  if (status === "PLAYING") {
    // Nur ein Song gleichzeitig "PLAYING": alle anderen laufenden Songs
    // gelten als beendet und werden automatisch als "gespielt" in der
    // Songdatenbank vermerkt (Play-Count, letzter Spieltermin).
    const othersPlaying = await prisma.queueEntry.findMany({
      where: { status: "PLAYING", NOT: { id: entry.id } },
    });
    for (const other of othersPlaying) {
      await prisma.queueEntry.update({
        where: { id: other.id },
        data: { status: "PLAYED", finishedAt: new Date() },
      });
      await prisma.song.update({
        where: { id: other.songId },
        data: { timesPlayed: { increment: 1 }, lastPlayedAt: new Date() },
      });
    }

    const updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "PLAYING", startedAt: new Date() },
      include: { singer: true, song: true },
    });
    return NextResponse.json({ entry: updated });
  }

  if (status === "PLAYED") {
    const updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "PLAYED", finishedAt: new Date() },
      include: { singer: true, song: true },
    });
    await prisma.song.update({
      where: { id: entry.songId },
      data: { timesPlayed: { increment: 1 }, lastPlayedAt: new Date() },
    });
    return NextResponse.json({ entry: updated });
  }

  const updated = await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status },
    include: { singer: true, song: true },
  });
  return NextResponse.json({ entry: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.queueEntry.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
