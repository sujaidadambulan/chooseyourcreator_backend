import { ensurePostgres, pushSchema } from "./src/ensure-db.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/drcollab_test";

export default async function setup() {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.PORT = "4001";
  process.env.PAYMENTS_LIVE = "false";
  process.env.NODE_ENV = "test";
  await ensurePostgres();
  pushSchema(testDatabaseUrl, true);
}
