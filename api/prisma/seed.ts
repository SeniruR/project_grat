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
    employeeNumber: "100001",
    displayName: "Admin",
    aadOid: "dev-admin@example.com",
    role: "ADMIN" as const,
  },
  {
    email: "designer@example.com",
    employeeNumber: "100002",
    displayName: "Designer",
    aadOid: "dev-designer@example.com",
    role: "DESIGNER" as const,
  },
  {
    email: "user@example.com",
    employeeNumber: "100003",
    displayName: "User",
    aadOid: "dev-user@example.com",
    role: "USER" as const,
  },
  {
    email: "ava.fernando@example.com",
    employeeNumber: "100004",
    displayName: "Ava Fernando",
    aadOid: "dev-ava.fernando@example.com",
    role: "USER" as const,
  },
  {
    email: "ben.jayasuriya@example.com",
    employeeNumber: "100005",
    displayName: "Ben Jayasuriya",
    aadOid: "dev-ben.jayasuriya@example.com",
    role: "USER" as const,
  },
  {
    email: "cara.silva@example.com",
    employeeNumber: "100006",
    displayName: "Cara Silva",
    aadOid: "dev-cara.silva@example.com",
    role: "USER" as const,
  },
  {
    email: "diego.bandara@example.com",
    employeeNumber: "100007",
    displayName: "Diego Bandara",
    aadOid: "dev-diego.bandara@example.com",
    role: "USER" as const,
  },
  {
    email: "elena.wickramasinghe@example.com",
    employeeNumber: "100008",
    displayName: "Elena Wickramasinghe",
    aadOid: "dev-elena.wickramasinghe@example.com",
    role: "USER" as const,
  },
  {
    email: "randivranasinghe@gmail.com",
    employeeNumber: "100009",
    displayName: "Randiv Ranasinghe",
    aadOid: "dev-randivranasinghe@gmail.com",
    role: "USER" as const,
  },
  {
    email: "senirurandiv@gmail.com",
    employeeNumber: "100010",
    displayName: "Seniru Randiv",
    aadOid: "dev-senirurandiv@gmail.com",
    role: "USER" as const,
  },
];

async function main() {
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@gmail.com" } },
  });

  for (const person of colleagues) {
    await prisma.user.upsert({
      where: { email: person.email },
      create: { ...person, isDirectory: true },
      update: {
        employeeNumber: person.employeeNumber,
        displayName: person.displayName,
        aadOid: person.aadOid,
        role: person.role,
        isDirectory: true,
      },
    });
  }

  console.log(
    `Seeded ${colleagues.length} directory accounts (admin, designer, user + @example.com colleagues).`,
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
