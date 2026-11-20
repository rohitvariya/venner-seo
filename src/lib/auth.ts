import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";

const COOKIE = "vs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Returns the signed-in user with their first workspace, or redirects to /login. */
export async function requireUser() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    with: { memberships: { with: { workspace: true }, orderBy: schema.memberships.createdAt } },
  });
  if (!user || user.memberships.length === 0) redirect("/login");
  return { user, workspace: user.memberships[0].workspace };
}

/** Loads a site and checks it belongs to the user's workspace. */
export async function requireSite(siteId: string) {
  const { user, workspace } = await requireUser();
  const site = await db.query.sites.findFirst({
    where: and(eq(schema.sites.id, siteId), eq(schema.sites.workspaceId, workspace.id)),
  });
  if (!site) redirect("/sites");
  return { user, workspace, site };
}
