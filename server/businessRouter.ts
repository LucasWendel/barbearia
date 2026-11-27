import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments, appointmentItems, barbers, barbershops, services, customers, financialTransactions, cashSessions,
  plans, planServices, customerSubscriptions, products, stockMovements, coupons, promotions,
  commissionRules, commissionEntries, commissionSettlements, recurringExpenses,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ownerProcedure, operationsProcedure, tenantProcedure, router } from "./_core/trpc";

const id = z.number().int().positive();
const amount = z.number().finite().min(0).max(1_000_000);
const date = z.date();
const range = z.object({ from: date, to: date }).refine(v => v.from <= v.to, "A data inicial deve ser anterior à final.");
const payment = z.enum(["cash", "pix", "credit", "debit", "other"]);
const dbOrThrow = async () => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." }); return db; };
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const tenantId = (ctx: { barbershop: { id: number } }) => ctx.barbershop.id;
const assertExists = (ok: unknown, message: string) => { if (!ok) throw new TRPCError({ code: "NOT_FOUND", message }); };

export const businessRouter = router({
  finance: router({
    summary: ownerProcedure.input(range).query(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      const rows = await db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), gte(financialTransactions.paidAt, input.from), lte(financialTransactions.paidAt, input.to)));
      const isSingleMonthRange = input.from.getUTCDate() === 1 && input.from.getUTCFullYear() === input.to.getUTCFullYear() && input.from.getUTCMonth() === input.to.getUTCMonth();
      let previousFrom: Date;
      let previousTo: Date;
      if (isSingleMonthRange) {
        const previousMonthStart = new Date(Date.UTC(input.from.getUTCFullYear(), input.from.getUTCMonth() - 1, 1));
        const daysInPreviousMonth = new Date(Date.UTC(previousMonthStart.getUTCFullYear(), previousMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
        const daysInCurrentMonth = new Date(Date.UTC(input.to.getUTCFullYear(), input.to.getUTCMonth() + 1, 0)).getUTCDate();
        const isFullMonth = input.to.getUTCDate() >= daysInCurrentMonth;
        const endDay = isFullMonth ? daysInPreviousMonth : Math.min(input.to.getUTCDate(), daysInPreviousMonth);
        previousFrom = new Date(Date.UTC(previousMonthStart.getUTCFullYear(), previousMonthStart.getUTCMonth(), 1, input.from.getUTCHours(), input.from.getUTCMinutes(), input.from.getUTCSeconds(), input.from.getUTCMilliseconds()));
        previousTo = new Date(Date.UTC(previousMonthStart.getUTCFullYear(), previousMonthStart.getUTCMonth(), endDay, input.to.getUTCHours(), input.to.getUTCMinutes(), input.to.getUTCSeconds(), input.to.getUTCMilliseconds()));
      } else {
        const span = Math.max(1, input.to.getTime() - input.from.getTime() + 1);
        previousTo = new Date(input.from.getTime() - 1);
        previousFrom = new Date(previousTo.getTime() - span + 1);
      }
      const previousRows = await db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), gte(financialTransactions.paidAt, previousFrom), lte(financialTransactions.paidAt, previousTo)));
      const totals = (values: typeof rows) => {
        const income = values.filter(r => r.kind === "income").reduce((sum, row) => sum + row.amount, 0);
        const expenses = values.filter(r => r.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
        const machineFees = values.reduce((sum, row) => sum + row.machineFee, 0);
        const appointmentIds = new Set(values.filter(r => r.kind === "income" && r.appointmentId !== null).map(r => r.appointmentId));
        const appointmentIncome = values.filter(r => r.kind === "income" && r.appointmentId !== null).reduce((sum, row) => sum + row.amount, 0);
        return { income, expenses, machineFees, profit: income - expenses - machineFees, averageTicket: appointmentIds.size ? appointmentIncome / appointmentIds.size : 0 };
      };
      return { ...totals(rows), transactions: rows.length, previous: totals(previousRows), previousFrom, previousTo };
    }),
    transactions: ownerProcedure.input(range.extend({ barberId: id.optional(), serviceId: id.optional(), paymentMethod: payment.optional(), kind: z.enum(["income", "expense"]).optional() })).query(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      const rows = await db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), gte(financialTransactions.paidAt, input.from), lte(financialTransactions.paidAt, input.to), input.kind ? eq(financialTransactions.kind, input.kind) : undefined, input.paymentMethod ? eq(financialTransactions.paymentMethod, input.paymentMethod) : undefined)).orderBy(desc(financialTransactions.paidAt)).limit(1000);
      if (!input.barberId && !input.serviceId) return rows;
      const barberAppointmentIds = input.barberId
        ? new Set((await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.barbershopId, tid), eq(appointments.barberId, input.barberId)))).map(a => a.id))
        : null;
      const serviceAppointmentIds = input.serviceId
        ? new Set((await db.select({ appointmentId: appointmentItems.appointmentId }).from(appointmentItems).where(and(eq(appointmentItems.barbershopId, tid), eq(appointmentItems.serviceId, input.serviceId)))).map(item => item.appointmentId))
        : null;
      return rows.filter(r => r.appointmentId !== null && (!barberAppointmentIds || barberAppointmentIds.has(r.appointmentId)) && (!serviceAppointmentIds || serviceAppointmentIds.has(r.appointmentId)));
    }),
    createTransaction: ownerProcedure.input(z.object({ kind: z.enum(["income", "expense"]), category: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(240), amount: amount.positive(), machineFee: amount.max(10000).default(0), paymentMethod: payment.nullable().optional(), dueAt: date.nullable().optional(), paidAt: date.nullable().optional(), recurring: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); const paidAt = input.paidAt ?? (input.dueAt ? null : new Date());
      return db.transaction(async tx => {
        const [openCash] = paidAt ? await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1) : [];
        const [created] = await tx.insert(financialTransactions).values({ ...input, barbershopId: tid, source: "other", paymentMethod: input.paymentMethod ?? null, dueAt: input.dueAt ?? null, paidAt, cashSessionId: openCash?.id ?? null, createdByStaffId: ctx.staff.id }).$returningId();
        return { id: created.id };
      });
    }),
    accountsPayable: ownerProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tenantId(ctx)), eq(financialTransactions.kind, "expense"), sql`${financialTransactions.paidAt} IS NULL`)).orderBy(asc(financialTransactions.dueAt)).limit(500);
    }),
    markPaid: ownerProcedure.input(z.object({ transactionId: id, paymentMethod: payment, machineFee: amount.max(10000).default(0) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); const paidAt = new Date();
      return db.transaction(async tx => {
        const [transaction] = await tx.select().from(financialTransactions).where(and(eq(financialTransactions.id, input.transactionId), eq(financialTransactions.barbershopId, tid), eq(financialTransactions.kind, "expense"), sql`${financialTransactions.paidAt} IS NULL`)).for("update").limit(1);
        assertExists(transaction, "Conta não encontrada ou já paga.");
        const [openCash] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1);
        await tx.update(financialTransactions).set({ paidAt, paymentMethod: input.paymentMethod, machineFee: input.machineFee, cashSessionId: openCash?.id ?? transaction.cashSessionId, createdByStaffId: ctx.staff.id }).where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.barbershopId, tid)));
        return { success: true as const };
      });
    }),
    recurringList: ownerProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return db.select().from(recurringExpenses).where(and(eq(recurringExpenses.barbershopId, tenantId(ctx)), eq(recurringExpenses.isActive, true))).orderBy(asc(recurringExpenses.nextDueAt)).limit(300);
    }),
    createRecurring: ownerProcedure.input(z.object({ name: z.string().trim().min(1).max(180), category: z.string().trim().min(1).max(100), amount: amount.positive(), recurrence: z.enum(["weekly", "monthly", "yearly"]).default("monthly"), nextDueAt: date })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const [created] = await db.insert(recurringExpenses).values({ ...input, barbershopId: tenantId(ctx), isActive: true }).$returningId();
      return { id: created.id };
    }),
    cashState: operationsProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      const [session] = await db.select().from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).limit(1);
      if (!session) return { isOpen: false as const };
      const rows = await db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), eq(financialTransactions.cashSessionId, session.id), sql`${financialTransactions.paidAt} IS NOT NULL`));
      const expected = session.openingFloat + rows.reduce((n, r) => n + (r.paymentMethod === "cash" ? (r.kind === "income" ? r.amount : -r.amount) : 0), 0);
      return { isOpen: true as const, openedAt: session.openedAt, openingFloat: session.openingFloat, expectedCash: expected };
    }),
    openCash: operationsProcedure.input(z.object({ openingFloat: amount.default(0), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      return db.transaction(async tx => {
        const [tenantLock] = await tx.select({ id: barbershops.id }).from(barbershops).where(eq(barbershops.id, tid)).for("update").limit(1);
        if (!tenantLock) throw new TRPCError({ code: "NOT_FOUND", message: "Barbearia não encontrada." });
        const [open] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).for("update").limit(1);
        if (open) throw new TRPCError({ code: "CONFLICT", message: "Já existe um caixa aberto." });
        const [created] = await tx.insert(cashSessions).values({ barbershopId: tid, openedByStaffId: ctx.staff.id, openingFloat: input.openingFloat, notes: input.notes ?? null }).$returningId();
        return { id: created.id };
      });
    }),
    closeCash: operationsProcedure.input(z.object({ countedTotal: amount, notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      return db.transaction(async tx => {
        const [session] = await tx.select().from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).for("update").limit(1);
        assertExists(session, "Não há caixa aberto.");
        const rows = await tx.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), eq(financialTransactions.cashSessionId, session.id), sql`${financialTransactions.paidAt} IS NOT NULL`));
        const expected = session.openingFloat + rows.reduce((n, r) => n + (r.paymentMethod === "cash" ? (r.kind === "income" ? r.amount : -r.amount) : 0), 0);
        await tx.update(cashSessions).set({ closedByStaffId: ctx.staff.id, closedAt: new Date(), expectedTotal: expected, countedTotal: input.countedTotal, difference: input.countedTotal - expected, notes: input.notes ?? session.notes }).where(and(eq(cashSessions.id, session.id), eq(cashSessions.barbershopId, tid)));
        return { expectedCash: expected, countedTotal: input.countedTotal, difference: input.countedTotal - expected };
      });
    }),
  }),
  plans: router({
    list: operationsProcedure.query(async ({ ctx }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); const rows = await db.select().from(plans).where(eq(plans.barbershopId, tid)).orderBy(asc(plans.name)); const links = await db.select().from(planServices).where(eq(planServices.barbershopId, tid)); return rows.map(p => ({ ...p, serviceIds: links.filter(x => x.planId === p.id).map(x => x.serviceId) })); }),
    create: ownerProcedure.input(z.object({ name: z.string().trim().min(2).max(140), description: z.string().max(2000).nullable().optional(), monthlyPrice: amount.positive(), usageLimit: z.number().int().positive().max(1000).nullable().optional(), validityDays: z.number().int().positive().max(3650).nullable().optional(), isActive: z.boolean().default(true), serviceIds: z.array(id).max(100).default([]) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => {
        const ids = [...new Set(input.serviceIds)]; if (ids.length) { const valid = await tx.select({ id: services.id }).from(services).where(and(eq(services.barbershopId, tid), inArray(services.id, ids))); if (valid.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há serviços inválidos." }); }
        const [p] = await tx.insert(plans).values({ barbershopId: tid, name: input.name, description: input.description ?? null, monthlyPrice: input.monthlyPrice, usageLimit: input.usageLimit ?? null, validityDays: input.validityDays ?? null, isActive: input.isActive }).$returningId();
        if (ids.length) await tx.insert(planServices).values(ids.map(serviceId => ({ barbershopId: tid, planId: p.id, serviceId }))); return { id: p.id };
      });
    }),
    update: ownerProcedure.input(z.object({ id, name: z.string().trim().min(2).max(140).optional(), description: z.string().max(2000).nullable().optional(), monthlyPrice: amount.positive().optional(), usageLimit: z.number().int().positive().max(1000).nullable().optional(), validityDays: z.number().int().positive().max(3650).nullable().optional(), isActive: z.boolean().optional(), serviceIds: z.array(id).max(100).optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => {
        const [p] = await tx.select({ id: plans.id }).from(plans).where(and(eq(plans.id, input.id), eq(plans.barbershopId, tid))).limit(1); assertExists(p, "Plano não encontrado.");
        const { id: pid, serviceIds, ...patch } = input; if (Object.keys(patch).length) await tx.update(plans).set(patch).where(and(eq(plans.id, pid), eq(plans.barbershopId, tid)));
        if (serviceIds) { const ids = [...new Set(serviceIds)]; if (ids.length) { const valid = await tx.select({ id: services.id }).from(services).where(and(eq(services.barbershopId, tid), inArray(services.id, ids))); if (valid.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há serviços inválidos." }); } await tx.delete(planServices).where(and(eq(planServices.planId, pid), eq(planServices.barbershopId, tid))); if (ids.length) await tx.insert(planServices).values(ids.map(serviceId => ({ barbershopId: tid, planId: pid, serviceId }))); }
        return { success: true as const };
      });
    }),
    subscribe: ownerProcedure.input(z.object({ customerId: id, planId: id, cycleStartsAt: date.optional(), paymentMethod: payment, amount: amount.positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => {
        const [[c], [p]] = await Promise.all([tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.barbershopId, tid))).limit(1), tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.barbershopId, tid), eq(plans.isActive, true))).limit(1)]); assertExists(c && p, "Cliente ou plano inválido.");
        const start = input.cycleStartsAt ?? new Date(); const end = new Date(start); end.setDate(end.getDate() + (p.validityDays ?? 30));
        const [sub] = await tx.insert(customerSubscriptions).values({ barbershopId: tid, customerId: c.id, planId: p.id, cycleStartsAt: start, cycleEndsAt: end, status: "active" }).$returningId();
        const [openCash] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1);
        await tx.insert(financialTransactions).values({ barbershopId: tid, kind: "income", source: "plan", category: "Plano", description: `Inscrição: ${p.name}`, amount: input.amount ?? p.monthlyPrice, machineFee: 0, paymentMethod: input.paymentMethod, subscriptionId: sub.id, cashSessionId: openCash?.id ?? null, paidAt: new Date(), createdByStaffId: ctx.staff.id }); return { id: sub.id, cycleEndsAt: end };
      });
    }),
    recordPayment: ownerProcedure.input(z.object({ subscriptionId: id, amount: amount.positive(), paymentMethod: payment, cycleStartsAt: date.optional(), cycleEndsAt: date.optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => {
        const [sub] = await tx.select().from(customerSubscriptions).where(and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.barbershopId, tid))).for("update").limit(1); assertExists(sub, "Inscrição não encontrada.");
        const [p] = await tx.select().from(plans).where(and(eq(plans.id, sub.planId), eq(plans.barbershopId, tid))).limit(1); assertExists(p, "Plano não encontrado.");
        const start = input.cycleStartsAt ?? new Date(); const end = input.cycleEndsAt ?? new Date(start.getTime() + (p.validityDays ?? 30) * 86400000); if (end <= start) throw new TRPCError({ code: "BAD_REQUEST", message: "Validade inválida." });
        await tx.update(customerSubscriptions).set({ status: "active", cycleStartsAt: start, cycleEndsAt: end, usageCount: 0, lastPaymentAt: new Date() }).where(and(eq(customerSubscriptions.id, sub.id), eq(customerSubscriptions.barbershopId, tid)));
        const [openCash] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1);
        await tx.insert(financialTransactions).values({ barbershopId: tid, kind: "income", source: "plan", category: "Plano", description: `Pagamento: ${p.name}`, amount: input.amount, machineFee: 0, paymentMethod: input.paymentMethod, subscriptionId: sub.id, cashSessionId: openCash?.id ?? null, paidAt: new Date(), createdByStaffId: ctx.staff.id }); return { success: true as const, cycleEndsAt: end };
      });
    }),
  }),
  subscriptions: router({
    list: operationsProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      return db.select({ subscription: customerSubscriptions, customerName: customers.name, customerWhatsapp: customers.whatsapp, planName: plans.name, planPrice: plans.monthlyPrice })
        .from(customerSubscriptions)
        .innerJoin(customers, and(eq(customerSubscriptions.customerId, customers.id), eq(customerSubscriptions.barbershopId, customers.barbershopId)))
        .innerJoin(plans, and(eq(customerSubscriptions.planId, plans.id), eq(customerSubscriptions.barbershopId, plans.barbershopId)))
        .where(eq(customerSubscriptions.barbershopId, tid)).orderBy(desc(customerSubscriptions.cycleEndsAt)).limit(500);
    }),
    updateStatus: ownerProcedure.input(z.object({ subscriptionId: id, status: z.enum(["active", "expired", "delinquent", "paused", "cancelled"]) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      const [subscription] = await db.select({ id: customerSubscriptions.id }).from(customerSubscriptions).where(and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.barbershopId, tid))).limit(1);
      assertExists(subscription, "Assinatura não encontrada.");
      await db.update(customerSubscriptions).set({ status: input.status }).where(and(eq(customerSubscriptions.id, input.subscriptionId), eq(customerSubscriptions.barbershopId, tid)));
      return { success: true as const };
    }),
  }),
  inventory: router({
    products: tenantProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow(); const rows = await db.select().from(products).where(and(eq(products.barbershopId, tenantId(ctx)), eq(products.isActive, true))).orderBy(asc(products.name));
      return rows.map(({ costPrice, minimumQuantity, ...product }) => ctx.staff.role === "owner" ? { ...product, costPrice, minimumQuantity } : product);
    }),
    createProduct: ownerProcedure.input(z.object({ name: z.string().trim().min(1).max(180), sku: z.string().trim().max(64).nullable().optional(), costPrice: amount.default(0), salePrice: amount.default(0), quantity: z.number().int().min(0).max(1_000_000).default(0), minimumQuantity: z.number().int().min(0).max(1_000_000).default(0), useInternally: z.boolean().default(false) })).mutation(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => { const [p] = await tx.insert(products).values({ ...input, barbershopId: tid, sku: input.sku ?? null }).$returningId(); if (input.quantity) await tx.insert(stockMovements).values({ barbershopId: tid, productId: p.id, kind: "in", quantity: input.quantity, note: "Estoque inicial", createdByStaffId: ctx.staff.id }); return { id: p.id }; }); }),
    recordMovement: ownerProcedure.input(z.object({ productId: id, kind: z.enum(["in", "out", "internal_use", "adjustment"]), quantity: z.number().int().positive().max(100000), note: z.string().max(220).optional() })).mutation(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => { const [p] = await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.barbershopId, tid))).for("update").limit(1); assertExists(p, "Produto não encontrado."); const next = input.kind === "in" ? p.quantity + input.quantity : input.kind === "adjustment" ? input.quantity : p.quantity - input.quantity; if (next < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Estoque insuficiente." }); await tx.update(products).set({ quantity: next }).where(and(eq(products.id, p.id), eq(products.barbershopId, tid))); await tx.insert(stockMovements).values({ barbershopId: tid, productId: p.id, kind: input.kind, quantity: input.quantity, note: input.note ?? null, createdByStaffId: ctx.staff.id }); return { quantity: next }; }); }),
  }),
  campaigns: router({
    coupons: ownerProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return db.select().from(coupons).where(eq(coupons.barbershopId, tenantId(ctx))).orderBy(desc(coupons.createdAt)).limit(500);
    }),
    createCoupon: ownerProcedure.input(z.object({
      code: z.string().trim().min(3).max(48).regex(/^[a-zA-Z0-9_-]+$/),
      discountType: z.enum(["percentage", "fixed"]),
      discountValue: amount.positive(),
      validFrom: date.nullable().optional(),
      validUntil: date.nullable().optional(),
      usageLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
    }).refine(value => value.discountType !== "percentage" || value.discountValue <= 100, { message: "O percentual não pode passar de 100%.", path: ["discountValue"] })
      .refine(value => !value.validFrom || !value.validUntil || value.validFrom <= value.validUntil, { message: "A data inicial deve ser anterior à final.", path: ["validUntil"] }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const tid = tenantId(ctx);
        const code = input.code.toUpperCase();
        const [existing] = await db.select({ id: coupons.id }).from(coupons).where(and(eq(coupons.barbershopId, tid), eq(coupons.code, code))).limit(1);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este código já existe nesta barbearia." });
        const [created] = await db.insert(coupons).values({ ...input, code, barbershopId: tid, validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null, usageLimit: input.usageLimit ?? null }).$returningId();
        return { id: created.id };
      }),
    setCouponActive: ownerProcedure.input(z.object({ id, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const [found] = await db.select({ id: coupons.id }).from(coupons).where(and(eq(coupons.id, input.id), eq(coupons.barbershopId, tenantId(ctx)))).limit(1);
      assertExists(found, "Cupom não encontrado.");
      await db.update(coupons).set({ isActive: input.isActive }).where(and(eq(coupons.id, input.id), eq(coupons.barbershopId, tenantId(ctx))));
      return { success: true as const };
    }),
    promotions: ownerProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return db.select().from(promotions).where(eq(promotions.barbershopId, tenantId(ctx))).orderBy(desc(promotions.createdAt)).limit(500);
    }),
    createPromotion: ownerProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      kind: z.enum(["service_discount", "time_discount", "combo"]),
      discountType: z.enum(["percentage", "fixed"]),
      discountValue: amount.positive(),
      serviceIds: z.array(id).max(100).default([]),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
      endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
      startsAt: date.nullable().optional(),
      endsAt: date.nullable().optional(),
    })
      .refine(v => v.discountType !== "percentage" || v.discountValue <= 100, { message: "O percentual não pode passar de 100%.", path: ["discountValue"] })
      .refine(v => v.kind !== "service_discount" || v.serviceIds.length > 0, { message: "Selecione ao menos um serviço.", path: ["serviceIds"] })
      .refine(v => v.kind !== "combo" || v.serviceIds.length >= 2, { message: "Um combo precisa incluir pelo menos dois serviços.", path: ["serviceIds"] })
      .refine(v => v.kind !== "time_discount" || (v.daysOfWeek.length > 0 && Boolean(v.startTime && v.endTime) && v.startTime! < v.endTime!), { message: "Informe dias e uma faixa de horário válida.", path: ["daysOfWeek"] })
      .refine(v => !v.startsAt || !v.endsAt || v.startsAt <= v.endsAt, { message: "A data inicial deve ser anterior à final.", path: ["endsAt"] }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const tid = tenantId(ctx);
        const serviceIds = [...new Set(input.serviceIds)];
        if (serviceIds.length !== input.serviceIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Remova serviços repetidos." });
        if (serviceIds.length) {
          const valid = await db.select({ id: services.id }).from(services).where(and(eq(services.barbershopId, tid), inArray(services.id, serviceIds)));
          if (valid.length !== serviceIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há serviços que não pertencem a esta barbearia." });
        }
        const [created] = await db.insert(promotions).values({
          barbershopId: tid, name: input.name, kind: input.kind, discountType: input.discountType, discountValue: input.discountValue,
          config: { serviceIds, daysOfWeek: [...new Set(input.daysOfWeek)], startTime: input.startTime ?? null, endTime: input.endTime ?? null },
          startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, isActive: true,
        }).$returningId();
        return { id: created.id };
      }),
    setPromotionActive: ownerProcedure.input(z.object({ id, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const [found] = await db.select({ id: promotions.id }).from(promotions).where(and(eq(promotions.id, input.id), eq(promotions.barbershopId, tenantId(ctx)))).limit(1);
      assertExists(found, "Promoção não encontrada.");
      await db.update(promotions).set({ isActive: input.isActive }).where(and(eq(promotions.id, input.id), eq(promotions.barbershopId, tenantId(ctx))));
      return { success: true as const };
    }),
  }),
  commissions: router({
    mine: tenantProcedure.input(range.optional()).query(async ({ ctx, input }) => { if (ctx.staff.role !== "barber" || !ctx.staff.barberId) throw new TRPCError({ code: "FORBIDDEN", message: "Consulta disponível apenas para barbeiro." }); const db = await dbOrThrow(); const tid = tenantId(ctx); const filters = [eq(commissionEntries.barbershopId, tid), eq(commissionEntries.barberId, ctx.staff.barberId)]; if (input) filters.push(gte(commissionEntries.createdAt, input.from), lte(commissionEntries.createdAt, input.to)); return db.select().from(commissionEntries).where(and(...filters)).orderBy(desc(commissionEntries.createdAt)).limit(500); }),
    rules: ownerProcedure.input(z.object({ barberId: id.optional() }).optional()).query(async ({ ctx, input }) => { const db = await dbOrThrow(); return db.select().from(commissionRules).where(and(eq(commissionRules.barbershopId, tenantId(ctx)), input?.barberId ? eq(commissionRules.barberId, input.barberId) : undefined)); }),
    configureRule: ownerProcedure.input(z.object({ barberId: id, serviceId: id.nullable().optional(), scope: z.enum(["service", "product", "plan", "all"]).default("all"), calculation: z.enum(["percentage", "fixed_per_service", "chair_rent"]).default("percentage"), value: amount, planPercentage: amount.max(100).default(0) }).refine(v => v.calculation !== "percentage" || v.value <= 100, { message: "Percentual não pode exceder 100%.", path: ["value"] })).mutation(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); const [b] = await db.select().from(barbers).where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, tid))).limit(1); assertExists(b, "Barbeiro não encontrado."); if (input.serviceId) { const [s] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.barbershopId, tid))).limit(1); assertExists(s, "Serviço não encontrado."); } const serviceFilter = input.serviceId == null ? sql`${commissionRules.serviceId} IS NULL` : eq(commissionRules.serviceId, input.serviceId); const [existing] = await db.select({ id: commissionRules.id }).from(commissionRules).where(and(eq(commissionRules.barbershopId, tid), eq(commissionRules.barberId, input.barberId), eq(commissionRules.scope, input.scope), serviceFilter)).limit(1); if (existing) { await db.update(commissionRules).set({ calculation: input.calculation, value: input.value, planPercentage: input.planPercentage }).where(and(eq(commissionRules.id, existing.id), eq(commissionRules.barbershopId, tid))); return { id: existing.id }; } const [r] = await db.insert(commissionRules).values({ ...input, barbershopId: tid, serviceId: input.serviceId ?? null }).$returningId(); return { id: r.id }; }),
    periodSummary: ownerProcedure.input(range.extend({ barberId: id.optional() })).query(async ({ ctx, input }) => { const db = await dbOrThrow(); const filters = [eq(commissionEntries.barbershopId, tenantId(ctx)), gte(commissionEntries.createdAt, input.from), lte(commissionEntries.createdAt, input.to), input.barberId ? eq(commissionEntries.barberId, input.barberId) : undefined]; const rows = await db.select().from(commissionEntries).where(and(...filters)); return rows.reduce((a, r) => { a.total += r.amount; a.count++; a.byBarber[r.barberId] = (a.byBarber[r.barberId] ?? 0) + r.amount; return a; }, { total: 0, count: 0, byBarber: {} as Record<number, number> }); }),
    settlements: ownerProcedure.input(z.object({ from: date.optional(), to: date.optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await dbOrThrow(); const tid = tenantId(ctx);
      return db.select({ settlement: commissionSettlements, barberName: barbers.displayName }).from(commissionSettlements)
        .innerJoin(barbers, and(eq(commissionSettlements.barberId, barbers.id), eq(commissionSettlements.barbershopId, barbers.barbershopId)))
        .where(and(eq(commissionSettlements.barbershopId, tid), input?.from ? gte(commissionSettlements.createdAt, input.from) : undefined, input?.to ? lte(commissionSettlements.createdAt, input.to) : undefined))
        .orderBy(desc(commissionSettlements.createdAt)).limit(300);
    }),
    createSettlement: ownerProcedure.input(range.extend({ barberId: id, discounts: amount.default(0), advances: amount.default(0) })).mutation(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => { const [b] = await tx.select().from(barbers).where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, tid))).limit(1); assertExists(b, "Barbeiro não encontrado."); const rows = await tx.select().from(commissionEntries).where(and(eq(commissionEntries.barbershopId, tid), eq(commissionEntries.barberId, input.barberId), gte(commissionEntries.createdAt, input.from), lte(commissionEntries.createdAt, input.to), sql`${commissionEntries.settlementId} IS NULL`)); const gross = rows.reduce((s, r) => s + r.amount, 0); const net = Math.max(0, gross - input.discounts - input.advances); const [sett] = await tx.insert(commissionSettlements).values({ barbershopId: tid, barberId: input.barberId, periodStart: new Date(input.from.getTime() - input.from.getTimezoneOffset() * 60000), periodEnd: new Date(input.to.getTime() - input.to.getTimezoneOffset() * 60000), grossAmount: gross, discounts: input.discounts, advances: input.advances, netAmount: net, status: "open" }).$returningId(); if (rows.length) await tx.update(commissionEntries).set({ settlementId: sett.id }).where(and(eq(commissionEntries.barbershopId, tid), inArray(commissionEntries.id, rows.map(r => r.id)))); return { id: sett.id, grossAmount: gross, netAmount: net }; }); }),
    paySettlement: ownerProcedure.input(z.object({ settlementId: id, paymentMethod: payment })).mutation(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); return db.transaction(async tx => { const [s] = await tx.select().from(commissionSettlements).where(and(eq(commissionSettlements.id, input.settlementId), eq(commissionSettlements.barbershopId, tid))).for("update").limit(1); assertExists(s, "Fechamento não encontrado."); if (s.status === "paid") throw new TRPCError({ code: "CONFLICT", message: "Este fechamento já foi pago." }); const paidAt = new Date(); await tx.update(commissionSettlements).set({ status: "paid", paidAt }).where(and(eq(commissionSettlements.id, s.id), eq(commissionSettlements.barbershopId, tid))); const [openCash] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(and(eq(cashSessions.barbershopId, tid), sql`${cashSessions.closedAt} IS NULL`)).orderBy(desc(cashSessions.openedAt)).for("update").limit(1);
        await tx.insert(financialTransactions).values({ barbershopId: tid, kind: "expense", source: "commission", category: "Comissões", description: `Comissão barbeiro #${s.barberId}`, amount: s.netAmount, machineFee: 0, paymentMethod: input.paymentMethod, commissionSettlementId: s.id, cashSessionId: openCash?.id ?? null, paidAt, createdByStaffId: ctx.staff.id }); return { success: true as const }; }); }),
  }),
  report: router({ summary: ownerProcedure.input(range).query(async ({ ctx, input }) => { const db = await dbOrThrow(); const tid = tenantId(ctx); const rows = await db.select().from(financialTransactions).where(and(eq(financialTransactions.barbershopId, tid), gte(financialTransactions.paidAt, input.from), lte(financialTransactions.paidAt, input.to))); const income = rows.filter(r => r.kind === "income").reduce((s, r) => s + r.amount, 0); const expenses = rows.filter(r => r.kind === "expense").reduce((s, r) => s + r.amount, 0); const byCategory = rows.reduce((a, r) => { const k = `${r.kind}:${r.category}`; a[k] = (a[k] ?? 0) + r.amount; return a; }, {} as Record<string, number>); return { period: input, income, expenses, profit: income - expenses, byCategory }; }) }),
});
