import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Single source of truth: load the monorepo root .env so the web app shares the
// same secrets as the scraper. Runs once at server/build startup, before any
// route handler reads process.env. Native apps/web/.env(.local) still override
// if present.
loadEnv({ path: join(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a small production Docker image.
  output: "standalone",
  // Low-CPU build hosts (small VPS / containers) can exceed the 60s default while
  // prerendering; give prerender more headroom so the build doesn't flake.
  staticPageGenerationTimeout: 180,
  async headers() {
    return [
      {
        // Apple fetches this extensionless file and refuses anything that is not
        // application/json — which is what static serving infers for it. Without
        // this, iOS silently never associates the domain and every table QR opens
        // Safari instead of the app.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
