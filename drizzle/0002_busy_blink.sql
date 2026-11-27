CREATE TABLE `platformPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barbershopId` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paidAt` timestamp NOT NULL,
	`periodStart` date,
	`periodEnd` date,
	`notes` varchar(220),
	`recordedByStaffId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platformPayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `platform_payments_tenant_paid_idx` ON `platformPayments` (`barbershopId`,`paidAt`);