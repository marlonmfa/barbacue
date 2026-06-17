import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Single source of truth lives at the monorepo root (see next.config.ts).
dotenv.config({ path: "../../.env" });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
