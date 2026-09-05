import "dotenv/config";
import { prisma, disconnectDb } from "../src/db.js";

/** Demo directory for local testing (dev login + recipient picker). */
const colleagues = [
  {
    email: "seniru@example.com",
    displayName: "Seniru Perera",
    aadOid: "dev-seniru@example.com",
    role: "ADMIN" as const,
  },
  {
    email: "ava.fernando@example.com",
    displayName: "Ava Fernando",
    aadOid: "dev-ava.fernando@example.com",
    role: "DESIGNER" as const,
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
    role: "DESIGNER" as const,
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

async function migrateLegacyDemoEmails() {
  const legacy = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@slt.lk" } },
        { email: { endsWith: "@slt.com.lk" } },
        { email: { endsWith: "@contoso.local" } },
      ],
    },
  });

  for (const user of legacy) {
    const nextEmail = user.email.includes("@slt.com.lk")
      ? user.email.replace(/@slt\.com\.lk$/i, "@example.com")
      : user.email.replace(/@(slt\.lk|contoso\.local)$/i, "@example.com");
    const nextOid = user.aadOid
      .replace(/@slt\.com\.lk$/i, "@example.com")
      .replace(/@slt\.lk$/i, "@example.com")
      .replace(/@contoso\.local$/i, "@example.com");

    if (nextEmail === user.email) continue;

    const clash = await prisma.user.findUnique({ where: { email: nextEmail } });
    if (clash) {
      const local = nextEmail.slice(0, nextEmail.indexOf("@"));
      const domain = nextEmail.slice(nextEmail.indexOf("@") + 1);
      let n = 2;
      let candidate = `${local}${n}@${domain}`;
      while (await prisma.user.findUnique({ where: { email: candidate } })) {
        n += 1;
        candidate = `${local}${n}@${domain}`;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: candidate,
          aadOid: nextOid.replace(nextEmail, candidate),
        },
      });
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: nextEmail, aadOid: nextOid },
    });
  }
}

async function main() {
  await migrateLegacyDemoEmails();
  await rewriteLegacyDomainsInMail();

  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@contoso.local" } },
        { email: { endsWith: "@slt.lk" } },
        { email: { endsWith: "@slt.com.lk" } },
        { aadOid: { contains: "@contoso.local" } },
        { aadOid: { contains: "@slt.lk" } },
        { aadOid: { contains: "@slt.com.lk" } },
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

  console.log(`Seeded ${colleagues.length} directory users (@example.com).`);
}

async function rewriteLegacyDomainsInMail() {
  await prisma.$executeRawUnsafe(`
    UPDATE outbound_drafts
    SET recipient_email = replace(recipient_email, '@slt.com.lk', '@example.com')
    WHERE recipient_email ILIKE '%@slt.com.lk'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE outbound_drafts
    SET recipient_email = replace(recipient_email, '@slt.lk', '@example.com')
    WHERE recipient_email ILIKE '%@slt.lk'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE outbound_drafts
    SET body_html = replace(replace(body_html, 'www.sltmobitel.lk', 'www.example.com'), 'SLTMOBITEL', 'the organisation')
    WHERE body_html ILIKE '%slt%'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE template_versions
    SET compiled_html = replace(replace(compiled_html, 'www.sltmobitel.lk', 'www.example.com'), 'SLTMOBITEL', 'the organisation')
    WHERE compiled_html ILIKE '%slt%'
  `);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
