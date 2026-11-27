import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Barbershop, User } from "../../drizzle/schema";
import type { StaffAccount } from "../../drizzle/barbershop";
import { sdk } from "./sdk";
import { authenticateStaffRequest } from "./staffAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  staff: StaffAccount | null;
  barbershop: Barbershop | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // OAuth remains optional; internal staff login uses its own opaque session.
    user = null;
  }

  let staff: StaffAccount | null = null;
  let barbershop: Barbershop | null = null;
  try {
    const session = await authenticateStaffRequest(opts.req);
    staff = session.staff;
    barbershop = session.barbershop;
  } catch (error) {
    // Public booking routes remain available if an internal session lookup fails.
    console.error("[Staff session] Could not resolve application session", error);
  }

  return { req: opts.req, res: opts.res, user, staff, barbershop };
}
