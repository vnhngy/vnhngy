import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SINGER_COOKIE, SINGER_NAME_COOKIE } from "@/lib/singer";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Bitte gib deinen Namen ein.").max(40),
});

const ONE_DAY = 60 * 60 * 24;

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = nameSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültiger Name" },
      { status: 400 }
    );
  }

  const singer = await prisma.singer.create({
    data: { name: parsed.data.name },
  });

  const res = NextResponse.json({ singer });
  res.cookies.set(SINGER_COOKIE, singer.id, {
    maxAge: ONE_DAY,
    sameSite: "lax",
    path: "/",
  });
  res.cookies.set(SINGER_NAME_COOKIE, encodeURIComponent(singer.name), {
    maxAge: ONE_DAY,
    sameSite: "lax",
    path: "/",
  });
  return res;
}

export async function GET(req: NextRequest) {
  const singerId = req.cookies.get(SINGER_COOKIE)?.value;
  if (!singerId) return NextResponse.json({ singer: null });

  const singer = await prisma.singer.findUnique({ where: { id: singerId } });
  return NextResponse.json({ singer });
}
