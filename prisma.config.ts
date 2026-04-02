// Prisma CLI configuration for api/admin.
// This file is used ONLY by the Prisma CLI (prisma generate, prisma studio).
// The admin service NEVER runs migrations — schema is owned by api/auth.
// Runtime connection is handled via PrismaPg driver adapter in PrismaService.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { normalizeDatabaseUrl } from "./src/common/prisma/database-url.util";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"]
      ? normalizeDatabaseUrl(process.env["DATABASE_URL"])
      : undefined,
  },
});
