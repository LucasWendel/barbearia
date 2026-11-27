import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  appointmentItems,
  barberServices,
  barberTimeBlocks,
  barberWorkingHours,
  barbers,
  barbershops,
  customers,
  customerSubscriptions,
  coupons,
  couponUses,
  planUsage,
  planServices,
  plans,
  promotions,
  reviews,
  services,
  waitlistEntries,
} from "../drizzle/schema";
import { getDb } from "./db";
import { releaseAppointmentBenefits } from "./_core/bookingUsage";
import { publicProcedure, router } from "./_core/trpc";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const digits = (value: string) => value.replace(/\D/g, "");
const requestHits = new Map<string, { count: number; since: number }>();

function publicRateLimit(key: string) {
  const now = Date.now();
  const existing = requestHits.get(key);
  if (!existing || now - existing.since > 60_000) {
    requestHits.set(key, { count: 1, since: now });
    return false;
  }
  existing.count += 1;
  return existing.count > 12;
}

function toLocalParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(value);
  const out = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), weekday: out.weekday,
  };
}

function localDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(localAsUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = toLocalParts(candidate, timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    candidate = new Date(localAsUtc - (actualAsUtc - candidate.getTime()));
  }
  return candidate;
}

function dayOfWeek(date: string, timezone: string): number {
  const day = toLocalParts(localDateTimeToUtc(date, "12:00", timezone), timezone).weekday;
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[day] ?? 0;
}

function timeMinutes(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(date: Date, timezone: string) {
  const parts = toLocalParts(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function localToday(timezone: string) {
  const now = toLocalParts(new Date(), timezone);
  return `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
}

async function getAvailableTimes(conn: any, barbershopId: number, barberId: number, date: string, duration: number, timezone: string, excludeAppointmentId?: number) {
  const weekday = dayOfWeek(date, timezone);
  const [hours] = await conn.select().from(barberWorkingHours)
    .where(and(eq(barberWorkingHours.barbershopId, barbershopId), eq(barberWorkingHours.barberId, barberId), eq(barberWorkingHours.weekday, weekday)))
    .limit(1);
  if (!hours || hours.isDayOff) return [] as string[];

  const open = timeMinutes(hours.startTime);
  const close = timeMinutes(hours.endTime);
  if (open === null || close === null || close <= open) return [] as string[];
  const breakStart = timeMinutes(hours.breakStart);
  const breakEnd = timeMinutes(hours.breakEnd);
  const dayStart = localDateTimeToUtc(date, "00:00", timezone);
  const dayEnd = localDateTimeToUtc(date, "23:59", timezone);
  const [blocks, booked] = await Promise.all([
    conn.select().from(barberTimeBlocks).where(and(
      eq(barberTimeBlocks.barbershopId, barbershopId), eq(barberTimeBlocks.barberId, barberId),
      lt(barberTimeBlocks.startsAt, dayEnd), gt(barberTimeBlocks.endsAt, dayStart),
    )),
    conn.select().from(appointments).where(and(
      eq(appointments.barbershopId, barbershopId), eq(appointments.barberId, barberId),
      lt(appointments.startsAt, dayEnd), gt(appointments.endsAt, dayStart),
      notInArray(appointments.status, ["cancelled", "no_show"]),
      excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
    )),
  ]);
  const now = Date.now();
  const results: string[] = [];
  for (let start = open; start + duration <= close; start += 15) {
    const end = start + duration;
    if (breakStart !== null && breakEnd !== null && start < breakEnd && end > breakStart) continue;
    const startTime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    const startsAt = localDateTimeToUtc(date, startTime, timezone);
    const endsAt = localDateTimeToUtc(date, endTime, timezone);
    if (startsAt.getTime() <= now) continue;
    const hasBlock = blocks.some((block: { startsAt: Date; endsAt: Date }) => block.startsAt < endsAt && block.endsAt > startsAt);
    const hasAppointment = booked.some((appointment: { startsAt: Date; endsAt: Date }) => appointment.startsAt < endsAt && appointment.endsAt > startsAt);
    if (!hasBlock && !hasAppointment) results.push(startTime);
  }
  return results;
}

async function getPlanCoverage(conn: any, barbershopId: number, customerId: number, serviceIds: number[], lock = false) {
  const subscriptionsQuery = conn.select({ subscription: customerSubscriptions, plan: plans })
    .from(customerSubscriptions).innerJoin(plans, and(eq(customerSubscriptions.planId, plans.id), eq(customerSubscriptions.barbershopId, plans.barbershopId)))
    .where(and(eq(customerSubscriptions.barbershopId, barbershopId), eq(customerSubscriptions.customerId, customerId), eq(customerSubscriptions.status, "active"), eq(plans.isActive, true), gt(customerSubscriptions.cycleEndsAt, new Date())))
    .orderBy(asc(customerSubscriptions.cycleEndsAt));
  const subscriptions = await (lock ? subscriptionsQuery.for("update") : subscriptionsQuery);
  for (const row of subscriptions) {
    if (row.plan.usageLimit !== null && row.subscription.usageCount >= row.plan.usageLimit) continue;
    const coveredServices = await conn.select({ serviceId: planServices.serviceId }).from(planServices)
      .where(and(eq(planServices.barbershopId, barbershopId), eq(planServices.planId, row.plan.id), inArray(planServices.serviceId, serviceIds)));
    if (coveredServices.length) return { subscriptionId: row.subscription.id, planName: row.plan.name, coveredServiceIds: coveredServices.map((item: { serviceId: number }) => item.serviceId) as number[] };
  }
  return null;
}

async function getValidCoupon(conn: any, barbershopId: number, enabled: boolean, code?: string, lock = false) {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;
  if (!enabled) throw new TRPCError({ code: "BAD_REQUEST", message: "Cupons não estão habilitados nesta barbearia." });
  let query = conn.select().from(coupons).where(and(eq(coupons.barbershopId, barbershopId), eq(coupons.code, normalized), eq(coupons.isActive, true))).limit(1);
  if (lock) query = query.for("update");
  const [coupon] = await query;
  const now = new Date();
  if (!coupon || (coupon.validFrom && coupon.validFrom > now) || (coupon.validUntil && coupon.validUntil < now) || (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cupom inválido, expirado ou sem usos disponíveis." });
  }
  return coupon;
}

function calculateCouponDiscount(coupon: NonNullable<Awaited<ReturnType<typeof getValidCoupon>>>, remaining: number) {
  const raw = coupon.discountType === "percentage" ? remaining * coupon.discountValue / 100 : coupon.discountValue;
  return Math.round(Math.min(remaining, raw) * 100) / 100;
}

async function getApplicablePromotion(conn: any, barbershopId: number, enabled: boolean, selectedServices: Array<{ id: number; price: number }>, startsAt: Date | null, date: string | undefined, time: string | undefined, timezone: string) {
  if (!enabled) return null;
  const rows = await conn.select().from(promotions).where(and(eq(promotions.barbershopId, barbershopId), eq(promotions.isActive, true)));
  const selectedIds = new Set(selectedServices.map(service => service.id));
  const weekday = date && time ? dayOfWeek(date, timezone) : null;
  const startMinutes = time ? timeMinutes(time) : null;
  let best: { name: string; discount: number } | null = null;
  for (const promotion of rows) {
    if ((promotion.startsAt && (!startsAt || promotion.startsAt > startsAt)) || (promotion.endsAt && (!startsAt || promotion.endsAt < startsAt))) continue;
    const config = (promotion.config && typeof promotion.config === "object" ? promotion.config : {}) as { serviceIds?: unknown; daysOfWeek?: unknown; startTime?: unknown; endTime?: unknown };
    const serviceIds = Array.isArray(config.serviceIds) ? config.serviceIds.filter((value): value is number => typeof value === "number" && Number.isInteger(value)) : [];
    if (promotion.kind === "combo" && (serviceIds.length < 2 || !serviceIds.every(id => selectedIds.has(id)))) continue;
    if (promotion.kind === "service_discount" && (!serviceIds.length || !serviceIds.some(id => selectedIds.has(id)))) continue;
    if (promotion.kind === "time_discount") {
      const days = Array.isArray(config.daysOfWeek) ? config.daysOfWeek.filter((value): value is number => typeof value === "number" && Number.isInteger(value)) : [];
      const fromMinutes = typeof config.startTime === "string" ? timeMinutes(config.startTime) : null;
      const untilMinutes = typeof config.endTime === "string" ? timeMinutes(config.endTime) : null;
      if (weekday === null || startMinutes === null || !days.includes(weekday) || fromMinutes === null || untilMinutes === null || startMinutes < fromMinutes || startMinutes >= untilMinutes) continue;
    }
    const eligible = selectedServices.filter(service => !serviceIds.length || serviceIds.includes(service.id));
    const base = eligible.reduce((sum, service) => sum + service.price, 0);
    if (base <= 0) continue;
    const raw = promotion.discountType === "percentage" ? base * promotion.discountValue / 100 : promotion.discountValue;
    const discount = Math.round(Math.min(base, raw) * 100) / 100;
    if (!best || discount > best.discount) best = { name: promotion.name, discount };
  }
  return best;
}

async function loadPublicShop(slug: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Agendamento temporariamente indisponível." });
  const [shop] = await db.select().from(barbershops).where(eq(barbershops.slug, slug)).limit(1);
  const trialExpired = shop?.status === "trial" && shop.trialEndsAt.getTime() < Date.now();
  if (!shop || shop.deletedAt || trialExpired || (shop.status !== "active" && shop.status !== "trial")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Barbearia não encontrada ou indisponível." });
  }
  return { db, shop };
}

export const bookingRouter = router({
  publicProfile: publicProcedure.input(z.object({ slug: z.string().min(1).max(80) })).query(async ({ input }) => {
    const { db, shop } = await loadPublicShop(input.slug);
    const [shopServices, team, reviewRows, offerRows] = await Promise.all([
      db.select().from(services).where(and(eq(services.barbershopId, shop.id), eq(services.isActive, true))).orderBy(asc(services.category), asc(services.name)),
      db.select({ id: barbers.id, name: barbers.displayName, title: barbers.title })
        .from(barbers).where(and(eq(barbers.barbershopId, shop.id), eq(barbers.isActive, true))).orderBy(asc(barbers.displayName)),
      shop.reviewsEnabled ? db.select({ rating: reviews.rating, comment: reviews.comment, barberId: reviews.barberId, barberName: barbers.displayName, createdAt: reviews.createdAt })
        .from(reviews).leftJoin(barbers, and(eq(reviews.barberId, barbers.id), eq(reviews.barbershopId, barbers.barbershopId)))
        .where(and(eq(reviews.barbershopId, shop.id), eq(reviews.isVisible, true))).orderBy(asc(reviews.createdAt)).limit(1000) : Promise.resolve([]),
      shop.promotionsEnabled ? db.select({ id: promotions.id, name: promotions.name, kind: promotions.kind, discountType: promotions.discountType, discountValue: promotions.discountValue, startsAt: promotions.startsAt, endsAt: promotions.endsAt })
        .from(promotions).where(and(eq(promotions.barbershopId, shop.id), eq(promotions.isActive, true))).orderBy(asc(promotions.name)) : Promise.resolve([]),
    ]);
    const ratingTotal = reviewRows.reduce((sum, review) => sum + review.rating, 0);
    const activePlans = shop.plansVisible ? await db.select({ id: plans.id, name: plans.name, description: plans.description, monthlyPrice: plans.monthlyPrice, usageLimit: plans.usageLimit, validityDays: plans.validityDays })
      .from(plans).where(and(eq(plans.barbershopId, shop.id), eq(plans.isActive, true))).orderBy(asc(plans.monthlyPrice)) : [];
    const activePlanServices = activePlans.length ? await db.select({ planId: planServices.planId, serviceName: services.name })
      .from(planServices).innerJoin(services, and(eq(planServices.serviceId, services.id), eq(planServices.barbershopId, services.barbershopId)))
      .where(and(eq(planServices.barbershopId, shop.id), inArray(planServices.planId, activePlans.map(plan => plan.id)))) : [];
    return {
      shop: { id: shop.id, name: shop.name, slug: shop.slug, logoUrl: shop.logoUrl, bannerImageUrl: shop.bannerImageUrl, primaryColor: shop.primaryColor, timezone: shop.timezone, plansVisible: shop.plansVisible, promotionsEnabled: shop.promotionsEnabled, couponsEnabled: shop.couponsEnabled, reviewsEnabled: shop.reviewsEnabled, galleryEnabled: shop.galleryEnabled },
      services: shopServices.map(service => ({ id: service.id, name: service.name, category: service.category, iconKey: service.iconKey, price: service.price, durationMinutes: service.durationMinutes })),
      barbers: team,
      plans: activePlans.map(plan => ({ ...plan, services: activePlanServices.filter(item => item.planId === plan.id).map(item => item.serviceName) })),
      offers: shop.promotionsEnabled ? offerRows.filter(offer => (!offer.startsAt || offer.startsAt.getTime() <= Date.now()) && (!offer.endsAt || offer.endsAt.getTime() >= Date.now())) : [],
      reviews: shop.reviewsEnabled ? { average: reviewRows.length ? Math.round(ratingTotal / reviewRows.length * 10) / 10 : 0, count: reviewRows.length, items: reviewRows.filter(review => review.comment).slice(-6).reverse() } : null,
    };
  }),

  quote: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), serviceIds: z.array(z.number().int().positive()).min(1).max(12), whatsapp: z.string().min(10).max(24), date: dateSchema.optional(), time: timeSchema.optional(), couponCode: z.string().trim().max(48).optional() })).query(async ({ ctx, input }) => {
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um WhatsApp válido." });
    if (publicRateLimit(`quote:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas de plano. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    const ids = [...new Set(input.serviceIds)];
    const selectedServices = await db.select().from(services).where(and(eq(services.barbershopId, shop.id), eq(services.isActive, true), inArray(services.id, ids)));
    if (selectedServices.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços não estão disponíveis." });
    const subtotal = selectedServices.reduce((sum, service) => sum + service.price, 0);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.barbershopId, shop.id), eq(customers.whatsapp, phone))).limit(1);
    const coverage = customer ? await getPlanCoverage(db, shop.id, customer.id, ids) : null;
    const planDiscount = coverage ? Math.round(selectedServices.filter(service => coverage.coveredServiceIds.includes(service.id)).reduce((sum, service) => sum + service.price, 0) * 100) / 100 : 0;
    const bookingStart = input.date && input.time ? localDateTimeToUtc(input.date, input.time, shop.timezone) : null;
    const promotion = await getApplicablePromotion(db, shop.id, shop.promotionsEnabled, selectedServices.map(service => ({ id: service.id, price: coverage?.coveredServiceIds.includes(service.id) ? 0 : service.price })), bookingStart, input.date, input.time, shop.timezone);
    const promotionDiscount = promotion?.discount ?? 0;
    const coupon = await getValidCoupon(db, shop.id, shop.couponsEnabled, input.couponCode);
    const couponDiscount = coupon ? calculateCouponDiscount(coupon, Math.max(0, subtotal - planDiscount - promotionDiscount)) : 0;
    const discount = Math.min(subtotal, planDiscount + promotionDiscount + couponDiscount);
    return { subtotal, discount, planDiscount, promotionDiscount, promotionName: promotion?.name ?? null, couponDiscount, couponCode: coupon?.code ?? null, total: Math.max(0, subtotal - discount), planName: coverage?.planName ?? null, coveredServiceIds: coverage?.coveredServiceIds ?? [], date: input.date ?? null, time: input.time ?? null };
  }),

  availability: publicProcedure.input(z.object({
    slug: z.string().min(1).max(80),
    serviceIds: z.array(z.number().int().positive()).min(1).max(12),
    barberId: z.number().int().positive().nullable().optional(),
    date: dateSchema,
  })).query(async ({ input }) => {
    const { db, shop } = await loadPublicShop(input.slug);
    if (input.date < localToday(shop.timezone)) return [];
    const ids = [...new Set(input.serviceIds)];
    const selectedServices = await db.select({ id: services.id, duration: services.durationMinutes }).from(services)
      .where(and(eq(services.barbershopId, shop.id), eq(services.isActive, true), inArray(services.id, ids)));
    if (selectedServices.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços não estão disponíveis." });
    const duration = selectedServices.reduce((sum, service) => sum + service.duration, 0);
    let candidates = await db.select({ id: barbers.id, name: barbers.displayName }).from(barbers)
      .where(and(eq(barbers.barbershopId, shop.id), eq(barbers.isActive, true))).orderBy(asc(barbers.displayName));
    if (input.barberId) candidates = candidates.filter(barber => barber.id === input.barberId);
    const eligible: typeof candidates = [];
    for (const barber of candidates) {
      const assignments = await db.select({ serviceId: barberServices.serviceId }).from(barberServices)
        .where(and(eq(barberServices.barbershopId, shop.id), eq(barberServices.barberId, barber.id), inArray(barberServices.serviceId, ids)));
      if (assignments.length === ids.length) eligible.push(barber);
    }
    const slots = new Map<string, string[]>();
    for (const barber of eligible) {
      const times = await getAvailableTimes(db, shop.id, barber.id, input.date, duration, shop.timezone);
      for (const time of times) {
        const names = slots.get(time) ?? [];
        names.push(barber.name);
        slots.set(time, names);
      }
    }
    return [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, availableBarbers]) => ({ time, availableBarbers }));
  }),

  create: publicProcedure.input(z.object({
    slug: z.string().min(1).max(80),
    serviceIds: z.array(z.number().int().positive()).min(1).max(12),
    barberId: z.number().int().positive().nullable().optional(),
    date: dateSchema,
    time: timeSchema,
    name: z.string().trim().min(2).max(160),
    whatsapp: z.string().min(10).max(24),
    couponCode: z.string().trim().max(48).optional(),
  })).mutation(async ({ ctx, input }) => {
    const ip = ctx.req.ip || "unknown";
    if (publicRateLimit(`booking:${ip}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas de agendamento. Tente novamente em alguns minutos." });
    const { db, shop } = await loadPublicShop(input.slug);
    if (input.date < localToday(shop.timezone)) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma data futura." });
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um número de WhatsApp válido." });
    const ids = [...new Set(input.serviceIds)];
    if (ids.length !== input.serviceIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Remova serviços duplicados." });

    return db.transaction(async (tx) => {
      const selectedServices = await tx.select().from(services)
        .where(and(eq(services.barbershopId, shop.id), eq(services.isActive, true), inArray(services.id, ids)));
      if (selectedServices.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços não estão disponíveis." });
      const totalDuration = selectedServices.reduce((sum, service) => sum + service.durationMinutes, 0);
      const subtotal = selectedServices.reduce((sum, service) => sum + service.price, 0);
      let candidates = await tx.select({ id: barbers.id, name: barbers.displayName }).from(barbers)
        .where(and(eq(barbers.barbershopId, shop.id), eq(barbers.isActive, true))).orderBy(asc(barbers.displayName));
      if (input.barberId) candidates = candidates.filter(barber => barber.id === input.barberId);
      let selectedBarber: (typeof candidates)[number] | null = null;
      let startsAt: Date | null = null;
      let endsAt: Date | null = null;
      for (const barber of candidates) {
        await tx.select({ id: barbers.id }).from(barbers)
          .where(and(eq(barbers.id, barber.id), eq(barbers.barbershopId, shop.id))).for("update");
        const assignments = await tx.select({ serviceId: barberServices.serviceId }).from(barberServices)
          .where(and(eq(barberServices.barbershopId, shop.id), eq(barberServices.barberId, barber.id), inArray(barberServices.serviceId, ids)));
        if (assignments.length !== ids.length) continue;
        const times = await getAvailableTimes(tx, shop.id, barber.id, input.date, totalDuration, shop.timezone);
        if (!times.includes(input.time)) continue;
        selectedBarber = barber;
        startsAt = localDateTimeToUtc(input.date, input.time, shop.timezone);
        endsAt = new Date(startsAt.getTime() + totalDuration * 60_000);
        break;
      }
      if (!selectedBarber || !startsAt || !endsAt) throw new TRPCError({ code: "CONFLICT", message: "Esse horário não está mais disponível. Atualize a lista e escolha outro." });

      await tx.insert(customers).values({ barbershopId: shop.id, name: input.name.trim(), whatsapp: phone })
        .onDuplicateKeyUpdate({ set: { name: input.name.trim(), updatedAt: new Date() } });
      const [customer] = await tx.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.barbershopId, shop.id), eq(customers.whatsapp, phone))).for("update").limit(1);
      if (!customer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar o cliente." });
      const coverage = await getPlanCoverage(tx, shop.id, customer.id, ids, true);
      const planDiscount = coverage ? Math.round(selectedServices.filter(service => coverage.coveredServiceIds.includes(service.id)).reduce((sum, service) => sum + service.price, 0) * 100) / 100 : 0;
      const promotion = await getApplicablePromotion(tx, shop.id, shop.promotionsEnabled, selectedServices.map(service => ({ id: service.id, price: coverage?.coveredServiceIds.includes(service.id) ? 0 : service.price })), startsAt, input.date, input.time, shop.timezone);
      const promotionDiscount = promotion?.discount ?? 0;
      const coupon = await getValidCoupon(tx, shop.id, shop.couponsEnabled, input.couponCode, true);
      const couponDiscount = coupon ? calculateCouponDiscount(coupon, Math.max(0, subtotal - planDiscount - promotionDiscount)) : 0;
      const discount = Math.min(subtotal, planDiscount + promotionDiscount + couponDiscount);
      const total = Math.max(0, subtotal - discount);
      if (coverage) await tx.update(customerSubscriptions).set({ usageCount: sql`${customerSubscriptions.usageCount} + 1` }).where(and(eq(customerSubscriptions.id, coverage.subscriptionId), eq(customerSubscriptions.barbershopId, shop.id)));
      const bookingRef = randomBytes(6).toString("hex").toUpperCase();
      await tx.insert(appointments).values({
        barbershopId: shop.id, customerId: customer.id, barberId: selectedBarber.id, bookingRef,
        status: "scheduled", source: "public", startsAt, endsAt, totalDurationMinutes: totalDuration,
        subtotal, discount, total,
      });
      const [appointment] = await tx.select({ id: appointments.id }).from(appointments)
        .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, bookingRef))).limit(1);
      if (!appointment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível confirmar o agendamento." });
      await tx.insert(appointmentItems).values(selectedServices.map(service => ({
        barbershopId: shop.id, appointmentId: appointment.id, serviceId: service.id,
        serviceName: service.name, unitPrice: service.price, durationMinutes: service.durationMinutes,
        coveredByPlan: Boolean(coverage?.coveredServiceIds.includes(service.id)),
      })));
      if (coverage && coverage.coveredServiceIds.length) {
        await tx.insert(planUsage).values(coverage.coveredServiceIds.map(serviceId => ({ barbershopId: shop.id, subscriptionId: coverage.subscriptionId, appointmentId: appointment.id, serviceId })));
      }
      if (coupon) {
        await tx.update(coupons).set({ usageCount: sql`${coupons.usageCount} + 1` }).where(and(eq(coupons.id, coupon.id), eq(coupons.barbershopId, shop.id)));
        await tx.insert(couponUses).values({ barbershopId: shop.id, couponId: coupon.id, customerId: customer.id, appointmentId: appointment.id });
      }
      return {
        bookingRef,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        total,
        subtotal,
        discount,
        planDiscount,
        promotionDiscount,
        promotionName: promotion?.name ?? null,
        couponDiscount,
        couponCode: coupon?.code ?? null,
        planName: coverage?.planName ?? null,
        totalDurationMinutes: totalDuration,
        barberName: selectedBarber.name,
        shopName: shop.name,
      };
    });
  }),

  manageByPhone: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), whatsapp: z.string().min(10).max(24), bookingRef: z.string().trim().min(6).max(16) })).query(async ({ ctx, input }) => {
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um WhatsApp válido." });
    if (publicRateLimit(`manage:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas. Aguarde um minuto e tente novamente." });
    const { db, shop } = await loadPublicShop(input.slug);
    const rows = await db.select({ appointment: appointments, barberName: barbers.displayName })
      .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
      .leftJoin(barbers, and(eq(appointments.barberId, barbers.id), eq(appointments.barbershopId, barbers.barbershopId)))
      .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.toUpperCase()), eq(customers.whatsapp, phone), inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.startsAt, new Date())))
      .orderBy(asc(appointments.startsAt)).limit(10);
    return Promise.all(rows.map(async row => {
      const items = await db.select({ serviceName: appointmentItems.serviceName }).from(appointmentItems)
        .where(and(eq(appointmentItems.barbershopId, shop.id), eq(appointmentItems.appointmentId, row.appointment.id)));
      return { bookingRef: row.appointment.bookingRef, startsAt: row.appointment.startsAt, endsAt: row.appointment.endsAt,
        barberName: row.barberName ?? "Profissional a confirmar", total: row.appointment.total,
        status: row.appointment.status, services: items.map(item => item.serviceName), cancellationNoticeHours: shop.cancellationNoticeHours };
    }));
  }),

  rescheduleAvailability: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), bookingRef: z.string().min(6).max(16), whatsapp: z.string().min(10).max(24), date: dateSchema })).query(async ({ ctx, input }) => {
    const phone = digits(input.whatsapp);
    if (publicRateLimit(`reschedule:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    const [row] = await db.select({ appointment: appointments, customerWhatsApp: customers.whatsapp })
      .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
      .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.trim().toUpperCase()), eq(customers.whatsapp, phone))).limit(1);
    if (!row || !["scheduled", "confirmed"].includes(row.appointment.status) || row.appointment.startsAt.getTime() - Date.now() < shop.cancellationNoticeHours * 60 * 60 * 1000) return [];
    if (input.date < localToday(shop.timezone) || !row.appointment.barberId) return [];
    const items = await db.select().from(appointmentItems).where(and(eq(appointmentItems.barbershopId, shop.id), eq(appointmentItems.appointmentId, row.appointment.id)));
    if (!items.length) return [];
    const duration = items.reduce((total, item) => total + item.durationMinutes, 0);
    return getAvailableTimes(db, shop.id, row.appointment.barberId, input.date, duration, shop.timezone, row.appointment.id);
  }),

  cancel: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), bookingRef: z.string().min(6).max(16), whatsapp: z.string().min(10).max(24) })).mutation(async ({ ctx, input }) => {
    const phone = digits(input.whatsapp);
    if (publicRateLimit(`cancel:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    return db.transaction(async tx => {
      const [row] = await tx.select({ appointment: appointments, customerWhatsApp: customers.whatsapp })
        .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
        .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.trim().toUpperCase()), eq(customers.whatsapp, phone))).for("update").limit(1);
      if (!row || !["scheduled", "confirmed"].includes(row.appointment.status)) throw new TRPCError({ code: "NOT_FOUND", message: "Não foi possível localizar um agendamento cancelável com esses dados." });
      if (row.appointment.startsAt.getTime() - Date.now() < shop.cancellationNoticeHours * 60 * 60 * 1000) throw new TRPCError({ code: "FORBIDDEN", message: `O cancelamento precisa ser feito com pelo menos ${shop.cancellationNoticeHours} hora(s) de antecedência. Fale com a barbearia pelo WhatsApp.` });
      await tx.update(appointments).set({ status: "cancelled" }).where(and(eq(appointments.id, row.appointment.id), eq(appointments.barbershopId, shop.id)));
      await releaseAppointmentBenefits(tx, shop.id, row.appointment.id);
      return { success: true as const };
    });
  }),

  reschedule: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), bookingRef: z.string().min(6).max(16), whatsapp: z.string().min(10).max(24), date: dateSchema, time: timeSchema })).mutation(async ({ ctx, input }) => {
    const phone = digits(input.whatsapp);
    if (publicRateLimit(`reschedule-mutation:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    if (input.date < localToday(shop.timezone)) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma data futura." });
    return db.transaction(async tx => {
      const [row] = await tx.select({ appointment: appointments, customerWhatsApp: customers.whatsapp })
        .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
        .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.trim().toUpperCase()), eq(customers.whatsapp, phone))).for("update").limit(1);
      if (!row || !["scheduled", "confirmed"].includes(row.appointment.status) || !row.appointment.barberId) throw new TRPCError({ code: "NOT_FOUND", message: "Não foi possível localizar um agendamento reagendável com esses dados." });
      if (row.appointment.startsAt.getTime() - Date.now() < shop.cancellationNoticeHours * 60 * 60 * 1000) throw new TRPCError({ code: "FORBIDDEN", message: `O reagendamento precisa ser feito com pelo menos ${shop.cancellationNoticeHours} hora(s) de antecedência.` });
      const items = await tx.select().from(appointmentItems).where(and(eq(appointmentItems.barbershopId, shop.id), eq(appointmentItems.appointmentId, row.appointment.id)));
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Este agendamento não tem serviços que possam ser reagendados." });
      const duration = items.reduce((total, item) => total + item.durationMinutes, 0);
      await tx.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.id, row.appointment.barberId), eq(barbers.barbershopId, shop.id))).for("update");
      const times = await getAvailableTimes(tx, shop.id, row.appointment.barberId, input.date, duration, shop.timezone, row.appointment.id);
      if (!times.includes(input.time)) throw new TRPCError({ code: "CONFLICT", message: "Esse horário não está mais disponível. Atualize a lista e escolha outro." });
      const startsAt = localDateTimeToUtc(input.date, input.time, shop.timezone);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      await tx.update(appointments).set({ startsAt, endsAt }).where(and(eq(appointments.id, row.appointment.id), eq(appointments.barbershopId, shop.id)));
      return { success: true as const, startsAt, endsAt, barberName: "Profissional confirmado", bookingRef: row.appointment.bookingRef };
    });
  }),

  reviewable: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), whatsapp: z.string().min(10).max(24), bookingRef: z.string().trim().min(6).max(16) })).query(async ({ input, ctx }) => {
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um WhatsApp válido." });
    if (publicRateLimit(`reviewable:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    if (!shop.reviewsEnabled) return [];
    const rows = await db.select({ appointment: appointments, barberName: barbers.displayName })
      .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
      .leftJoin(barbers, and(eq(appointments.barberId, barbers.id), eq(appointments.barbershopId, barbers.barbershopId)))
      .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.toUpperCase()), eq(customers.whatsapp, phone), eq(appointments.status, "completed")))
      .orderBy(asc(appointments.startsAt)).limit(20);
    return Promise.all(rows.map(async row => {
      const [existing] = await db.select({ rating: reviews.rating, comment: reviews.comment }).from(reviews).where(and(eq(reviews.barbershopId, shop.id), eq(reviews.appointmentId, row.appointment.id))).limit(1);
      const items = await db.select({ serviceName: appointmentItems.serviceName }).from(appointmentItems).where(and(eq(appointmentItems.barbershopId, shop.id), eq(appointmentItems.appointmentId, row.appointment.id)));
      return { bookingRef: row.appointment.bookingRef, startsAt: row.appointment.startsAt, barberName: row.barberName ?? "Profissional", reviewed: Boolean(existing), rating: existing?.rating ?? null, comment: existing?.comment ?? null, services: items.map(item => item.serviceName) };
    }));
  }),

  submitReview: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), bookingRef: z.string().min(6).max(16), whatsapp: z.string().min(10).max(24), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um WhatsApp válido." });
    if (publicRateLimit(`review:${ctx.req.ip || "unknown"}:${phone}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas avaliações. Aguarde um minuto." });
    const { db, shop } = await loadPublicShop(input.slug);
    if (!shop.reviewsEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "As avaliações não estão habilitadas." });
    return db.transaction(async tx => {
      const [row] = await tx.select({ appointment: appointments, customer: customers })
        .from(appointments).innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.barbershopId, customers.barbershopId)))
        .where(and(eq(appointments.barbershopId, shop.id), eq(appointments.bookingRef, input.bookingRef.trim().toUpperCase()), eq(customers.whatsapp, phone), eq(appointments.status, "completed")))
        .for("update").limit(1);
      if (!row || !row.appointment.barberId) throw new TRPCError({ code: "NOT_FOUND", message: "Não encontramos um atendimento concluído para avaliar." });
      const [existing] = await tx.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.barbershopId, shop.id), eq(reviews.appointmentId, row.appointment.id))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este atendimento já foi avaliado." });
      const [item] = await tx.select({ serviceId: appointmentItems.serviceId }).from(appointmentItems).where(and(eq(appointmentItems.barbershopId, shop.id), eq(appointmentItems.appointmentId, row.appointment.id))).limit(1);
      await tx.insert(reviews).values({ barbershopId: shop.id, appointmentId: row.appointment.id, customerId: row.customer.id, barberId: row.appointment.barberId, serviceId: item?.serviceId ?? null, rating: input.rating, comment: input.comment?.trim() || null, isVisible: true });
      return { success: true as const };
    });
  }),

  joinWaitlist: publicProcedure.input(z.object({
    slug: z.string().min(1).max(80), serviceIds: z.array(z.number().int().positive()).min(1).max(12),
    barberId: z.number().int().positive().nullable().optional(), date: dateSchema.optional(),
    name: z.string().trim().min(2).max(160), whatsapp: z.string().min(10).max(24),
  })).mutation(async ({ ctx, input }) => {
    if (publicRateLimit(`waitlist:${ctx.req.ip || "unknown"}`)) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
    const { db, shop } = await loadPublicShop(input.slug);
    const ids = [...new Set(input.serviceIds)];
    const valid = await db.select({ id: services.id }).from(services)
      .where(and(eq(services.barbershopId, shop.id), eq(services.isActive, true), inArray(services.id, ids)));
    if (valid.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Serviços inválidos." });
    if (input.barberId) {
      const [selectedBarber] = await db.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, shop.id), eq(barbers.isActive, true))).limit(1);
      if (!selectedBarber) throw new TRPCError({ code: "BAD_REQUEST", message: "Barbeiro indisponível para esta barbearia." });
    }
    const phone = digits(input.whatsapp);
    if (phone.length < 10 || phone.length > 15) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um WhatsApp válido." });
    await db.insert(waitlistEntries).values({
      barbershopId: shop.id, customerName: input.name.trim(), whatsapp: phone,
      barberId: input.barberId ?? null, serviceIds: ids,
      desiredDate: input.date ? new Date(`${input.date}T12:00:00`) : null,
    });
    return { success: true } as const;
  }),
});

export { formatTime, localDateTimeToUtc };
