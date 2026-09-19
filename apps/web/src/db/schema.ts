import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  uuid,
  jsonb,
  timestamp,
  date,
  pgEnum,
  customType,
  unique,
  index,
  doublePrecision,
} from "drizzle-orm/pg-core";

// Postgres `bytea` mapped to a Node Buffer. drizzle-orm has no built-in bytea, so
// we declare one: the `pg` driver returns bytea columns as Buffer on read and
// accepts Buffer on write, which is exactly the shape we want for image bytes.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ─── Enums ───────────────────────────────────────────────────────────────────

export const discountTypeEnum = pgEnum("discount_type", ["flat", "percentage"]);
// Staff roles. "admin" manages everything (incl. staff accounts + Pix secrets);
// "manager" (gerente) runs day-to-day ops (catalog, prices, promos, coupons,
// customers, orders, hours) but cannot manage staff or sensitive secrets.
export const staffRoleEnum = pgEnum("staff_role", ["admin", "manager", "cashier", "kitchen", "employee", "waiter", "driver"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
]);
// How the customer pays. "pix" settles online (BR Code); the others settle on delivery.
export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "cash",
  "card_on_delivery",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
]);
// Where the order is consumed. "delivery" needs an address; "dine_in" is tied to
// a restaurant table (orders.table_id) and never carries a delivery address.
export const orderTypeEnum = pgEnum("order_type", ["delivery", "dine_in", "pickup"]);
// Device platform a beta tester will install the app on.
export const betaPlatformEnum = pgEnum("beta_platform", ["ios", "android"]);

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").default(0),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  categoryId: integer("category_id").references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  // Promotional price (cents). When set AND within the optional window, this is
  // the effective price. null = no promo. See lib/pricing.ts (effectivePrice).
  promoPriceCents: integer("promo_price_cents"),
  promoStartsAt: timestamp("promo_starts_at", { withTimezone: true }),
  promoEndsAt: timestamp("promo_ends_at", { withTimezone: true }),
  imageUrl: text("image_url"),
  available: boolean("available").default(true),
  sortOrder: integer("sort_order").default(0),
});

// Chelas and Barbadog started as versioned iFood snapshots. Keeping their
// managed catalog in a separate table lets the admin override availability,
// edit imported items and add native products without disturbing Barbacue's
// existing numeric catalog or checkout identifiers.
export const brandCatalogProducts = pgTable("brand_catalog_products", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  originalPriceCents: integer("original_price_cents"),
  imageUrl: text("image_url"),
  ifoodUrl: text("ifood_url"),
  available: boolean("available").notNull().default(true),
  source: text("source").notNull().default("custom"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique("brand_catalog_products_brand_external_unique").on(table.brand, table.externalId),
]);

// ─── Media assets (owner-uploaded images) ─────────────────────────────────────

// Product/category/logo photos uploaded from the admin are stored HERE as raw
// bytes, not on the filesystem. Rationale: prod deploys via `rsync --delete`
// from a dev machine, so any file written to the server's public/ folder would
// be wiped on the next deploy (and never exist on the dev box). Keeping the bytes
// in Postgres makes owner uploads survive deploys and behave identically in dev
// and prod. Served by GET /api/media/[id]; referenced from products.imageUrl as
// "/api/media/<uuid>". Assets are immutable (a new upload = a new row/uuid), so
// the serving route can cache them forever.
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  mime: text("mime").notNull(),            // e.g. "image/webp", "image/jpeg"
  data: bytea("data").notNull(),           // the image bytes
  byteSize: integer("byte_size").notNull(), // bytes, for quick listing/quotas
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Staff (admin/manager accounts) ───────────────────────────────────────────

export const staffUsers = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: staffRoleEnum("role").notNull().default("manager"),
  jobTitle: text("job_title"),
  permissions: jsonb("permissions").$type<import("@/lib/permissions").Permission[]>(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Employees (HR records, separate from system logins) ─────────────────────
// An employee does not automatically receive access to the admin. `staffUsers`
// above is authentication; this table is the operational HR record used for
// payroll and schedules across the three restaurant brands.
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  jobTitle: text("job_title").notNull(),
  brand: text("brand").notNull().default("barbacue"),
  phone: text("phone"),
  email: text("email"),
  employmentType: text("employment_type").notNull().default("clt"),
  salaryCents: integer("salary_cents").notNull().default(0),
  weeklyHours: integer("weekly_hours").notNull().default(44),
  workSchedule: jsonb("work_schedule").$type<EmployeeSchedule>(),
  hireDate: date("hire_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Restaurant tables (dine-in / QR "mesa") ──────────────────────────────────

// A physical table in the restaurant. Each has an opaque `token` encoded in a
// printed QR code; scanning it opens /mesa/<token> which "seats" the guest (sets
// a short-lived table-session cookie) so they can order from that exact table.
// Rotating the token (new QR) instantly invalidates the old printout.
export const restaurantTables = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(), // human-facing table number
  label: text("label"),                          // optional ("Varanda 2", "Balcão")
  token: uuid("token").notNull().defaultRandom().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Beta signups (app test program) ─────────────────────────────────────────

// People who registered at /beta to test the mobile app. `whatsapp` is stored
// normalized (digits only, with 55 country code) so it can be matched against
// customers.phone and used directly by the WhatsApp bot for invites.
export const betaSignups = pgTable("beta_signups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  whatsapp: text("whatsapp").notNull().unique(),
  email: text("email").notNull(),
  platform: betaPlatformEnum("platform").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Coupons ──────────────────────────────────────────────────────────────────

export const customerAccounts = pgTable("customer_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const coupons = pgTable("coupons", {
  audience: text("audience").$type<import("@/lib/permissions").Audience>().notNull().default("all"),
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: discountTypeEnum("discount_type").notNull().default("flat"),
  // flat: value in cents (e.g. 500 = R$5 off); percentage: 0–100
  discountValue: integer("discount_value").notNull(),
  minOrderCents: integer("min_order_cents").default(0),
  maxUsages: integer("max_usages"),       // null = unlimited
  usedCount: integer("used_count").default(0),
  active: boolean("active").default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Store settings (single-row config) ──────────────────────────────────────

export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("Barbacue"),
  tagline: text("tagline").default("Peça agora — entregamos com amor!"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  instagramUrl: text("instagram_url"),
  logoUrl: text("logo_url"),
  openingHours: text("opening_hours"),   // legacy free-text label, kept for display
  // Machine-readable weekly schedule used by lib/store-hours.ts and the bot.
  // Shape: [{ day: 0-6 (0=Sun), closed: bool, ranges: [{ open: "HH:MM", close: "HH:MM" }] }]
  weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>(),
  timezone: text("timezone").default("America/Sao_Paulo"),
  deliveryFeeText: text("delivery_fee_text"),
  // Manual override. false = force closed regardless of schedule; true = follow schedule.
  isOpen: boolean("is_open").default(true),
  // ─── Pix (for online "copia e cola" + QR) ───
  pixKey: text("pix_key"),                       // CPF/CNPJ/email/phone/random
  pixMerchantName: text("pix_merchant_name"),    // ≤25 chars, shown in bank app
  pixMerchantCity: text("pix_merchant_city"),    // ≤15 chars, no accents
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Specific dates the store is closed (holidays, vacation). Overrides weeklyHours.
export const closedDays = pgTable("closed_days", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),   // YYYY-MM-DD
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Delivery quotes preserve the route and price the customer reviewed. Settings
// are separate from public store metadata; provider credentials stay in env.
export const deliverySettings = pgTable("delivery_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  provider: text("provider").$type<"osm">().notNull().default("osm"),
  originAddress: text("origin_address"),
  originLatitude: doublePrecision("origin_latitude"),
  originLongitude: doublePrecision("origin_longitude"),
  baseFeeCents: integer("base_fee_cents").notNull().default(0),
  feePerKmCents: integer("fee_per_km_cents").notNull().default(0),
  minFeeCents: integer("min_fee_cents").notNull().default(0),
  maxDistanceMeters: integer("max_distance_meters").notNull().default(10000),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryQuotes = pgTable("delivery_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  brand: text("brand").notNull(),
  address: text("address").notNull(),
  addressKey: text("address_key").notNull(),
  provider: text("provider").$type<"osm">().notNull(),
  distanceMeters: integer("distance_meters").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  feeCents: integer("fee_cents").notNull(),
  originLatitude: doublePrecision("origin_latitude").notNull(),
  originLongitude: doublePrecision("origin_longitude").notNull(),
  destinationLatitude: doublePrecision("destination_latitude").notNull(),
  destinationLongitude: doublePrecision("destination_longitude").notNull(),
  routeLinks: jsonb("route_links").$type<import("@/lib/delivery").DeliveryRouteLinks>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("delivery_quotes_expiry_idx").on(table.expiresAt)]);

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Dedicated self-service idempotency; legacy channels leave these null.
  selfServiceRequestId: uuid("self_service_request_id").unique(),
  selfServiceRequestHash: text("self_service_request_hash"),
  selfServiceResponse: jsonb("self_service_response").$type<import("@/lib/self-service").SelfServiceReceipt>(),
  brand: text("brand").notNull().default("barbacue"),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  // delivery (needs deliveryAddress) | dine_in (needs tableId, no address).
  orderType: orderTypeEnum("order_type").notNull().default("delivery"),
  tableId: integer("table_id").references(() => restaurantTables.id),
  deliveryAddress: text("delivery_address"),
  deliveryQuoteId: uuid("delivery_quote_id").references(() => deliveryQuotes.id),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  deliveryDistanceMeters: integer("delivery_distance_meters"),
  deliveryDurationSeconds: integer("delivery_duration_seconds"),
  deliveryRoute: jsonb("delivery_route").$type<import("@/lib/delivery").DeliveryRouteLinks>(),
  deliveryDriverId: integer("delivery_driver_id").references(() => staffUsers.id),
  deliveryStatus: text("delivery_status").$type<"assigned" | "out_for_delivery" | "delivered">(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  // [{product_id, name, price_cents, qty}]
  items: jsonb("items").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").default(0),
  totalCents: integer("total_cents").notNull(),
  couponId: integer("coupon_id").references(() => coupons.id),
  couponCode: text("coupon_code"),
  status: orderStatusEnum("status").default("pending"),
  paymentMethod: paymentMethodEnum("payment_method").default("pix"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  // "Troco para" — cash the courier should bring change for (cents). 0/null = no change needed.
  changeForCents: integer("change_for_cents"),
  // How the order was placed: "click" (UI) or "chat" (AI agent) — both equally valid.
  channel: text("channel").default("click"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, table => [index("orders_driver_delivery_idx").on(table.deliveryDriverId, table.deliveryStatus)]);

// One durable kitchen ticket per accepted self-service order. Expired leases
// require review because the paper may already have left the printer.
export const kitchenPrintJobs = pgTable("kitchen_print_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id).unique(),
  ticket: jsonb("ticket").$type<import("@/lib/kitchen-print").KitchenTicket>().notNull(),
  status: text("status").$type<import("@/lib/kitchen-print").KitchenPrintStatus>().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  printedAt: timestamp("printed_at", { withTimezone: true }),
}, table => [index("kitchen_print_jobs_ready_idx").on(table.status, table.nextAttemptAt)]);

export const kitchenPrintAgentState = pgTable("kitchen_print_agent_state", {
  id: integer("id").primaryKey().default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

// Weekly schedule shape stored in storeSettings.weeklyHours.
export interface DayHours {
  day: number; // 0=Sunday … 6=Saturday
  closed: boolean;
  ranges: { open: string; close: string }[]; // "HH:MM" 24h; multiple ranges allowed
}
export type WeeklyHours = DayHours[];

export interface EmployeeSchedule {
  days: number[]; // 0=Sunday … 6=Saturday
  start: string;  // HH:MM
  end: string;    // HH:MM
}

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type BrandCatalogProduct = typeof brandCatalogProducts.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type ClosedDay = typeof closedDays.$inferSelect;
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type OrderType = (typeof orderTypeEnum.enumValues)[number];
export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type BetaSignup = typeof betaSignups.$inferSelect;
export type BetaPlatform = (typeof betaPlatformEnum.enumValues)[number];
