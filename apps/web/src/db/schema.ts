import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  uuid,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const discountTypeEnum = pgEnum("discount_type", ["flat", "percentage"]);
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
  imageUrl: text("image_url"),
  available: boolean("available").default(true),
  sortOrder: integer("sort_order").default(0),
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
  openingHours: text("opening_hours"),   // e.g. "Ter–Dom 18h–23h"
  deliveryFeeText: text("delivery_fee_text"),
  isOpen: boolean("is_open").default(true),
  // ─── Pix (for online "copia e cola" + QR) ───
  pixKey: text("pix_key"),                       // CPF/CNPJ/email/phone/random
  pixMerchantName: text("pix_merchant_name"),    // ≤25 chars, shown in bank app
  pixMerchantCity: text("pix_merchant_city"),    // ≤15 chars, no accents
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
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

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
