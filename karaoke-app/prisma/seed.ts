import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demoSongs = [
  {
    youtubeId: "fJ9rUzIMcZQ",
    title: "Queen — Bohemian Rhapsody (Karaoke Version)",
    channelTitle: "Karaoke Klassiker",
    thumbnailUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
    durationSeconds: 355,
  },
  {
    youtubeId: "ZbZSe6N_BXs",
    title: "Happy Birthday — Karaoke Instrumental",
    channelTitle: "Sing Along",
    thumbnailUrl: "https://i.ytimg.com/vi/ZbZSe6N_BXs/hqdefault.jpg",
    durationSeconds: 32,
  },
];

async function main() {
  for (const song of demoSongs) {
    await prisma.song.upsert({
      where: { youtubeId: song.youtubeId },
      update: {},
      create: song,
    });
  }
  console.log(`Seed abgeschlossen: ${demoSongs.length} Songs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
