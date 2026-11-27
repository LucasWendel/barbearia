import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { barberAuthRouter } from "./barberAuthRouter";
import { bookingRouter } from "./bookingRouter";
import { managementRouter } from "./managementRouter";
import { businessRouter } from "./businessRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  staff: barberAuthRouter,
  booking: bookingRouter,
  management: managementRouter,
  business: businessRouter,
});

export type AppRouter = typeof appRouter;
