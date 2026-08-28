import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

import { getDb } from "./db";
import { jawebflowUsers, type JawebflowUser } from "../drizzle/schema";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return new TextEncoder().encode(secret);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export async function createLocalUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("La base de données est indisponible.");
  const normalizedEmail = normalizeEmail(email);
  const existing = await db
    .select({ id: jawebflowUsers.id })
    .from(jawebflowUsers)
    .where(eq(jawebflowUsers.email, normalizedEmail))
    .limit(1);
  if (existing.length) throw new Error("Un compte existe déjà avec cet email.");

  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
  };
  await db.insert(jawebflowUsers).values(user);
  return user;
}

export async function authenticateLocalUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("La base de données est indisponible.");
  const normalizedEmail = normalizeEmail(email);
  const matches = await db.select().from(jawebflowUsers).where(eq(jawebflowUsers.email, normalizedEmail)).limit(1);
  const user = matches[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Email ou mot de passe incorrect.");
  }
  return user;
}

export async function createSessionToken(user: Pick<JawebflowUser, "id" | "email">) {
  return new SignJWT({ email: user.email, mode: "local-demo" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSessionSecret());
  if (!payload.sub || typeof payload.email !== "string") throw new Error("Session invalide.");
  return { id: payload.sub, email: payload.email };
}

export function makeWidgetToken() {
  return createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);
}
