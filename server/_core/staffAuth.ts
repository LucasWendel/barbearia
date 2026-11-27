import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { barbershops, staffAccounts, staffSessions, type StaffAccount } from "../../drizzle/schema";
import { getDb } from "../db";

export const STAFF_COOKIE_NAME = "barberpro_session";
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 14;
const RESET_LIFETIME_MS = 1000 * 60 * 30;

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await derivePassword(password, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await derivePassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function cookieOptions(req: Request) {
  const host = (req.hostname || "").toLowerCase();
  const localHttp = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return {
    httpOnly: true,
    path: "/",
    sameSite: localHttp ? "lax" as const : "none" as const,
    secure: !localHttp,
  };
}

export async function createStaffSession(staffAccountId: number, req: Request, res: Response) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(staffSessions).values({ staffAccountId, tokenHash: hashSessionToken(token), expiresAt });
  res.cookie(STAFF_COOKIE_NAME, token, { ...cookieOptions(req), expires: expiresAt });
}

export async function clearStaffSession(req: Request, res: Response) {
  const token = readCookie(req, STAFF_COOKIE_NAME);
  if (token) {
    const db = await getDb();
    if (db) await db.delete(staffSessions).where(eq(staffSessions.tokenHash, hashSessionToken(token)));
  }
  res.clearCookie(STAFF_COOKIE_NAME, cookieOptions(req));
}

export type StaffSessionContext = {
  staff: StaffAccount | null;
  barbershop: typeof barbershops.$inferSelect | null;
};

export async function authenticateStaffRequest(req: Request): Promise<StaffSessionContext> {
  const token = readCookie(req, STAFF_COOKIE_NAME);
  if (!token) return { staff: null, barbershop: null };
  const db = await getDb();
  if (!db) return { staff: null, barbershop: null };
  const [row] = await db
    .select({ session: staffSessions, account: staffAccounts, barbershop: barbershops })
    .from(staffSessions)
    .innerJoin(staffAccounts, eq(staffSessions.staffAccountId, staffAccounts.id))
    .leftJoin(barbershops, eq(staffAccounts.barbershopId, barbershops.id))
    .where(and(eq(staffSessions.tokenHash, hashSessionToken(token)), gt(staffSessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.account.isActive) return { staff: null, barbershop: null };
  if (row.account.role !== "super_admin" && !row.account.barbershopId) return { staff: null, barbershop: null };
  if (row.account.role !== "super_admin") {
    const shop = row.barbershop;
    if (!shop || shop.deletedAt || shop.status === "blocked") return { staff: null, barbershop: null };
    if (shop.status === "trial" && shop.trialEndsAt.getTime() < Date.now()) return { staff: null, barbershop: null };
  }
  return { staff: row.account, barbershop: row.barbershop };
}

export const resetTokenLifetimeMs = RESET_LIFETIME_MS;
