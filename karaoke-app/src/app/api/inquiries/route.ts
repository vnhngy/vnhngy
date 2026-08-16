import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  plan: z.enum(["SOLO", "GROUP", "EVENT"]),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  guests: z.number().int().positive().max(2000).optional(),
  eventDate: z.string().optional(),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 }
    );
  }
  const { plan, name, email, guests, eventDate, message } = parsed.data;

  const inquiry = await prisma.planInquiry.create({
    data: {
      plan,
      name,
      email,
      guests,
      eventDate: eventDate ? new Date(eventDate) : undefined,
      message,
    },
  });

  return NextResponse.json({ inquiry });
}
