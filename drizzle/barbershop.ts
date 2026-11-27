import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const money = (name: string) => decimal(name, { precision: 12, scale: 2, mode: "number" });
const createdAt = () => timestamp("createdAt").defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt").defaultNow().onUpdateNow().notNull();

export const barbershops = mysqlTable("barbershops", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull(),
  logoUrl: text("logoUrl"),
  bannerImageUrl: text("bannerImageUrl"),
  primaryColor: varchar("primaryColor", { length: 24 }).notNull().default("#B28A4A"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
  status: mysqlEnum("status", ["trial", "active", "delinquent", "blocked"]).notNull().default("trial"),
  trialEndsAt: timestamp("trialEndsAt").notNull(),
  monthlyFee: money("monthlyFee").notNull().default(0),
  dueDay: int("dueDay").notNull().default(10),
  lastPaymentAt: timestamp("lastPaymentAt"),
  deletedAt: timestamp("deletedAt"),
  plansVisible: boolean("plansVisible").notNull().default(false),
  promotionsEnabled: boolean("promotionsEnabled").notNull().default(false),
  couponsEnabled: boolean("couponsEnabled").notNull().default(false),
  loyaltyEnabled: boolean("loyaltyEnabled").notNull().default(false),
  reviewsEnabled: boolean("reviewsEnabled").notNull().default(false),
  galleryEnabled: boolean("galleryEnabled").notNull().default(false),
  cancellationNoticeHours: int("cancellationNoticeHours").notNull().default(4),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  slugUnique: uniqueIndex("barbershops_slug_uq").on(table.slug),
  statusIndex: index("barbershops_status_idx").on(table.status),
}));

export const staffAccounts = mysqlTable("staffAccounts", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId"),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["super_admin", "owner", "barber", "receptionist"]).notNull(),
  barberId: int("barberId"),
  isActive: boolean("isActive").notNull().default(true),
  mustChangePassword: boolean("mustChangePassword").notNull().default(false),
  lastSignedInAt: timestamp("lastSignedInAt"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  emailUnique: uniqueIndex("staff_accounts_email_uq").on(table.email),
  tenantRoleIndex: index("staff_accounts_tenant_role_idx").on(table.barbershopId, table.role),
}));

export const staffSessions = mysqlTable("staffSessions", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  tokenUnique: uniqueIndex("staff_sessions_token_uq").on(table.tokenHash),
  accountIndex: index("staff_sessions_account_idx").on(table.staffAccountId),
}));

export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: createdAt(),
}, (table) => ({
  tokenUnique: uniqueIndex("password_reset_token_uq").on(table.tokenHash),
  accountIndex: index("password_reset_account_idx").on(table.staffAccountId),
}));

export const barbers = mysqlTable("barbers", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  staffAccountId: int("staffAccountId"),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  title: varchar("title", { length: 120 }),
  bio: text("bio"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  tenantIndex: index("barbers_tenant_idx").on(table.barbershopId),
  staffUnique: uniqueIndex("barbers_staff_uq").on(table.staffAccountId),
}));

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("Cabelo"),
  iconKey: varchar("iconKey", { length: 64 }).notNull().default("scissors"),
  price: money("price").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  tenantActiveIndex: index("services_tenant_active_idx").on(table.barbershopId, table.isActive),
}));

export const barberServices = mysqlTable("barberServices", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  barberId: int("barberId").notNull(),
  serviceId: int("serviceId").notNull(),
}, (table) => ({
  assignmentUnique: uniqueIndex("barber_services_unique").on(table.barberId, table.serviceId),
  tenantIndex: index("barber_services_tenant_idx").on(table.barbershopId),
}));

export const barberWorkingHours = mysqlTable("barberWorkingHours", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  barberId: int("barberId").notNull(),
  weekday: int("weekday").notNull(),
  startTime: time("startTime").notNull(),
  endTime: time("endTime").notNull(),
  breakStart: time("breakStart"),
  breakEnd: time("breakEnd"),
  isDayOff: boolean("isDayOff").notNull().default(false),
}, (table) => ({
  barberDayUnique: uniqueIndex("barber_working_hours_day_uq").on(table.barberId, table.weekday),
  tenantIndex: index("barber_hours_tenant_idx").on(table.barbershopId),
}));

export const barberTimeBlocks = mysqlTable("barberTimeBlocks", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  barberId: int("barberId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  reason: varchar("reason", { length: 180 }),
  createdAt: createdAt(),
}, (table) => ({
  barberTimeIndex: index("barber_time_blocks_range_idx").on(table.barbershopId, table.barberId, table.startsAt),
}));

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 32 }).notNull(),
  birthday: date("birthday"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  phoneUniquePerTenant: uniqueIndex("customers_tenant_phone_uq").on(table.barbershopId, table.whatsapp),
  tenantNameIndex: index("customers_tenant_name_idx").on(table.barbershopId, table.name),
}));

export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  customerId: int("customerId").notNull(),
  barberId: int("barberId"),
  bookingRef: varchar("bookingRef", { length: 16 }).notNull(),
  status: mysqlEnum("status", ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).notNull().default("scheduled"),
  source: mysqlEnum("source", ["public", "panel"]).notNull().default("public"),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  totalDurationMinutes: int("totalDurationMinutes").notNull(),
  subtotal: money("subtotal").notNull(),
  discount: money("discount").notNull().default(0),
  total: money("total").notNull(),
  customerNote: text("customerNote"),
  internalNote: text("internalNote"),
  createdByStaffId: int("createdByStaffId"),
  cancellationTokenHash: varchar("cancellationTokenHash", { length: 64 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  bookingRefUnique: uniqueIndex("appointments_booking_ref_uq").on(table.bookingRef),
  tenantStartsIndex: index("appointments_tenant_starts_idx").on(table.barbershopId, table.startsAt),
  barberStartsIndex: index("appointments_barber_starts_idx").on(table.barbershopId, table.barberId, table.startsAt),
  customerIndex: index("appointments_customer_idx").on(table.barbershopId, table.customerId),
}));

export const appointmentItems = mysqlTable("appointmentItems", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  appointmentId: int("appointmentId").notNull(),
  serviceId: int("serviceId"),
  serviceName: varchar("serviceName", { length: 140 }).notNull(),
  unitPrice: money("unitPrice").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  coveredByPlan: boolean("coveredByPlan").notNull().default(false),
}, (table) => ({
  appointmentIndex: index("appointment_items_tenant_appointment_idx").on(table.barbershopId, table.appointmentId),
}));

export const waitlistEntries = mysqlTable("waitlistEntries", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 32 }).notNull(),
  barberId: int("barberId"),
  serviceIds: json("serviceIds").notNull(),
  desiredDate: date("desiredDate"),
  status: mysqlEnum("status", ["waiting", "contacted", "scheduled", "cancelled"]).notNull().default("waiting"),
  createdAt: createdAt(),
}, (table) => ({
  queueIndex: index("waitlist_queue_idx").on(table.barbershopId, table.status, table.createdAt),
}));

export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  description: text("description"),
  monthlyPrice: money("monthlyPrice").notNull(),
  usageLimit: int("usageLimit"),
  validityDays: int("validityDays"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  tenantIndex: index("plans_tenant_idx").on(table.barbershopId, table.isActive),
}));

export const planServices = mysqlTable("planServices", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  planId: int("planId").notNull(),
  serviceId: int("serviceId").notNull(),
}, (table) => ({
  planServiceUnique: uniqueIndex("plan_services_unique").on(table.planId, table.serviceId),
  tenantIndex: index("plan_services_tenant_idx").on(table.barbershopId),
}));

export const customerSubscriptions = mysqlTable("customerSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  customerId: int("customerId").notNull(),
  planId: int("planId").notNull(),
  status: mysqlEnum("status", ["active", "expired", "delinquent", "paused", "cancelled"]).notNull().default("active"),
  cycleStartsAt: timestamp("cycleStartsAt").notNull(),
  cycleEndsAt: timestamp("cycleEndsAt").notNull(),
  usageCount: int("usageCount").notNull().default(0),
  lastPaymentAt: timestamp("lastPaymentAt"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  tenantCustomerIndex: index("subscriptions_customer_idx").on(table.barbershopId, table.customerId, table.status),
  cycleIndex: index("subscriptions_cycle_idx").on(table.barbershopId, table.cycleEndsAt),
}));

export const planUsage = mysqlTable("planUsage", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  subscriptionId: int("subscriptionId").notNull(),
  appointmentId: int("appointmentId").notNull(),
  serviceId: int("serviceId").notNull(),
  usedAt: timestamp("usedAt").defaultNow().notNull(),
}, (table) => ({
  tenantSubscriptionIndex: index("plan_usage_subscription_idx").on(table.barbershopId, table.subscriptionId),
}));

export const cashSessions = mysqlTable("cashSessions", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  openedByStaffId: int("openedByStaffId").notNull(),
  closedByStaffId: int("closedByStaffId"),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  openingFloat: money("openingFloat").notNull().default(0),
  expectedTotal: money("expectedTotal"),
  countedTotal: money("countedTotal"),
  difference: money("difference"),
  notes: text("notes"),
}, (table) => ({
  tenantOpenIndex: index("cash_sessions_tenant_open_idx").on(table.barbershopId, table.closedAt),
}));

export const financialTransactions = mysqlTable("financialTransactions", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  kind: mysqlEnum("kind", ["income", "expense"]).notNull(),
  source: varchar("source", { length: 48 }).notNull().default("other"),
  category: varchar("category", { length: 100 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  amount: money("amount").notNull(),
  machineFee: money("machineFee").notNull().default(0),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "pix", "credit", "debit", "other"]),
  appointmentId: int("appointmentId"),
  subscriptionId: int("subscriptionId"),
  commissionSettlementId: int("commissionSettlementId"),
  cashSessionId: int("cashSessionId"),
  dueAt: timestamp("dueAt"),
  paidAt: timestamp("paidAt"),
  recurring: boolean("recurring").notNull().default(false),
  createdByStaffId: int("createdByStaffId"),
  createdAt: createdAt(),
}, (table) => ({
  tenantPaidIndex: index("transactions_tenant_paid_idx").on(table.barbershopId, table.paidAt),
  tenantDueIndex: index("transactions_tenant_due_idx").on(table.barbershopId, table.dueAt),
  appointmentUnique: uniqueIndex("transactions_appointment_unique").on(table.appointmentId),
}));

export const recurringExpenses = mysqlTable("recurringExpenses", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  amount: money("amount").notNull(),
  recurrence: mysqlEnum("recurrence", ["weekly", "monthly", "yearly"]).notNull().default("monthly"),
  nextDueAt: timestamp("nextDueAt").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
}, (table) => ({
  dueIndex: index("recurring_expenses_due_idx").on(table.barbershopId, table.nextDueAt, table.isActive),
}));

export const commissionRules = mysqlTable("commissionRules", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  barberId: int("barberId").notNull(),
  serviceId: int("serviceId"),
  scope: mysqlEnum("scope", ["service", "product", "plan", "all"]).notNull().default("all"),
  calculation: mysqlEnum("calculation", ["percentage", "fixed_per_service", "chair_rent"]).notNull().default("percentage"),
  value: money("value").notNull().default(0),
  planPercentage: money("planPercentage").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  barberIndex: index("commission_rules_barber_idx").on(table.barbershopId, table.barberId),
}));

export const commissionSettlements = mysqlTable("commissionSettlements", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  barberId: int("barberId").notNull(),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  grossAmount: money("grossAmount").notNull(),
  discounts: money("discounts").notNull().default(0),
  advances: money("advances").notNull().default(0),
  netAmount: money("netAmount").notNull(),
  status: mysqlEnum("status", ["open", "paid"]).notNull().default("open"),
  paidAt: timestamp("paidAt"),
  createdAt: createdAt(),
}, (table) => ({
  barberPeriodIndex: index("commission_settlements_period_idx").on(table.barbershopId, table.barberId, table.periodStart),
}));

export const commissionEntries = mysqlTable("commissionEntries", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  settlementId: int("settlementId"),
  barberId: int("barberId").notNull(),
  appointmentId: int("appointmentId"),
  description: varchar("description", { length: 220 }).notNull(),
  amount: money("amount").notNull(),
  kind: mysqlEnum("kind", ["service", "product", "plan", "advance", "adjustment"]).notNull(),
  createdAt: createdAt(),
}, (table) => ({
  barberPeriodIndex: index("commission_entries_barber_idx").on(table.barbershopId, table.barberId, table.createdAt),
}));

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  sku: varchar("sku", { length: 64 }),
  costPrice: money("costPrice").notNull().default(0),
  salePrice: money("salePrice").notNull().default(0),
  quantity: int("quantity").notNull().default(0),
  minimumQuantity: int("minimumQuantity").notNull().default(0),
  useInternally: boolean("useInternally").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  tenantNameIndex: index("products_tenant_name_idx").on(table.barbershopId, table.name),
  skuUniquePerTenant: uniqueIndex("products_tenant_sku_uq").on(table.barbershopId, table.sku),
}));

export const appointmentProducts = mysqlTable("appointmentProducts", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  appointmentId: int("appointmentId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: money("unitPrice").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  appointmentIndex: index("appointment_products_idx").on(table.barbershopId, table.appointmentId),
}));

export const stockMovements = mysqlTable("stockMovements", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  productId: int("productId").notNull(),
  kind: mysqlEnum("kind", ["in", "out", "sale", "internal_use", "adjustment"]).notNull(),
  quantity: int("quantity").notNull(),
  note: varchar("note", { length: 220 }),
  appointmentId: int("appointmentId"),
  createdByStaffId: int("createdByStaffId"),
  createdAt: createdAt(),
}, (table) => ({
  productMovementIndex: index("stock_movements_product_idx").on(table.barbershopId, table.productId, table.createdAt),
}));

export const loyaltyLedger = mysqlTable("loyaltyLedger", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  customerId: int("customerId").notNull(),
  points: int("points").notNull(),
  description: varchar("description", { length: 220 }).notNull(),
  appointmentId: int("appointmentId"),
  createdAt: createdAt(),
}, (table) => ({
  customerLedgerIndex: index("loyalty_customer_idx").on(table.barbershopId, table.customerId, table.createdAt),
}));

export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  code: varchar("code", { length: 48 }).notNull(),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull(),
  discountValue: money("discountValue").notNull(),
  validFrom: timestamp("validFrom"),
  validUntil: timestamp("validUntil"),
  usageLimit: int("usageLimit"),
  usageCount: int("usageCount").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
}, (table) => ({
  codeUniquePerTenant: uniqueIndex("coupons_tenant_code_uq").on(table.barbershopId, table.code),
}));

export const couponUses = mysqlTable("couponUses", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  couponId: int("couponId").notNull(),
  customerId: int("customerId"),
  appointmentId: int("appointmentId"),
  usedAt: timestamp("usedAt").defaultNow().notNull(),
}, (table) => ({
  couponUseIndex: index("coupon_uses_coupon_idx").on(table.barbershopId, table.couponId, table.usedAt),
}));

export const promotions = mysqlTable("promotions", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["service_discount", "time_discount", "combo"]).notNull(),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull(),
  discountValue: money("discountValue").notNull(),
  config: json("config"),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: createdAt(),
}, (table) => ({
  tenantActiveIndex: index("promotions_tenant_active_idx").on(table.barbershopId, table.isActive),
}));

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  appointmentId: int("appointmentId").notNull(),
  customerId: int("customerId").notNull(),
  barberId: int("barberId").notNull(),
  serviceId: int("serviceId"),
  rating: int("rating").notNull(),
  comment: text("comment"),
  isVisible: boolean("isVisible").notNull().default(true),
  createdAt: createdAt(),
}, (table) => ({
  appointmentUnique: uniqueIndex("reviews_appointment_uq").on(table.appointmentId),
  barberReviewsIndex: index("reviews_barber_idx").on(table.barbershopId, table.barberId, table.createdAt),
}));

export const customerPhotos = mysqlTable("customerPhotos", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  customerId: int("customerId").notNull(),
  appointmentId: int("appointmentId"),
  storagePath: text("storagePath").notNull(),
  caption: varchar("caption", { length: 220 }),
  uploadedByStaffId: int("uploadedByStaffId").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  customerPhotosIndex: index("customer_photos_customer_idx").on(table.barbershopId, table.customerId, table.createdAt),
}));

export const platformPayments = mysqlTable("platformPayments", {
  id: int("id").autoincrement().primaryKey(),
  barbershopId: int("barbershopId").notNull(),
  amount: money("amount").notNull(),
  paidAt: timestamp("paidAt").notNull(),
  periodStart: date("periodStart"),
  periodEnd: date("periodEnd"),
  notes: varchar("notes", { length: 220 }),
  recordedByStaffId: int("recordedByStaffId").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  tenantPaidIndex: index("platform_payments_tenant_paid_idx").on(table.barbershopId, table.paidAt),
}));

export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;
export type Barber = typeof barbers.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Barbershop = typeof barbershops.$inferSelect;
