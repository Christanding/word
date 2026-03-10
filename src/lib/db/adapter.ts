import type { Entity } from "../models";

// DB Adapter interface for CRUD operations
export interface DBAdapter {
  // Create
  create<T extends Entity>(collection: string, data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;

  // Read
  findById<T extends Entity>(collection: string, id: string): Promise<T | null>;
  findMany<T extends Entity>(
    collection: string,
    query: Partial<T> & { userId?: string },
    options?: { limit?: number; orderBy?: string; order?: "asc" | "desc" }
  ): Promise<T[]>;

  // Update
  update<T extends Entity>(collection: string, id: string, data: Partial<T>): Promise<T>;

  // Delete
  delete(collection: string, id: string): Promise<void>;

  // Query helpers
  count(collection: string, query: Partial<Entity>): Promise<number>;
  exists(collection: string, id: string): Promise<boolean>;

  // Batch operations
  batchCreate<T extends Entity>(collection: string, items: Omit<T, "id" | "createdAt" | "updatedAt">[]): Promise<T[]>;
  batchUpdate<T extends Entity>(collection: string, updates: Array<{ id: string; data: Partial<T> }>): Promise<T[]>;
  batchDelete(collection: string, ids: string[]): Promise<void>;
}

// Transaction support (optional)
export interface DBAdapterWithTransaction extends DBAdapter {
  transaction<T>(fn: (adapter: DBAdapter) => Promise<T>): Promise<T>;
}
