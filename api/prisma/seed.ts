import "dotenv/config";
import { prisma, disconnectDb } from "../src/db.js";

const colleagues = [
  {
    email: "ava.chen@contoso.local",
    displayName: "Ava Chen",
    aadOid: "dev-ava.chen@contoso.local",
    role: "USER" as const,
  },
  {
    email: "ben.okafor@contoso.local",
    displayName: "Ben Okafor",
    aadOid: "dev-ben.okafor@contoso.local",
    role: "USER" as const,
  },
  {
    email: "cara.singh@contoso.local",
    displayName: "Cara Singh",
    aadOid: "dev-cara.singh@contoso.local",
    role: "USER" as const,
  },
  {
    email: "diego.ramos@contoso.local",
    displayName: "Diego Ramos",
    aadOid: "dev-diego.ramos@contoso.local",
    role: "USER" as const,
  },
  {
    email: "elena.park@contoso.local",
    displayName: "Elena Park",
    aadOid: "dev-elena.park@contoso.local",
    role: "ADMIN" as const,
  },
];

async function main() {
  for (const person of colleagues) {
    await prisma.user.upsert({
      where: { email: person.email },
      create: { ...person, isDirectory: true },
      update: {
        displayName: person.displayName,
        role: person.role,
        isDirectory: true,
      },
    });
  }

  console.log(`Seeded ${colleagues.length} directory users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
