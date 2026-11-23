// Set a new password for an account, from your own terminal.
//   npm run reset-password
// Lists the accounts and their websites, asks which email to reset,
// then asks for the new password (hidden while you type).
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the prompt, then swallow echoed characters.
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) out.output.write(question);
        else if (s === "\r\n" || s === "\n") out.output.write(s);
        else out.output.write("*");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const users = await db.select().from(schema.users);
  if (users.length === 0) {
    console.log("No accounts yet. Create one at http://localhost:3000/signup");
    return;
  }

  console.log("\nAccounts:");
  for (const u of users) {
    const rows = await db
      .select({ domain: schema.sites.domain })
      .from(schema.memberships)
      .innerJoin(schema.sites, eq(schema.sites.workspaceId, schema.memberships.workspaceId))
      .where(eq(schema.memberships.userId, u.id));
    const sites = rows.map((r) => r.domain).join(", ") || "no websites";
    console.log(`  ${u.email}  →  ${sites}`);
  }

  const email = (await ask("\nEmail to reset: ")).toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    console.log("No account with that email.");
    return;
  }

  const pw = await ask("New password (min 8 characters): ", true);
  if (pw.length < 8) {
    console.log("Too short, nothing changed.");
    return;
  }
  const again = await ask("Type it again: ", true);
  if (pw !== again) {
    console.log("The two passwords don't match, nothing changed.");
    return;
  }

  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(pw, 12) })
    .where(eq(schema.users.id, user.id));
  console.log(`\nDone. Sign in at http://localhost:3000/login as ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
