import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so nothing has loaded .env for us. Node 22 can
// do it without pulling in dotenv.
if (!process.env.DATABASE_URL) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
