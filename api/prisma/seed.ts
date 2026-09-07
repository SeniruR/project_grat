import "dotenv/config";
import { prisma, disconnectDb } from "../src/db.js";

/**
 * Fresh demo directory. Roles to try at login:
 *   admin@example.com      ADMIN
 *   designer@example.com   DESIGNER
 *   user@example.com       USER
 * Everyone else is a USER in the recipient picker.
 */
const colleagues = [
  {
    email: "admin@example.com",
    displayName: "Admin",
    aadOid: "dev-admin@example.com",
    role: "ADMIN" as const,
  },
  {
    email: "designer@example.com",
    displayName: "Designer",
    aadOid: "dev-designer@example.com",
    role: "DESIGNER" as const,
  },
  {
    email: "user@example.com",
    displayName: "User",
    aadOid: "dev-user@example.com",
    role: "USER" as const,
  },
  {
    email: "ava.fernando@example.com",
    displayName: "Ava Fernando",
    aadOid: "dev-ava.fernando@example.com",
    role: "USER" as const,
  },
  {
    email: "ben.jayasuriya@example.com",
    displayName: "Ben Jayasuriya",
    aadOid: "dev-ben.jayasuriya@example.com",
    role: "USER" as const,
  },
  {
    email: "cara.silva@example.com",
    displayName: "Cara Silva",
    aadOid: "dev-cara.silva@example.com",
    role: "USER" as const,
  },
  {
    email: "diego.bandara@example.com",
    displayName: "Diego Bandara",
    aadOid: "dev-diego.bandara@example.com",
    role: "USER" as const,
  },
  {
    email: "elena.wickramasinghe@example.com",
    displayName: "Elena Wickramasinghe",
    aadOid: "dev-elena.wickramasinghe@example.com",
    role: "USER" as const,
  },
  {
    email: "seniruranasinghe@gmail.com",
    displayName: "Seniru Ranasinghe",
    aadOid: "dev-seniruranasinghe@gmail.com",
    role: "USER" as const,
  },
];

async function main() {
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

  console.log(
    `Seeded ${colleagues.length} directory accounts (admin, designer, user, and Seniru Ranasinghe).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
