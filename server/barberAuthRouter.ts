import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { staffAccounts, staffSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { createStaffSession, clearStaffSession, hashPassword, verifyPassword } from "./_core/staffAuth";
import { publicProcedure, router, staffProcedure } from "./_core/trpc";

const attempts = new Map<string, { count: number; since: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function attemptKey(email: string, ip: string) {
  return `${ip}:${email.toLowerCase()}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const value = attempts.get(key);
  if (!value || now - value.since > WINDOW_MS) {
    attempts.set(key, { count: 1, since: now });
    return false;
  }
  value.count += 1;
  return value.count > MAX_ATTEMPTS;
}

const publicAccount = (staff: NonNullable<import("../drizzle/barbershop").StaffAccount>) => ({
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  barbershopId: staff.barbershopId,
  barberId: staff.barberId,
  mustChangePassword: staff.mustChangePassword,
});

export const barberAuthRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const key = attemptKey(email, ctx.req.ip || "unknown");
      if (isRateLimited(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço temporariamente indisponível." });
      const [staff] = await db.select().from(staffAccounts).where(eq(staffAccounts.email, email)).limit(1);
      const valid = staff ? await verifyPassword(input.password, staff.passwordHash) : await verifyPassword(input.password, "invalid$invalid$" );
      if (!staff || !valid || !staff.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      await createStaffSession(staff.id, ctx.req, ctx.res);
      await db.update(staffAccounts).set({ lastSignedInAt: new Date() }).where(eq(staffAccounts.id, staff.id));
      attempts.delete(key);
      return { staff: publicAccount(staff) };
    }),

  me: publicProcedure.query(({ ctx }) => ctx.staff ? {
    staff: publicAccount(ctx.staff),
    barbershop: ctx.barbershop ? { id: ctx.barbershop.id, name: ctx.barbershop.name, slug: ctx.barbershop.slug, logoUrl: ctx.barbershop.logoUrl, primaryColor: ctx.barbershop.primaryColor, status: ctx.barbershop.status } : null,
  } : null),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await clearStaffSession(ctx.req, ctx.res);
    return { success: true } as const;
  }),

  changePassword: staffProcedure
    .input(z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [staff] = await db.select().from(staffAccounts).where(and(eq(staffAccounts.id, ctx.staff.id), eq(staffAccounts.isActive, true))).limit(1);
      if (!staff || !(await verifyPassword(input.currentPassword, staff.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });
      }
      await db.update(staffAccounts).set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false }).where(eq(staffAccounts.id, staff.id));
      await db.delete(staffSessions).where(eq(staffSessions.staffAccountId, staff.id));
      await createStaffSession(staff.id, ctx.req, ctx.res);
      return { success: true } as const;
    }),
});
