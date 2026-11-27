import { and, eq, sql } from "drizzle-orm";
import { couponUses, coupons, customerSubscriptions, planUsage } from "../../drizzle/schema";

/** Reverte somente benefícios efetivamente reservados para este atendimento. Deve ser chamado dentro da transação que altera o status. */
export async function releaseAppointmentBenefits(tx: any, barbershopId: number, appointmentId: number) {
  const planRows = await tx.select({ subscriptionId: planUsage.subscriptionId })
    .from(planUsage)
    .where(and(eq(planUsage.barbershopId, barbershopId), eq(planUsage.appointmentId, appointmentId)))
    .for("update");
  const subscriptionIds = [...new Set<number>(planRows.map((row: { subscriptionId: number }) => row.subscriptionId))];
  for (const subscriptionId of subscriptionIds) {
    await tx.update(customerSubscriptions)
      .set({ usageCount: sql`GREATEST(${customerSubscriptions.usageCount} - 1, 0)` })
      .where(and(eq(customerSubscriptions.id, subscriptionId), eq(customerSubscriptions.barbershopId, barbershopId)));
  }
  if (planRows.length) {
    await tx.delete(planUsage).where(and(eq(planUsage.barbershopId, barbershopId), eq(planUsage.appointmentId, appointmentId)));
  }

  const couponRows = await tx.select({ couponId: couponUses.couponId })
    .from(couponUses)
    .where(and(eq(couponUses.barbershopId, barbershopId), eq(couponUses.appointmentId, appointmentId)))
    .for("update");
  const couponIds = [...new Set<number>(couponRows.map((row: { couponId: number }) => row.couponId))];
  for (const couponId of couponIds) {
    await tx.update(coupons)
      .set({ usageCount: sql`GREATEST(${coupons.usageCount} - 1, 0)` })
      .where(and(eq(coupons.id, couponId), eq(coupons.barbershopId, barbershopId)));
  }
  if (couponRows.length) {
    await tx.delete(couponUses).where(and(eq(couponUses.barbershopId, barbershopId), eq(couponUses.appointmentId, appointmentId)));
  }
}

/** Mantém apenas serviços cobertos que sobreviveram ao ajuste feito na conclusão. */
export async function reconcileAppointmentPlanUsage(tx: any, barbershopId: number, appointmentId: number, coveredServiceIds: number[]) {
  const rows = await tx.select({ id: planUsage.id, subscriptionId: planUsage.subscriptionId, serviceId: planUsage.serviceId })
    .from(planUsage)
    .where(and(eq(planUsage.barbershopId, barbershopId), eq(planUsage.appointmentId, appointmentId)))
    .for("update");
  if (!rows.length) return;
  const remainingIds = new Set(coveredServiceIds);
  const removedRows = rows.filter((row: { serviceId: number }) => !remainingIds.has(row.serviceId));
  const retainedRows = rows.filter((row: { serviceId: number }) => remainingIds.has(row.serviceId));
  if (!retainedRows.length) {
    const subscriptionIds = [...new Set<number>(rows.map((row: { subscriptionId: number }) => row.subscriptionId))];
    for (const subscriptionId of subscriptionIds) {
      await tx.update(customerSubscriptions)
        .set({ usageCount: sql`GREATEST(${customerSubscriptions.usageCount} - 1, 0)` })
        .where(and(eq(customerSubscriptions.id, subscriptionId), eq(customerSubscriptions.barbershopId, barbershopId)));
    }
  }
  for (const row of removedRows) {
    await tx.delete(planUsage).where(and(eq(planUsage.id, row.id), eq(planUsage.barbershopId, barbershopId)));
  }
}
