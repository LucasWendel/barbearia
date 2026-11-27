import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import {
  appointments, appointmentItems, appointmentProducts, barberServices, barberWorkingHours, barbers,
  barbershops, commissionEntries, commissionRules, customers, customerSubscriptions,
  financialTransactions, planServices, plans, platformPayments, products,
  reviews, services, staffAccounts, stockMovements,
} from "../drizzle/schema";
import { hashPassword } from "../server/_core/staffAuth";

const timezone = "America/Sao_Paulo";
const email = {
  admin: process.env.DEMO_SUPERADMIN_EMAIL ?? "superadmin@barberpro.example.com",
  owner: process.env.DEMO_OWNER_EMAIL ?? "dono@primejardins.example.com",
  barber: process.env.DEMO_BARBER_EMAIL ?? "barbeiro@primejardins.example.com",
};
const passwords = {
  admin: randomBytes(24).toString("base64url"),
  owner: randomBytes(24).toString("base64url"),
  barber: randomBytes(24).toString("base64url"),
};

function localYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function businessDate(offset: number) {
  const today = localYmd(new Date());
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
  const direction = offset < 0 ? -1 : 1;
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + direction);
  return day.toISOString().slice(0, 10);
}

function saoPauloDate(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`);
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não está disponível.");
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const db = drizzle(pool, { schema, mode: "default" });
  try {
    const [existingShop] = await db.select({ id: barbershops.id }).from(barbershops)
      .where(eq(barbershops.slug, "barbearia-prime-jardins")).limit(1);
    const [existingAdmin] = await db.select({ id: staffAccounts.id }).from(staffAccounts)
      .where(eq(staffAccounts.email, email.admin)).limit(1);
    if (existingShop || existingAdmin) {
      console.log("Seed ignorado: os dados-base da demonstração já existem; nada foi sobrescrito.");
      return;
    }

    await db.transaction(async tx => {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const [prime] = await tx.insert(barbershops).values({
        name: "Barbearia Prime Jardins", slug: "barbearia-prime-jardins", status: "active", trialEndsAt,
        monthlyFee: 149.9, dueDay: 10, lastPaymentAt: now, primaryColor: "#B28A4A",
        plansVisible: true, promotionsEnabled: true, couponsEnabled: true, loyaltyEnabled: true,
        reviewsEnabled: true, galleryEnabled: false,
      }).$returningId();
      const [navalha] = await tx.insert(barbershops).values({
        name: "Navalha Centro", slug: "navalha-centro", status: "trial", trialEndsAt,
        monthlyFee: 149.9, dueDay: 15, primaryColor: "#71816D",
        plansVisible: false, promotionsEnabled: false, couponsEnabled: false, loyaltyEnabled: false,
        reviewsEnabled: false, galleryEnabled: false,
      }).$returningId();

      await tx.insert(staffAccounts).values({
        name: "Super Administrador de Demonstração", email: email.admin, passwordHash: await hashPassword(passwords.admin),
        role: "super_admin", isActive: true, mustChangePassword: true,
      });
      const [owner] = await tx.insert(staffAccounts).values({
        barbershopId: prime.id, name: "João Pereira", email: email.owner, passwordHash: await hashPassword(passwords.owner),
        role: "owner", isActive: true, mustChangePassword: true,
      }).$returningId();
      await tx.insert(platformPayments).values({
        barbershopId: prime.id, amount: 149.9, paidAt: now, periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)), notes: "Pagamento de demonstração",
        recordedByStaffId: owner.id,
      });

      const primeServicesData = [
        { name: "Corte clássico", category: "Cabelo", iconKey: "scissors", price: 55, durationMinutes: 40 },
        { name: "Corte degradê", category: "Cabelo", iconKey: "scissors", price: 60, durationMinutes: 45 },
        { name: "Barba completa", category: "Barba", iconKey: "beard", price: 45, durationMinutes: 30 },
        { name: "Sobrancelha", category: "Acabamento", iconKey: "eyebrow", price: 20, durationMinutes: 15 },
        { name: "Pigmentação", category: "Tratamento", iconKey: "sparkle", price: 35, durationMinutes: 25 },
        { name: "Hidratação", category: "Tratamento", iconKey: "sparkle", price: 40, durationMinutes: 30 },
        { name: "Relaxamento", category: "Tratamento", iconKey: "sparkle", price: 50, durationMinutes: 35 },
      ];
      const primeServiceIds = await tx.insert(services).values(primeServicesData.map(service => ({ ...service, barbershopId: prime.id }))).$returningId();
      const navalhaServiceData = [
        { name: "Corte social", category: "Cabelo", iconKey: "scissors", price: 50, durationMinutes: 40 },
        { name: "Barba express", category: "Barba", iconKey: "beard", price: 35, durationMinutes: 25 },
        { name: "Combo corte + barba", category: "Combos", iconKey: "scissors", price: 75, durationMinutes: 65 },
      ];
      const navalhaServiceIds = await tx.insert(services).values(navalhaServiceData.map(service => ({ ...service, barbershopId: navalha.id }))).$returningId();

      const [primeBarber] = await tx.insert(barbers).values({ barbershopId: prime.id, displayName: "Matheus Oliveira", title: "Especialista em degradê" }).$returningId();
      const [secondPrimeBarber] = await tx.insert(barbers).values({ barbershopId: prime.id, displayName: "Lucas Ferreira", title: "Barbeiro sênior" }).$returningId();
      const [navalhaBarber] = await tx.insert(barbers).values({ barbershopId: navalha.id, displayName: "Caio Martins", title: "Barbeiro" }).$returningId();
      const [barberAccount] = await tx.insert(staffAccounts).values({
        barbershopId: prime.id, name: "Matheus Oliveira", email: email.barber, passwordHash: await hashPassword(passwords.barber),
        role: "barber", barberId: primeBarber.id, isActive: true, mustChangePassword: true,
      }).$returningId();
      await tx.update(barbers).set({ staffAccountId: barberAccount.id }).where(and(eq(barbers.id, primeBarber.id), eq(barbers.barbershopId, prime.id)));

      for (const [shopId, barberId, serviceIds] of [
        [prime.id, primeBarber.id, primeServiceIds.map(service => service.id)],
        [prime.id, secondPrimeBarber.id, primeServiceIds.map(service => service.id)],
        [navalha.id, navalhaBarber.id, navalhaServiceIds.map(service => service.id)],
      ] as const) {
        await tx.insert(barberServices).values(serviceIds.map(serviceId => ({ barbershopId: shopId, barberId, serviceId })));
        const hours = Array.from({ length: 7 }, (_, day) => ({
          barbershopId: shopId, barberId, weekday: day, startTime: "09:00:00", endTime: "18:00:00",
          breakStart: day === 0 ? null : "13:00:00", breakEnd: day === 0 ? null : "14:00:00", isDayOff: day === 0,
        }));
        await tx.insert(barberWorkingHours).values(hours);
      }

      const primeCustomersData = [
        { name: "Rafael Mendes", whatsapp: "00000000001", birthday: new Date("1991-04-14"), notes: "Prefere acabamento baixo." },
        { name: "André Costa", whatsapp: "00000000002", birthday: new Date("1988-09-02"), notes: "Corte na tesoura." },
        { name: "Thiago Oliveira", whatsapp: "00000000003", birthday: null, notes: null },
        { name: "Bruno Almeida", whatsapp: "00000000004", birthday: new Date("1995-11-20"), notes: null },
        { name: "Felipe Rocha", whatsapp: "00000000005", birthday: null, notes: "Cliente recorrente." },
      ];
      const primeCustomerIds = await tx.insert(customers).values(primeCustomersData.map(customer => ({ ...customer, barbershopId: prime.id }))).$returningId();
      const navalhaCustomersData = [
        { name: "Pedro Santos", whatsapp: "00000000011", birthday: new Date("1990-02-11"), notes: null },
        { name: "Gabriel Souza", whatsapp: "00000000012", birthday: null, notes: "Prefere horário da manhã." },
        { name: "Vinícius Lima", whatsapp: "00000000013", birthday: new Date("1998-07-05"), notes: null },
      ];
      const navalhaCustomerIds = await tx.insert(customers).values(navalhaCustomersData.map(customer => ({ ...customer, barbershopId: navalha.id }))).$returningId();

      const [primePlan] = await tx.insert(plans).values({
        barbershopId: prime.id, name: "Clube Corte Essencial", description: "Dois cortes por ciclo mensal.",
        monthlyPrice: 99, usageLimit: 2, validityDays: 30, isActive: true,
      }).$returningId();
      const [navalhaPlan] = await tx.insert(plans).values({
        barbershopId: navalha.id, name: "Plano Navalha", description: "Plano demonstrativo da unidade Centro.",
        monthlyPrice: 89, usageLimit: 2, validityDays: 30, isActive: true,
      }).$returningId();
      await tx.insert(planServices).values({ barbershopId: prime.id, planId: primePlan.id, serviceId: primeServiceIds[0]!.id });
      await tx.insert(planServices).values({ barbershopId: navalha.id, planId: navalhaPlan.id, serviceId: navalhaServiceIds[0]!.id });
      const subscriptionStarts = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const subscriptionEnds = new Date(Date.now() + 27 * 24 * 60 * 60 * 1000);
      const [subscription] = await tx.insert(customerSubscriptions).values({
        barbershopId: prime.id, customerId: primeCustomerIds[0]!.id, planId: primePlan.id,
        status: "active", cycleStartsAt: subscriptionStarts, cycleEndsAt: subscriptionEnds, usageCount: 0, lastPaymentAt: now,
      }).$returningId();
      const [navalhaSubscription] = await tx.insert(customerSubscriptions).values({
        barbershopId: navalha.id, customerId: navalhaCustomerIds[0]!.id, planId: navalhaPlan.id,
        status: "active", cycleStartsAt: subscriptionStarts, cycleEndsAt: subscriptionEnds, usageCount: 0, lastPaymentAt: now,
      }).$returningId();
      void navalhaSubscription;

      const tomorrow = businessDate(1);
      const dayAfter = businessDate(2);
      const yesterday = businessDate(-1);
      const completedAt = saoPauloDate(yesterday, "14:00");
      const completedEnd = new Date(completedAt.getTime() + 40 * 60_000);
      const [completed] = await tx.insert(appointments).values({
        barbershopId: prime.id, customerId: primeCustomerIds[0]!.id, barberId: primeBarber.id,
        bookingRef: "DEMO-PRIME-01", status: "completed", source: "panel",
        startsAt: completedAt, endsAt: completedEnd, totalDurationMinutes: 40, subtotal: 83, discount: 0, total: 83,
      }).$returningId();
      await tx.insert(appointmentItems).values({ barbershopId: prime.id, appointmentId: completed.id, serviceId: primeServiceIds[0]!.id, serviceName: "Corte clássico", unitPrice: 55, durationMinutes: 40 });
      await tx.insert(financialTransactions).values({
        barbershopId: prime.id, kind: "income", source: "service", category: "Atendimento e produto",
        description: "Atendimento e produto de demonstração", amount: 83, machineFee: 0, paymentMethod: "pix",
        appointmentId: completed.id, paidAt: completedAt, createdByStaffId: owner.id,
      });
      await tx.insert(commissionEntries).values({ barbershopId: prime.id, barberId: primeBarber.id, appointmentId: completed.id, description: "Corte clássico · demonstração", amount: 27.5, kind: "service", createdAt: completedAt });
      await tx.insert(reviews).values({ barbershopId: prime.id, appointmentId: completed.id, customerId: primeCustomerIds[0]!.id, barberId: primeBarber.id, serviceId: primeServiceIds[0]!.id, rating: 5, comment: "Atendimento excelente!", isVisible: true, createdAt: completedEnd });

      const upcoming = [
        { date: tomorrow, time: "10:00", customer: primeCustomerIds[2]!.id, barber: primeBarber.id, status: "confirmed" as const, service: primeServiceIds[1]!.id, price: 60, duration: 45, name: "Corte degradê" },
        { date: tomorrow, time: "11:15", customer: primeCustomerIds[3]!.id, barber: secondPrimeBarber.id, status: "scheduled" as const, service: primeServiceIds[2]!.id, price: 45, duration: 30, name: "Barba completa" },
        { date: dayAfter, time: "13:30", customer: navalhaCustomerIds[1]!.id, barber: navalhaBarber.id, status: "confirmed" as const, service: navalhaServiceIds[0]!.id, price: 50, duration: 40, name: "Corte social", tenant: navalha.id },
      ];
      for (const item of upcoming) {
        const tenantId = item.tenant ?? prime.id;
        const start = saoPauloDate(item.date, item.time);
        const [appointment] = await tx.insert(appointments).values({
          barbershopId: tenantId, customerId: item.customer, barberId: item.barber,
          bookingRef: `DEMO-${tenantId}-${randomBytes(3).toString("hex").toUpperCase()}`,
          status: item.status, source: "panel", startsAt: start,
          endsAt: new Date(start.getTime() + item.duration * 60_000), totalDurationMinutes: item.duration,
          subtotal: item.price, discount: 0, total: item.price,
        }).$returningId();
        const itemServiceId = item.service;
        await tx.insert(appointmentItems).values({
          barbershopId: tenantId, appointmentId: appointment.id, serviceId: itemServiceId,
          serviceName: item.name, unitPrice: item.price, durationMinutes: item.duration,
        });
      }

      const [pomade] = await tx.insert(products).values({
        barbershopId: prime.id, name: "Pomada efeito matte", sku: "DEMO-POM-01", costPrice: 12, salePrice: 28,
        quantity: 24, minimumQuantity: 5, useInternally: false, isActive: true,
      }).$returningId();
      const [shampoo] = await tx.insert(products).values({
        barbershopId: prime.id, name: "Shampoo profissional", sku: "DEMO-SHA-01", costPrice: 18, salePrice: 35,
        quantity: 8, minimumQuantity: 5, useInternally: true, isActive: true,
      }).$returningId();
      await tx.insert(stockMovements).values([
        { barbershopId: prime.id, productId: pomade.id, kind: "in", quantity: 25, note: "Estoque demonstrativo", createdByStaffId: owner.id },
        { barbershopId: prime.id, productId: shampoo.id, kind: "in", quantity: 8, note: "Estoque demonstrativo", createdByStaffId: owner.id },
        { barbershopId: prime.id, productId: pomade.id, kind: "sale", quantity: 1, note: "Venda em atendimento demonstrativo", appointmentId: completed.id, createdByStaffId: owner.id },
      ]);
      await tx.insert(commissionRules).values([
        { barbershopId: prime.id, barberId: primeBarber.id, scope: "service", calculation: "percentage", value: 50, planPercentage: 30 },
        { barbershopId: prime.id, barberId: primeBarber.id, scope: "product", calculation: "percentage", value: 10, planPercentage: 10 },
        { barbershopId: prime.id, barberId: secondPrimeBarber.id, scope: "all", calculation: "percentage", value: 45, planPercentage: 25 },
        { barbershopId: navalha.id, barberId: navalhaBarber.id, scope: "all", calculation: "percentage", value: 50, planPercentage: 30 },
      ]);
      await tx.insert(appointmentProducts).values({ barbershopId: prime.id, appointmentId: completed.id, productId: pomade.id, quantity: 1, unitPrice: 28 });
      await tx.insert(commissionEntries).values({ barbershopId: prime.id, barberId: primeBarber.id, appointmentId: completed.id, description: "Pomada matte · demonstração", amount: 2.8, kind: "product", createdAt: completedAt });
    });

    console.log("Seed de demonstração concluído. Contas de teste (troca de senha obrigatória no primeiro acesso):");
    console.log(`Super Administrador: ${email.admin} | senha: ${passwords.admin}`);
    console.log(`Dono da Barbearia Prime Jardins: ${email.owner} | senha: ${passwords.owner}`);
    console.log(`Barbeiro (Matheus Oliveira): ${email.barber} | senha: ${passwords.barber}`);
    console.log("Links de demonstração: /barbearia-prime-jardins e /navalha-centro");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Seed de demonstração não concluído:", error);
  process.exitCode = 1;
});
