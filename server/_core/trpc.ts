import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
}));

export const staffProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  const staff = ctx.staff;
  if (!staff) throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre com sua conta da barbearia." });
  if (!staff.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Esta conta está desativada." });
  return next({ ctx: { ...ctx, staff } });
}));

export const tenantProcedure = staffProcedure.use(t.middleware(async ({ ctx, next }) => {
  const staff = ctx.staff!;
  const barbershop = ctx.barbershop;
  if (staff.mustChangePassword) throw new TRPCError({ code: "FORBIDDEN", message: "Troque sua senha antes de acessar os recursos da barbearia." });
  if (staff.role === "super_admin" || !staff.barbershopId || !barbershop) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a uma barbearia." });
  }
  if (barbershop.status === "blocked" || barbershop.deletedAt) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O acesso desta barbearia está bloqueado." });
  }
  return next({ ctx: { ...ctx, staff, barbershop } });
}));

export const ownerProcedure = tenantProcedure.use(t.middleware(async ({ ctx, next }) => {
  const staff = ctx.staff!;
  if (staff.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Somente o dono da barbearia pode realizar esta ação." });
  return next({ ctx: { ...ctx, staff, barbershop: ctx.barbershop! } });
}));

export const operationsProcedure = tenantProcedure.use(t.middleware(async ({ ctx, next }) => {
  const staff = ctx.staff!;
  if (staff.role !== "owner" && staff.role !== "receptionist") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Permissão insuficiente para esta operação." });
  }
  return next({ ctx: { ...ctx, staff, barbershop: ctx.barbershop! } });
}));

export const superAdminProcedure = staffProcedure.use(t.middleware(async ({ ctx, next }) => {
  const staff = ctx.staff!;
  if (staff.mustChangePassword) throw new TRPCError({ code: "FORBIDDEN", message: "Troque sua senha antes de acessar a administração." });
  if (staff.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente o Super Administrador pode realizar esta ação." });
  return next({ ctx: { ...ctx, staff } });
}));
