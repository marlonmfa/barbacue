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
export const staffRoleEnum = pgEnum("staff_role", ["admin", "manager"]);
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
export const orderTypeEnum = pgEnum("order_type", ["delivery", "dine_in"]);
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
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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

export const coupons = pgTable("coupons", {
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

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  // delivery (needs deliveryAddress) | dine_in (needs tableId, no address).
  orderType: orderTypeEnum("order_type").notNull().default("delivery"),
  tableId: integer("table_id").references(() => restaurantTables.id),
  deliveryAddress: text("delivery_address"),
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
});

// ─── Types ───────────────────────────────────────────────────────────────────

// Weekly schedule shape stored in storeSettings.weeklyHours.
export interface DayHours {
  day: number; // 0=Sunday … 6=Saturday
  closed: boolean;
  ranges: { open: string; close: string }[]; // "HH:MM" 24h; multiple ranges allowed
}
export type WeeklyHours = DayHours[];

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type ClosedDay = typeof closedDays.$inferSelect;
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type OrderType = (typeof orderTypeEnum.enumValues)[number];
export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type BetaSignup = typeof betaSignups.$inferSelect;
export type BetaPlatform = (typeof betaPlatformEnum.enumValues)[number];
