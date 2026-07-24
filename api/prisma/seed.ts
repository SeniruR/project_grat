import "dotenv/config";
import { prisma, disconnectDb } from "../src/db.js";

/** Demo directory for SLT.lk testing (dev login + recipient picker). */
const colleagues = [
  {
    email: "seniru@slt.lk",
    displayName: "Seniru Perera",
    aadOid: "dev-seniru@slt.lk",
    role: "ADMIN" as const,
  },
  {
    email: "ava.fernando@slt.lk",
    displayName: "Ava Fernando",
    aadOid: "dev-ava.fernando@slt.lk",
    role: "USER" as const,
  },
  {
    email: "ben.jayasuriya@slt.lk",
    displayName: "Ben Jayasuriya",
    aadOid: "dev-ben.jayasuriya@slt.lk",
    role: "USER" as const,
  },
  {
    email: "cara.silva@slt.lk",
    displayName: "Cara Silva",
    aadOid: "dev-cara.silva@slt.lk",
    role: "USER" as const,
  },
  {
    email: "diego.bandara@slt.lk",
    displayName: "Diego Bandara",
    aadOid: "dev-diego.bandara@slt.lk",
    role: "USER" as const,
  },
  {
    email: "elena.wickramasinghe@slt.lk",
    displayName: "Elena Wickramasinghe",
    aadOid: "dev-elena.wickramasinghe@slt.lk",
    role: "USER" as const,
  },
];

async function main() {
  // Drop unused old Contoso demo accounts (keep any that own templates/jobs)
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@contoso.local" } },
        { aadOid: { startsWith: "dev-", endsWith: "@contoso.local" } },
      ],
      ownedTemplates: { none: {} },
      draftJobs: { none: {} },
      auditEvents: { none: {} },
    },
  });

  for (const person of colleagues) {
    await prisma.user.upsert({
      where: { email: person.email },
      create: { ...person, isDirectory: true },
      update: {
        displayName: person.displayName,
        aadOid: person.aadOid,
        role: person.role,
        isDirectory: true,
      },
    });
  }

  console.log(`Seeded ${colleagues.length} directory users (@slt.lk).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
