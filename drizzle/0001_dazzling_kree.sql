CREATE TABLE `appointmentItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`serviceId` int,
	`serviceName` varchar(140) NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`durationMinutes` int NOT NULL,
	`coveredByPlan` boolean NOT NULL DEFAULT false,
	CONSTRAINT `appointmentItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointmentProducts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointmentProducts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`customerId` int NOT NULL,
	`barberId` int,
	`bookingRef` varchar(16) NOT NULL,
	`status` enum('scheduled','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`source` enum('public','panel') NOT NULL DEFAULT 'public',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`totalDurationMinutes` int NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`discount` decimal(12,2) NOT NULL DEFAULT 0,
	`total` decimal(12,2) NOT NULL,
	`customerNote` text,
	`internalNote` text,
	`createdByStaffId` int,
	`cancellationTokenHash` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_booking_ref_uq` UNIQUE(`bookingRef`)
);
--> statement-breakpoint
CREATE TABLE `barberServices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`barberId` int NOT NULL,
	`serviceId` int NOT NULL,
	CONSTRAINT `barberServices_id` PRIMARY KEY(`id`),
	CONSTRAINT `barber_services_unique` UNIQUE(`barberId`,`serviceId`)
);
--> statement-breakpoint
CREATE TABLE `barberTimeBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`barberId` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`reason` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `barberTimeBlocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `barberWorkingHours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`barberId` int NOT NULL,
	`weekday` int NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`breakStart` time,
	`breakEnd` time,
	`isDayOff` boolean NOT NULL DEFAULT false,
	CONSTRAINT `barberWorkingHours_id` PRIMARY KEY(`id`),
	CONSTRAINT `barber_working_hours_day_uq` UNIQUE(`barberId`,`weekday`)
);
--> statement-breakpoint
CREATE TABLE `barbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`staffAccountId` int,
	`displayName` varchar(160) NOT NULL,
	`title` varchar(120),
	`bio` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `barbers_id` PRIMARY KEY(`id`),
	CONSTRAINT `barbers_staff_uq` UNIQUE(`staffAccountId`)
);
--> statement-breakpoint
CREATE TABLE `barbershops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`logoUrl` text,
	`primaryColor` varchar(24) NOT NULL DEFAULT '#B28A4A',
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`status` enum('trial','active','delinquent','blocked') NOT NULL DEFAULT 'trial',
	`trialEndsAt` timestamp NOT NULL,
	`monthlyFee` decimal(12,2) NOT NULL DEFAULT 0,
	`dueDay` int NOT NULL DEFAULT 10,
	`lastPaymentAt` timestamp,
	`deletedAt` timestamp,
	`plansVisible` boolean NOT NULL DEFAULT false,
	`promotionsEnabled` boolean NOT NULL DEFAULT false,
	`couponsEnabled` boolean NOT NULL DEFAULT false,
	`loyaltyEnabled` boolean NOT NULL DEFAULT false,
	`reviewsEnabled` boolean NOT NULL DEFAULT false,
	`galleryEnabled` boolean NOT NULL DEFAULT false,
	`cancellationNoticeHours` int NOT NULL DEFAULT 4,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `barbershops_id` PRIMARY KEY(`id`),
	CONSTRAINT `barbershops_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `cashSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`openedByStaffId` int NOT NULL,
	`closedByStaffId` int,
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`openingFloat` decimal(12,2) NOT NULL DEFAULT 0,
	`expectedTotal` decimal(12,2),
	`countedTotal` decimal(12,2),
	`difference` decimal(12,2),
	`notes` text,
	CONSTRAINT `cashSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commissionEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`settlementId` int,
	`barberId` int NOT NULL,
	`appointmentId` int,
	`description` varchar(220) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`kind` enum('service','product','plan','advance','adjustment') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commissionEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commissionRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`barberId` int NOT NULL,
	`serviceId` int,
	`scope` enum('service','product','plan','all') NOT NULL DEFAULT 'all',
	`calculation` enum('percentage','fixed_per_service','chair_rent') NOT NULL DEFAULT 'percentage',
	`value` decimal(12,2) NOT NULL DEFAULT 0,
	`planPercentage` decimal(12,2) NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commissionRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commissionSettlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`barberId` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`grossAmount` decimal(12,2) NOT NULL,
	`discounts` decimal(12,2) NOT NULL DEFAULT 0,
	`advances` decimal(12,2) NOT NULL DEFAULT 0,
	`netAmount` decimal(12,2) NOT NULL,
	`status` enum('open','paid') NOT NULL DEFAULT 'open',
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commissionSettlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `couponUses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`couponId` int NOT NULL,
	`customerId` int,
	`appointmentId` int,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `couponUses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`code` varchar(48) NOT NULL,
	`discountType` enum('percentage','fixed') NOT NULL,
	`discountValue` decimal(12,2) NOT NULL,
	`validFrom` timestamp,
	`validUntil` timestamp,
	`usageLimit` int,
	`usageCount` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_tenant_code_uq` UNIQUE(`barbershopId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `customerPhotos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`customerId` int NOT NULL,
	`appointmentId` int,
	`storagePath` text NOT NULL,
	`caption` varchar(220),
	`uploadedByStaffId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerPhotos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customerSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`customerId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','expired','delinquent','paused','cancelled') NOT NULL DEFAULT 'active',
	`cycleStartsAt` timestamp NOT NULL,
	`cycleEndsAt` timestamp NOT NULL,
	`usageCount` int NOT NULL DEFAULT 0,
	`lastPaymentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerSubscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`whatsapp` varchar(32) NOT NULL,
	`birthday` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_tenant_phone_uq` UNIQUE(`barbershopId`,`whatsapp`)
);
--> statement-breakpoint
CREATE TABLE `financialTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`kind` enum('income','expense') NOT NULL,
	`source` varchar(48) NOT NULL DEFAULT 'other',
	`category` varchar(100) NOT NULL,
	`description` varchar(240) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`machineFee` decimal(12,2) NOT NULL DEFAULT 0,
	`paymentMethod` enum('cash','pix','credit','debit','other'),
	`appointmentId` int,
	`subscriptionId` int,
	`commissionSettlementId` int,
	`cashSessionId` int,
	`dueAt` timestamp,
	`paidAt` timestamp,
	`recurring` boolean NOT NULL DEFAULT false,
	`createdByStaffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financialTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_appointment_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `loyaltyLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`customerId` int NOT NULL,
	`points` int NOT NULL,
	`description` varchar(220) NOT NULL,
	`appointmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loyaltyLedger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_token_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `planServices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`planId` int NOT NULL,
	`serviceId` int NOT NULL,
	CONSTRAINT `planServices_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_services_unique` UNIQUE(`planId`,`serviceId`)
);
--> statement-breakpoint
CREATE TABLE `planUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`subscriptionId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`serviceId` int NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `planUsage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text,
	`monthlyPrice` decimal(12,2) NOT NULL,
	`usageLimit` int,
	`validityDays` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`sku` varchar(64),
	`costPrice` decimal(12,2) NOT NULL DEFAULT 0,
	`salePrice` decimal(12,2) NOT NULL DEFAULT 0,
	`quantity` int NOT NULL DEFAULT 0,
	`minimumQuantity` int NOT NULL DEFAULT 0,
	`useInternally` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_tenant_sku_uq` UNIQUE(`barbershopId`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`kind` enum('service_discount','time_discount','combo') NOT NULL,
	`discountType` enum('percentage','fixed') NOT NULL,
	`discountValue` decimal(12,2) NOT NULL,
	`config` json,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recurringExpenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`category` varchar(100) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`recurrence` enum('weekly','monthly','yearly') NOT NULL DEFAULT 'monthly',
	`nextDueAt` timestamp NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recurringExpenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`customerId` int NOT NULL,
	`barberId` int NOT NULL,
	`serviceId` int,
	`rating` int NOT NULL,
	`comment` text,
	`isVisible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviews_appointment_uq` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`category` varchar(80) NOT NULL DEFAULT 'Cabelo',
	`iconKey` varchar(64) NOT NULL DEFAULT 'scissors',
	`price` decimal(12,2) NOT NULL,
	`durationMinutes` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staffAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('super_admin','owner','barber','receptionist') NOT NULL,
	`barberId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`mustChangePassword` boolean NOT NULL DEFAULT false,
	`lastSignedInAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staffAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_accounts_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `staffSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_sessions_token_uq` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`productId` int NOT NULL,
	`kind` enum('in','out','sale','internal_use','adjustment') NOT NULL,
	`quantity` int NOT NULL,
	`note` varchar(220),
	`appointmentId` int,
	`createdByStaffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waitlistEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`customerId` int,
	`customerName` varchar(160) NOT NULL,
	`whatsapp` varchar(32) NOT NULL,
	`barberId` int,
	`serviceIds` json NOT NULL,
	`desiredDate` date,
	`status` enum('waiting','contacted','scheduled','cancelled') NOT NULL DEFAULT 'waiting',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlistEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `appointment_items_tenant_appointment_idx` ON `appointmentItems` (`barbershopId`,`appointmentId`);--> statement-breakpoint
CREATE INDEX `appointment_products_idx` ON `appointmentProducts` (`barbershopId`,`appointmentId`);--> statement-breakpoint
CREATE INDEX `appointments_tenant_starts_idx` ON `appointments` (`barbershopId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `appointments_barber_starts_idx` ON `appointments` (`barbershopId`,`barberId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `appointments_customer_idx` ON `appointments` (`barbershopId`,`customerId`);--> statement-breakpoint
CREATE INDEX `barber_services_tenant_idx` ON `barberServices` (`barbershopId`);--> statement-breakpoint
CREATE INDEX `barber_time_blocks_range_idx` ON `barberTimeBlocks` (`barbershopId`,`barberId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `barber_hours_tenant_idx` ON `barberWorkingHours` (`barbershopId`);--> statement-breakpoint
CREATE INDEX `barbers_tenant_idx` ON `barbers` (`barbershopId`);--> statement-breakpoint
CREATE INDEX `barbershops_status_idx` ON `barbershops` (`status`);--> statement-breakpoint
CREATE INDEX `cash_sessions_tenant_open_idx` ON `cashSessions` (`barbershopId`,`closedAt`);--> statement-breakpoint
CREATE INDEX `commission_entries_barber_idx` ON `commissionEntries` (`barbershopId`,`barberId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `commission_rules_barber_idx` ON `commissionRules` (`barbershopId`,`barberId`);--> statement-breakpoint
CREATE INDEX `commission_settlements_period_idx` ON `commissionSettlements` (`barbershopId`,`barberId`,`periodStart`);--> statement-breakpoint
CREATE INDEX `coupon_uses_coupon_idx` ON `couponUses` (`barbershopId`,`couponId`,`usedAt`);--> statement-breakpoint
CREATE INDEX `customer_photos_customer_idx` ON `customerPhotos` (`barbershopId`,`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `customerSubscriptions` (`barbershopId`,`customerId`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_cycle_idx` ON `customerSubscriptions` (`barbershopId`,`cycleEndsAt`);--> statement-breakpoint
CREATE INDEX `customers_tenant_name_idx` ON `customers` (`barbershopId`,`name`);--> statement-breakpoint
CREATE INDEX `transactions_tenant_paid_idx` ON `financialTransactions` (`barbershopId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `transactions_tenant_due_idx` ON `financialTransactions` (`barbershopId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `loyalty_customer_idx` ON `loyaltyLedger` (`barbershopId`,`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `password_reset_account_idx` ON `passwordResetTokens` (`staffAccountId`);--> statement-breakpoint
CREATE INDEX `plan_services_tenant_idx` ON `planServices` (`barbershopId`);--> statement-breakpoint
CREATE INDEX `plan_usage_subscription_idx` ON `planUsage` (`barbershopId`,`subscriptionId`);--> statement-breakpoint
CREATE INDEX `plans_tenant_idx` ON `plans` (`barbershopId`,`isActive`);--> statement-breakpoint
CREATE INDEX `products_tenant_name_idx` ON `products` (`barbershopId`,`name`);--> statement-breakpoint
CREATE INDEX `promotions_tenant_active_idx` ON `promotions` (`barbershopId`,`isActive`);--> statement-breakpoint
CREATE INDEX `recurring_expenses_due_idx` ON `recurringExpenses` (`barbershopId`,`nextDueAt`,`isActive`);--> statement-breakpoint
CREATE INDEX `reviews_barber_idx` ON `reviews` (`barbershopId`,`barberId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `services_tenant_active_idx` ON `services` (`barbershopId`,`isActive`);--> statement-breakpoint
CREATE INDEX `staff_accounts_tenant_role_idx` ON `staffAccounts` (`barbershopId`,`role`);--> statement-breakpoint
CREATE INDEX `staff_sessions_account_idx` ON `staffSessions` (`staffAccountId`);--> statement-breakpoint
CREATE INDEX `stock_movements_product_idx` ON `stockMovements` (`barbershopId`,`productId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `waitlist_queue_idx` ON `waitlistEntries` (`barbershopId`,`status`,`createdAt`);