import type { DBAdapterWithTransaction } from "./adapter";
import { getCloudBaseAdapter } from "./cloudbase";
import { getMockDBAdapter } from "./mock";

// Get DB adapter based on environment
export function getDBAdapter(): DBAdapterWithTransaction {
  // Use mock adapter in development/test or when CloudBase is not configured
  const useMock =
    process.env.NODE_ENV === "test" ||
    process.env.USE_MOCK_DB === "1" ||
    !process.env.CLOUDBASE_ENV;

  if (useMock) {
    console.log("Using Mock DB Adapter (local development mode)");
    return getMockDBAdapter();
  }

  console.log("Using CloudBase DB Adapter (production mode)");
  return getCloudBaseAdapter();
}

// Export types and adapters for direct use
export * from "./adapter";
export * from "./cloudbase";
export * from "./mock";
