import "reflect-metadata";

jest.setTimeout(30000);

// Ensure we are in test mode
process.env.NODE_ENV = "test";
process.env.AUTH_HANDOFF_ADMIN_CALLBACK_URL =
  "http://localhost:3001/auth/callback";
process.env.AUTH_HANDOFF_VENDOR_CALLBACK_URL =
  "http://localhost:3002/auth/callback";
process.env.AUTH_HANDOFF_ADMIN_CLIENT_SECRET =
  "test-admin-client-secret-with-at-least-32-bytes";
process.env.AUTH_HANDOFF_VENDOR_CLIENT_SECRET =
  "test-vendor-client-secret-with-at-least-32-bytes";

import { AppDataSource } from "../config/database";

jest.mock("ioredis", () => require("ioredis-mock"));

beforeAll(async () => {
  // Wait to initialize the database
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // Clear the database at the start of each test suite to prevent cross-contamination
  if (AppDataSource.isInitialized) {
    const entities = AppDataSource.entityMetadatas;
    for (const entity of entities) {
      const repository = AppDataSource.getRepository(entity.name);
      await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
    }
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
