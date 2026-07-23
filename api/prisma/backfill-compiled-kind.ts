import { prisma, disconnectDb } from "../src/db.js";

async function main() {
  const r = await prisma.templateAsset.updateMany({
    where: {
      OR: [
        { fileName: { startsWith: "compiled-" } },
        { fileName: { startsWith: "preview-" } },
      ],
    },
    data: { kind: "compiled" },
  });
  console.log(`Marked ${r.count} assets as compiled (hidden from Images).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => disconnectDb());
