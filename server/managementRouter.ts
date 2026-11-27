import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  appointmentItems,
  appointmentProducts,
  barbers,
  cashSessions,
  commissionEntries,
  commissionRules,
  barbershops,
  barberServices,
  barberWorkingHours,
  customers,
  financialTransactions,
  platformPayments,
  products,
  reviews,
  stockMovements,
  services,
  staffAccounts,
  waitlistEntries,
} from "../drizzle/schema";
import { getDb } from "./db";
import { reconcileAppointmentPlanUsage, releaseAppointmentBenefits } from "./_core/bookingUsage";
import { hashPassword } from "./_core/staffAuth";
import { operationsProcedure, ownerProcedure, publicProcedure, router, superAdminProcedure, tenantProcedure } from "./_core/trpc";

const allowedAppointmentTransitions: Record<"scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show", string[]> = {
  scheduled: ["confirmed", "in_progress", "completed", "cancelled", "no_show"],
  confirmed: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function assertSlug(value: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O link deve conter letras minúsculas, números e hífens, sem espaços ou acentos." });
  }
}

const shopInput = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(160),
  ownerEmail: z.string().email().max(320),
  ownerPassword: z.string().min(12).max(256),
  monthlyFee: z.number().min(0).max(100000),
  dueDay: z.number().int().min(1).max(28),
});

const settingsInput = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  slug: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  bannerImageUrl: z.union([z.string().url().max(2048), z.string().regex(/^\/manus-storage\/[A-Za-z0-9/_-]+$/).max(2048)]).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  cancellationNoticeHours: z.number().int().min(0).max(168).optional(),
  plansVisible: z.boolean().optional(), promotionsEnabled: z.boolean().optional(), couponsEnabled: z.boolean().optional(),
  loyaltyEnabled: z.boolean().optional(), reviewsEnabled: z.boolean().optional(), galleryEnabled: z.boolean().optional(),
});

export const managementRouter = router({
  platform: router({
    summary: superAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(barbershops).orderBy(desc(barbershops.createdAt));
      const totals = rows.reduce((acc, shop) => {
        acc.total += 1;
        if (shop.status === "active") acc.active += 1;
        if (shop.status === "trial" && shop.trialEndsAt.getTime() >= Date.now()) acc.trial += 1;
        if (shop.status === "delinquent") acc.delinquent += 1;
        if (shop.status === "blocked") acc.blocked += 1;
        return acc;
      }, { total: 0, active: 0, trial: 0, delinquent: 0, blocked: 0 });
      const payments = await db.select().from(platformPayments).orderBy(desc(platformPayments.paidAt));
      totals.total; // Keep the summary fields explicit for the client contract.
      return { ...totals, systemRevenue: payments.reduce((sum, payment) => sum + payment.amount, 0), shops: rows };
    }),

    createShop: superAdminProcedure.input(shopInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const slug = slugify(input.slug);
      assertSlug(slug);
      const [sameSlug] = await db.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.slug, slug)).limit(1);
      if (sameSlug) throw new TRPCError({ code: "CONFLICT", message: "Este link já está em uso." });
      const email = input.ownerEmail.trim().toLowerCase();
      const [sameEmail] = await db.select({ id: staffAccounts.id }).from(staffAccounts).where(eq(staffAccounts.email, email)).limit(1);
      if (sameEmail) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta interna." });
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return db.transaction(async tx => {
        const [createdShop] = await tx.insert(barbershops).values({
          name: input.name.trim(), slug, status: "trial", trialEndsAt,
          monthlyFee: input.monthlyFee, dueDay: input.dueDay,
        }).$returningId();
        await tx.insert(staffAccounts).values({
          barbershopId: createdShop.id, name: input.ownerName.trim(), email,
          passwordHash: await hashPassword(input.ownerPassword), role: "owner", mustChangePassword: true,
        });
        return { id: createdShop.id, name: input.name.trim(), slug, status: "trial" as const, trialEndsAt };
      });
    }),

    updateShop: superAdminProcedure.input(z.object({
      id: z.number().int().positive(), status: z.enum(["trial", "active", "delinquent", "blocked"]).optional(),
      monthlyFee: z.number().min(0).max(100000).optional(), dueDay: z.number().int().min(1).max(28).optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...patch } = input;
      const [shop] = await db.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.id, id)).limit(1);
      if (!shop) throw new TRPCError({ code: "NOT_FOUND", message: "Barbearia não encontrada." });
      await db.update(barbershops).set(patch).where(eq(barbershops.id, id));
      return { success: true } as const;
    }),

    recordPayment: superAdminProcedure.input(z.object({
      barbershopId: z.number().int().positive(), amount: z.number().positive().max(100000),
      paidAt: z.date().optional(), periodStart: z.date().optional(), periodEnd: z.date().optional(), notes: z.string().max(220).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [shop] = await db.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.id, input.barbershopId)).limit(1);
      if (!shop) throw new TRPCError({ code: "NOT_FOUND", message: "Barbearia não encontrada." });
      const paidAt = input.paidAt ?? new Date();
      await db.transaction(async tx => {
        await tx.insert(platformPayments).values({
          barbershopId: input.barbershopId, amount: input.amount, paidAt,
          periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null,
          notes: input.notes ?? null, recordedByStaffId: ctx.staff.id,
        });
        await tx.update(barbershops).set({ status: "active", lastPaymentAt: paidAt }).where(eq(barbershops.id, input.barbershopId));
      });
      return { success: true } as const;
    }),

    deleteShop: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [shop] = await db.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.id, input.id)).limit(1);
      if (!shop) throw new TRPCError({ code: "NOT_FOUND" });
      // Retain business records for recovery/audit; remove the tenant from active use.
      await db.update(barbershops).set({ deletedAt: new Date(), status: "blocked" }).where(eq(barbershops.id, input.id));
      return { success: true, retainedAsSoftDeleted: true } as const;
    }),
  }),

  tenant: router({
    me: tenantProcedure.query(({ ctx }) => ({
      shop: { id: ctx.barbershop.id, name: ctx.barbershop.name, slug: ctx.barbershop.slug, logoUrl: ctx.barbershop.logoUrl, bannerImageUrl: ctx.barbershop.bannerImageUrl, primaryColor: ctx.barbershop.primaryColor, status: ctx.barbershop.status, timezone: ctx.barbershop.timezone, cancellationNoticeHours: ctx.barbershop.cancellationNoticeHours, plansVisible: ctx.barbershop.plansVisible, promotionsEnabled: ctx.barbershop.promotionsEnabled, couponsEnabled: ctx.barbershop.couponsEnabled, loyaltyEnabled: ctx.barbershop.loyaltyEnabled, reviewsEnabled: ctx.barbershop.reviewsEnabled, galleryEnabled: ctx.barbershop.galleryEnabled },
      staff: { id: ctx.staff.id, name: ctx.staff.name, email: ctx.staff.email, role: ctx.staff.role, barberId: ctx.staff.barberId, mustChangePassword: ctx.staff.mustChangePassword },
    })),

    createBannerUpload: ownerProcedure.input(z.object({
      fileSize: z.number().int().positive().max(5 * 1024 * 1024),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })).mutation(async ({ ctx, input }) => {
      const apiUrl = process.env.MANUS_API_URL;
      const apiKey = process.env.MANUS_API_KEY;
      if (!apiUrl || !apiKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Upload de imagens indisponível no momento." });
      const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
      const objectPath = `barbershops/${ctx.barbershop.id}/banners/${randomBytes(18).toString("hex")}.${extension}`;
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/storage/presign/put?path=${encodeURIComponent(objectPath)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível preparar o envio da imagem." });
      const payload = await response.json() as { url?: string };
      if (!payload.url) throw new TRPCError({ code: "BAD_GATEWAY", message: "O armazenamento não retornou um endereço de envio." });
      return { uploadUrl: payload.url, bannerImageUrl: `/manus-storage/${objectPath}`, contentType: input.contentType };
    }),

    updateSettings: ownerProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const patch = { ...input } as Record<string, unknown>;
      if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        assertSlug(slug);
        const [duplicate] = await db.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.slug, slug)).limit(1);
        if (duplicate && duplicate.id !== ctx.barbershop.id) throw new TRPCError({ code: "CONFLICT", message: "Este link já está em uso." });
        patch.slug = slug;
      }
      await db.update(barbershops).set(patch).where(eq(barbershops.id, ctx.barbershop.id));
      return { success: true } as const;
    }),

    services: tenantProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(services).where(eq(services.barbershopId, ctx.barbershop.id)).orderBy(asc(services.category), asc(services.name));
    }),

    createService: ownerProcedure.input(z.object({
      name: z.string().trim().min(2).max(140), category: z.string().trim().min(2).max(80), iconKey: z.string().min(1).max(64),
      price: z.number().min(0).max(100000), durationMinutes: z.number().int().min(5).max(480), isActive: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [created] = await db.insert(services).values({ ...input, barbershopId: ctx.barbershop.id }).$returningId();
      return { id: created.id };
    }),

    updateService: ownerProcedure.input(z.object({
      id: z.number().int().positive(), name: z.string().trim().min(2).max(140).optional(),
      category: z.string().trim().min(2).max(80).optional(), iconKey: z.string().min(1).max(64).optional(),
      price: z.number().min(0).max(100000).optional(), durationMinutes: z.number().int().min(5).max(480).optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...patch } = input;
      const [service] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, id), eq(services.barbershopId, ctx.barbershop.id))).limit(1);
      if (!service) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(services).set(patch).where(and(eq(services.id, id), eq(services.barbershopId, ctx.barbershop.id)));
      return { success: true } as const;
    }),

    team: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [team, accounts] = await Promise.all([
        db.select().from(barbers).where(eq(barbers.barbershopId, ctx.barbershop.id)).orderBy(asc(barbers.displayName)),
        db.select({ id: staffAccounts.id, name: staffAccounts.name, email: staffAccounts.email, role: staffAccounts.role, barberId: staffAccounts.barberId, isActive: staffAccounts.isActive })
          .from(staffAccounts).where(eq(staffAccounts.barbershopId, ctx.barbershop.id)).orderBy(asc(staffAccounts.name)),
      ]);
      return { barbers: team, accounts };
    }),

    workingHours: ownerProcedure.input(z.object({ barberId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [barber] = await db.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, ctx.barbershop.id))).limit(1);
      if (!barber) throw new TRPCError({ code: "NOT_FOUND", message: "Barbeiro não encontrado." });
      return db.select().from(barberWorkingHours).where(and(eq(barberWorkingHours.barbershopId, ctx.barbershop.id), eq(barberWorkingHours.barberId, barber.id))).orderBy(asc(barberWorkingHours.weekday));
    }),

    saveWorkingHours: ownerProcedure.input(z.object({
      barberId: z.number().int().positive(),
      hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), breakStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), breakEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), isDayOff: z.boolean() })).length(7),
    }).superRefine((input, ctx) => {
      if (new Set(input.hours.map(row => row.weekday)).size !== 7) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe uma configuração para cada dia da semana.", path: ["hours"] });
      for (const row of input.hours) {
        if (!row.isDayOff && row.startTime >= row.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O fim do expediente deve ser posterior ao início.", path: ["hours"] });
        if ((row.breakStart === null) !== (row.breakEnd === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preencha início e fim do intervalo.", path: ["hours"] });
        if (!row.isDayOff && row.breakStart && row.breakEnd && (row.breakStart <= row.startTime || row.breakEnd >= row.endTime || row.breakStart >= row.breakEnd)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O intervalo deve ficar dentro do expediente.", path: ["hours"] });
      }
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [barber] = await db.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, ctx.barbershop.id))).limit(1);
      if (!barber) throw new TRPCError({ code: "NOT_FOUND", message: "Barbeiro não encontrado." });
      await db.transaction(async tx => {
        for (const row of input.hours) await tx.insert(barberWorkingHours).values({
          barbershopId: ctx.barbershop.id, barberId: barber.id, weekday: row.weekday,
          startTime: `${row.startTime}:00`, endTime: `${row.endTime}:00`,
          breakStart: row.breakStart ? `${row.breakStart}:00` : null, breakEnd: row.breakEnd ? `${row.breakEnd}:00` : null, isDayOff: row.isDayOff,
        }).onDuplicateKeyUpdate({ set: {
          startTime: `${row.startTime}:00`, endTime: `${row.endTime}:00`,
          breakStart: row.breakStart ? `${row.breakStart}:00` : null, breakEnd: row.breakEnd ? `${row.breakEnd}:00` : null, isDayOff: row.isDayOff,
        } });
      });
      return { success: true as const };
    }),

    createTeamMember: ownerProcedure.input(z.object({
      name: z.string().trim().min(2).max(160), email: z.string().email().max(320), password: z.string().min(12).max(256),
      role: z.enum(["barber", "receptionist"]), serviceIds: z.array(z.number().int().positive()).max(100).default([]),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = input.email.trim().toLowerCase();
      const [existing] = await db.select({ id: staffAccounts.id }).from(staffAccounts).where(eq(staffAccounts.email, email)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está em uso." });
      return db.transaction(async tx => {
        let barberId: number | null = null;
        if (input.role === "barber") {
          const [barber] = await tx.insert(barbers).values({ barbershopId: ctx.barbershop.id, displayName: input.name.trim() }).$returningId();
          const createdBarberId = barber.id;
          barberId = createdBarberId;
          if (input.serviceIds.length) {
            const validServices = await tx.select({ id: services.id }).from(services).where(and(eq(services.barbershopId, ctx.barbershop.id), inArray(services.id, input.serviceIds)));
            if (validServices.length !== new Set(input.serviceIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Há serviços inválidos para esta barbearia." });
            await tx.insert(barberServices).values([...new Set(input.serviceIds)].map(serviceId => ({ barbershopId: ctx.barbershop.id, barberId: createdBarberId, serviceId })));
          }
          const standardHours = Array.from({ length: 7 }, (_, weekday) => ({
            barbershopId: ctx.barbershop.id, barberId: createdBarberId, weekday,
            startTime: "09:00:00", endTime: "18:00:00",
            breakStart: weekday === 0 ? null : "13:00:00", breakEnd: weekday === 0 ? null : "14:00:00",
            isDayOff: weekday === 0,
          }));
          await tx.insert(barberWorkingHours).values(standardHours);
        }
        const [account] = await tx.insert(staffAccounts).values({
          barbershopId: ctx.barbershop.id, name: input.name.trim(), email, passwordHash: await hashPassword(input.password),
          role: input.role, barberId, mustChangePassword: true,
        }).$returningId();
        if (barberId) await tx.update(barbers).set({ staffAccountId: account.id }).where(and(eq(barbers.id, barberId), eq(barbers.barbershopId, ctx.barbershop.id)));
        return { id: account.id, barberId, role: input.role };
      });
    }),

    reviewStats: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [teamReviews, team] = await Promise.all([
        db.select({ barberId: reviews.barberId, rating: reviews.rating, isVisible: reviews.isVisible }).from(reviews).where(eq(reviews.barbershopId, ctx.barbershop.id)),
        db.select({ id: barbers.id, name: barbers.displayName }).from(barbers).where(eq(barbers.barbershopId, ctx.barbershop.id)).orderBy(asc(barbers.displayName)),
      ]);
      return team.map(barber => {
        const ratings = teamReviews.filter(review => review.barberId === barber.id);
        const visible = ratings.filter(review => review.isVisible);
        return { barberId: barber.id, barberName: barber.name, average: visible.length ? Math.round(visible.reduce((sum, review) => sum + review.rating, 0) / visible.length * 10) / 10 : 0, count: visible.length, hiddenCount: ratings.length - visible.length };
      });
    }),

    customers: operationsProcedure.input(z.object({ search: z.string().trim().max(100).default("") })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows, completed] = await Promise.all([
        db.select().from(customers).where(eq(customers.barbershopId, ctx.barbershop.id)).orderBy(asc(customers.name)),
        db.select({ customerId: appointments.customerId, total: appointments.total, startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.barbershopId, ctx.barbershop.id), eq(appointments.status, "completed"))).orderBy(desc(appointments.startsAt)),
      ]);
      const visits = new Map<number, { count: number; spend: number; lastVisitAt: Date | null }>();
      for (const appointment of completed) {
        const current = visits.get(appointment.customerId) ?? { count: 0, spend: 0, lastVisitAt: appointment.startsAt };
        current.count += 1; current.spend += appointment.total;
        if (!current.lastVisitAt || appointment.startsAt > current.lastVisitAt) current.lastVisitAt = appointment.startsAt;
        visits.set(appointment.customerId, current);
      }
      const query = input.search.toLocaleLowerCase("pt-BR");
      return rows.filter(customer => !query || `${customer.name} ${customer.whatsapp}`.toLocaleLowerCase("pt-BR").includes(query)).map(customer => {
        const history = visits.get(customer.id) ?? { count: 0, spend: 0, lastVisitAt: null };
        return { ...customer, completedVisits: history.count, totalSpent: ctx.staff.role === "owner" ? Math.round(history.spend * 100) / 100 : null, lastVisitAt: history.lastVisitAt };
      });
    }),

    customerHistory: operationsProcedure.input(z.object({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.barbershopId, ctx.barbershop.id))).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      const rows = await db.select({ id: appointments.id, bookingRef: appointments.bookingRef, status: appointments.status, startsAt: appointments.startsAt, total: appointments.total, barberName: barbers.displayName })
        .from(appointments).leftJoin(barbers, and(eq(appointments.barberId, barbers.id), eq(appointments.barbershopId, barbers.barbershopId)))
        .where(and(eq(appointments.barbershopId, ctx.barbershop.id), eq(appointments.customerId, customer.id))).orderBy(desc(appointments.startsAt)).limit(100);
      return Promise.all(rows.map(async row => {
        const items = await db.select({ serviceName: appointmentItems.serviceName }).from(appointmentItems).where(and(eq(appointmentItems.barbershopId, ctx.barbershop.id), eq(appointmentItems.appointmentId, row.id)));
        return { ...row, total: ctx.staff.role === "owner" ? row.total : null, services: items.map(item => item.serviceName) };
      }));
    }),

    updateCustomer: ownerProcedure.input(z.object({ id: z.number().int().positive(), birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), notes: z.string().max(2000).nullable() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.id), eq(customers.barbershopId, ctx.barbershop.id))).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      await db.update(customers).set({ birthday: input.birthday ? new Date(`${input.birthday}T00:00:00.000Z`) : null, notes: input.notes }).where(and(eq(customers.id, input.id), eq(customers.barbershopId, ctx.barbershop.id)));
      return { success: true as const };
    }),

    appointmentServices: tenantProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [appointment] = await db.select({ id: appointments.id, barberId: appointments.barberId }).from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.barbershopId, ctx.barbershop.id))).limit(1);
      if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
      if (ctx.staff.role === "barber" && appointment.barberId !== ctx.staff.barberId) throw new TRPCError({ code: "FORBIDDEN", message: "Este atendimento não pertence à sua agenda." });
      return db.select({ serviceId: appointmentItems.serviceId, serviceName: appointmentItems.serviceName, coveredByPlan: appointmentItems.coveredByPlan })
        .from(appointmentItems).where(and(eq(appointmentItems.barbershopId, ctx.barbershop.id), eq(appointmentItems.appointmentId, appointment.id)));
    }),

    appointments: tenantProcedure.input(z.object({ from: z.date().optional(), to: z.date().optional(), barberId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(appointments.barbershopId, ctx.barbershop.id)];
      if (input.from) conditions.push(gte(appointments.startsAt, input.from));
      if (input.to) conditions.push(lt(appointments.startsAt, input.to));
      if (input.barberId) conditions.push(eq(appointments.barberId, input.barberId));
      if (ctx.staff.role === "barber") {
        if (!ctx.staff.barberId) throw new TRPCError({ code: "FORBIDDEN", message: "Esta conta de barbeiro não está vinculada a um profissional." });
        conditions.push(eq(appointments.barberId, ctx.staff.barberId));
      }
      const rows = await db.select({
        id: appointments.id, bookingRef: appointments.bookingRef, status: appointments.status,
        startsAt: appointments.startsAt, endsAt: appointments.endsAt, total: appointments.total,
        customerName: customers.name, whatsapp: customers.whatsapp,
        barberId: barbers.id, barberName: barbers.displayName,
      }).from(appointments)
        .innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
        .leftJoin(barbers, and(eq(appointments.barberId, barbers.id), eq(appointments.barbershopId, barbers.barbershopId)))
        .where(and(...conditions)).orderBy(asc(appointments.startsAt)).limit(500);
      return ctx.staff.role === "barber" ? rows.map(row => ({ ...row, total: null, whatsapp: null })) : rows;
    }),

    updateAppointmentStatus: tenantProcedure.input(z.object({
      id: z.number().int().positive(), status: z.enum(["confirmed", "in_progress", "completed", "cancelled", "no_show"]),
      paymentMethod: z.enum(["cash", "pix", "credit", "debit", "other"]).optional(), machineFee: z.number().min(0).max(10000).default(0),
      products: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) })).max(50).default([]),
      serviceIds: z.array(z.number().int().positive()).min(1).max(20).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.status === "completed" && !input.paymentMethod) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a forma de pagamento para concluir." });
      await db.transaction(async tx => {
        const [appointment] = await tx.select().from(appointments)
          .where(and(eq(appointments.id, input.id), eq(appointments.barbershopId, ctx.barbershop.id))).for("update").limit(1);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (ctx.staff.role === "barber" && (!ctx.staff.barberId || appointment.barberId !== ctx.staff.barberId)) throw new TRPCError({ code: "FORBIDDEN", message: "Este atendimento não pertence à sua agenda." });
        if (appointment.status === input.status) return;
        if (!allowedAppointmentTransitions[appointment.status].includes(input.status)) throw new TRPCError({ code: "CONFLICT", message: `Não é permitido alterar um agendamento de ${appointment.status} para ${input.status}.` });
        if (appointment.status === "completed" && (input.products.length || input.serviceIds)) throw new TRPCError({ code: "CONFLICT", message: "Não é possível alterar os itens de um atendimento já concluído." });
        if (input.serviceIds && input.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Ajuste os serviços ao concluir o atendimento." });
        let completionSubtotal = appointment.subtotal;
        let completionDiscount = appointment.discount;
        let completionServiceTotal = appointment.total;
        let completionDuration = appointment.totalDurationMinutes;
        let productTotal = 0;
        const productLines = [...input.products.reduce((map, line) => map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity), new Map<number, number>())].map(([productId, quantity]) => ({ productId, quantity }));
        let serviceLinesForCompletion: typeof appointmentItems.$inferInsert[] | null = null;
        let coveredPlanServiceIdsForCompletion: number[] | null = null;
        if (input.serviceIds) {
          const serviceIds = [...new Set(input.serviceIds)];
          const [currentItems, selectedServices] = await Promise.all([
            tx.select().from(appointmentItems).where(and(eq(appointmentItems.barbershopId, ctx.barbershop.id), eq(appointmentItems.appointmentId, appointment.id))),
            tx.select().from(services).where(and(eq(services.barbershopId, ctx.barbershop.id), eq(services.isActive, true), inArray(services.id, serviceIds))).for("update"),
          ]);
          if (selectedServices.length !== serviceIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há serviços desativados ou de outra barbearia." });
          if (ctx.staff.role === "barber" && appointment.barberId) {
            const allowed = await tx.select({ serviceId: barberServices.serviceId }).from(barberServices).where(and(eq(barberServices.barbershopId, ctx.barbershop.id), eq(barberServices.barberId, appointment.barberId), inArray(barberServices.serviceId, serviceIds)));
            if (allowed.length !== serviceIds.length) throw new TRPCError({ code: "FORBIDDEN", message: "Um ou mais serviços não estão habilitados para você." });
          }
          const coveredIds = new Set(currentItems.filter(item => item.coveredByPlan && item.serviceId !== null).map(item => item.serviceId!));
          const previousPlanDiscount = Math.round(currentItems.filter(item => item.coveredByPlan).reduce((sum, item) => sum + item.unitPrice, 0) * 100) / 100;
          const serviceLines = selectedServices.map(service => {
            const booked = currentItems.find(item => item.serviceId === service.id);
            return {
              barbershopId: ctx.barbershop.id, appointmentId: appointment.id, serviceId: service.id,
              serviceName: booked?.serviceName ?? service.name, unitPrice: booked?.unitPrice ?? service.price,
              durationMinutes: booked?.durationMinutes ?? service.durationMinutes,
              coveredByPlan: coveredIds.has(service.id),
            };
          });
          serviceLinesForCompletion = serviceLines;
          coveredPlanServiceIdsForCompletion = serviceLines.filter(line => line.coveredByPlan && line.serviceId !== null).map(line => line.serviceId!);
          completionSubtotal = serviceLines.reduce((sum, line) => sum + line.unitPrice, 0);
          const completionPlanDiscount = Math.round(serviceLines.filter(line => line.coveredByPlan).reduce((sum, line) => sum + line.unitPrice, 0) * 100) / 100;
          const retainedCampaignDiscount = Math.min(Math.max(0, appointment.discount - previousPlanDiscount), Math.max(0, completionSubtotal - completionPlanDiscount));
          completionDiscount = completionPlanDiscount + retainedCampaignDiscount;
          completionServiceTotal = Math.max(0, completionSubtotal - completionDiscount);
          completionDuration = serviceLines.reduce((sum, line) => sum + line.durationMinutes, 0);
        }
        const validProducts = productLines.length ? await tx.select().from(products).where(and(eq(products.barbershopId, ctx.barbershop.id), inArray(products.id, productLines.map(p => p.productId)), eq(products.isActive, true))).for("update") : [];
        if (validProducts.length !== productLines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há produtos indisponíveis ou de outra barbearia." });
        for (const line of productLines) {
          const product = validProducts.find(p => p.id === line.productId)!;
          if (product.quantity < line.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: `Estoque insuficiente para ${product.name}.` });
          productTotal += product.salePrice * line.quantity;
        }
        if (input.status === "completed" && !input.paymentMethod) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a forma de pagamento para concluir." });
        if (input.status === "completed" && appointment.status !== "completed" && serviceLinesForCompletion) {
          await tx.delete(appointmentItems).where(and(eq(appointmentItems.barbershopId, ctx.barbershop.id), eq(appointmentItems.appointmentId, appointment.id)));
          await tx.insert(appointmentItems).values(serviceLinesForCompletion);
          if (coveredPlanServiceIdsForCompletion !== null) await reconcileAppointmentPlanUsage(tx, ctx.barbershop.id, appointment.id, coveredPlanServiceIdsForCompletion);
        }
        if (input.status === "cancelled") await releaseAppointmentBenefits(tx, ctx.barbershop.id, appointment.id);
        await tx.update(appointments).set({ status: input.status, ...(input.status === "completed" ? { subtotal: completionSubtotal, discount: completionDiscount, totalDurationMinutes: completionDuration, total: completionServiceTotal + productTotal } : {}) }).where(and(eq(appointments.id, input.id), eq(appointments.barbershopId, ctx.barbershop.id)));
        if (input.status === "completed" && appointment.status !== "completed") {
          for (const line of productLines) {
            const product = validProducts.find(p => p.id === line.productId)!;
            await tx.update(products).set({ quantity: product.quantity - line.quantity }).where(and(eq(products.id, product.id), eq(products.barbershopId, ctx.barbershop.id)));
            await tx.insert(appointmentProducts).values({ barbershopId: ctx.barbershop.id, appointmentId: appointment.id, productId: product.id, quantity: line.quantity, unitPrice: product.salePrice });
            await tx.insert(stockMovements).values({ barbershopId: ctx.barbershop.id, productId: product.id, kind: "sale", quantity: line.quantity, note: `Venda no atendimento ${appointment.bookingRef}`, appointmentId: appointment.id, createdByStaffId: ctx.staff.id });
          }
          const [openCash] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, ctx.barbershop.id), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1);
          await tx.insert(financialTransactions).values({
            barbershopId: ctx.barbershop.id, kind: "income", source: "service", category: "Atendimento",
            description: `Atendimento ${appointment.bookingRef}`, amount: completionServiceTotal + productTotal,
            machineFee: input.machineFee, paymentMethod: input.paymentMethod!, appointmentId: appointment.id,
            cashSessionId: openCash?.id ?? null, paidAt: new Date(), createdByStaffId: ctx.staff.id,
          }).onDuplicateKeyUpdate({ set: { description: `Atendimento ${appointment.bookingRef}` } });
          if (appointment.barberId) {
            const [serviceLines, rules] = await Promise.all([
              tx.select().from(appointmentItems).where(and(eq(appointmentItems.barbershopId, ctx.barbershop.id), eq(appointmentItems.appointmentId, appointment.id))),
              tx.select().from(commissionRules).where(and(eq(commissionRules.barbershopId, ctx.barbershop.id), eq(commissionRules.barberId, appointment.barberId))),
            ]);
            for (const item of serviceLines) {
              const rule = (item.coveredByPlan ? rules.find(r => r.scope === "plan") : undefined)
                ?? rules.find(r => r.scope === "service" && r.serviceId === item.serviceId)
                ?? rules.find(r => r.scope === "all" || (r.scope === "service" && r.serviceId === null));
              if (!rule || rule.calculation === "chair_rent") continue;
              const base = item.unitPrice;
              const commission = item.coveredByPlan ? base * rule.planPercentage / 100 : rule.calculation === "percentage" ? base * rule.value / 100 : rule.value;
              if (commission > 0) await tx.insert(commissionEntries).values({ barbershopId: ctx.barbershop.id, barberId: appointment.barberId, appointmentId: appointment.id, description: item.serviceName, amount: commission, kind: item.coveredByPlan ? "plan" : "service" });
            }
            for (const line of productLines) {
              const product = validProducts.find(p => p.id === line.productId)!;
              const rule = rules.find(r => r.scope === "product") ?? rules.find(r => r.scope === "all");
              if (!rule || rule.calculation === "chair_rent") continue;
              const base = product.salePrice * line.quantity;
              const commission = rule.calculation === "percentage" ? base * rule.value / 100 : rule.value * line.quantity;
              if (commission > 0) await tx.insert(commissionEntries).values({ barbershopId: ctx.barbershop.id, barberId: appointment.barberId, appointmentId: appointment.id, description: `Venda: ${product.name}`, amount: commission, kind: "product" });
            }
          }
        }
      });
      return { success: true } as const;
    }),

    waitlist: ownerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(waitlistEntries).where(and(eq(waitlistEntries.barbershopId, ctx.barbershop.id), eq(waitlistEntries.status, "waiting"))).orderBy(asc(waitlistEntries.createdAt));
    }),

    updateWaitlistStatus: ownerProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["contacted", "scheduled", "cancelled"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [entry] = await db.select({ id: waitlistEntries.id }).from(waitlistEntries).where(and(eq(waitlistEntries.id, input.id), eq(waitlistEntries.barbershopId, ctx.barbershop.id), eq(waitlistEntries.status, "waiting"))).limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada da fila não encontrada." });
      await db.update(waitlistEntries).set({ status: input.status }).where(and(eq(waitlistEntries.id, entry.id), eq(waitlistEntries.barbershopId, ctx.barbershop.id)));
      return { success: true as const };
    }),
  }),
});
