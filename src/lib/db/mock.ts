import type { DBAdapter, DBAdapterWithTransaction } from "./adapter";
import type { Entity } from "../models";
import * as fs from "fs";
import os from "node:os";
import * as path from "path";

// Pure in-memory mock DB for local development and tests
export class MockDBAdapter implements DBAdapterWithTransaction {
  private data: Map<string, Map<string, Entity>> = new Map();
  private readonly dbFilePath = process.env.MOCK_DB_FILE_PATH || path.join(os.tmpdir(), "word-mock-db", "mock-db.json");
  private readonly legacyDbFilePath = path.join(process.cwd(), ".local", "mock-db.json");

  private loadFromDisk(): void {
    const sourcePath = fs.existsSync(this.dbFilePath)
      ? this.dbFilePath
      : fs.existsSync(this.legacyDbFilePath)
        ? this.legacyDbFilePath
        : null;

    if (!sourcePath) {
      return;
    }

    const raw = fs.readFileSync(sourcePath, "utf-8");
    if (!raw.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, Entity>>;
      this.data = new Map(
        Object.entries(parsed).map(([collection, docs]) => [collection, new Map(Object.entries(docs))])
      );
    } catch {
      this.data = new Map();
      this.saveToDisk();
    }
  }

  private saveToDisk(): void {
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const serializable: Record<string, Record<string, Entity>> = {};
    for (const [collection, docs] of this.data.entries()) {
      serializable[collection] = Object.fromEntries(docs.entries());
    }

    fs.writeFileSync(this.dbFilePath, JSON.stringify(serializable, null, 2), "utf-8");
  }

  private getCollection(collection: string): Map<string, Entity> {
    this.loadFromDisk();
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    return this.data.get(collection)!;
  }

  // Create
  async create<T extends Entity>(
    collection: string,
    data: Omit<T, "id" | "createdAt" | "updatedAt">
  ): Promise<T> {
    const docs = this.getCollection(collection);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const entity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;
    docs.set(id, entity);
    this.saveToDisk();
    return entity;
  }

  // Read
  async findById<T extends Entity>(collection: string, id: string): Promise<T | null> {
    const docs = this.getCollection(collection);
    return (docs.get(id) as T) || null;
  }

  async findMany<T extends Entity>(
    collection: string,
    query: Partial<T> & { userId?: string },
    options?: { limit?: number; orderBy?: string; order?: "asc" | "desc" }
  ): Promise<T[]> {
    const docs = this.getCollection(collection);
    let results = Array.from(docs.values()) as T[];

    // Apply filters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          results = results.filter((doc) => doc[key as keyof T] === value);
        }
      });
    }

    // Apply ordering
    if (options?.orderBy) {
      results.sort((a, b) => {
        const aVal = a[options.orderBy! as keyof T] as unknown;
        const bVal = b[options.orderBy! as keyof T] as unknown;
        const compared = compareUnknownValues(aVal, bVal);
        if (compared < 0) return options?.order === "asc" ? -1 : 1;
        if (compared > 0) return options?.order === "asc" ? 1 : -1;
        return 0;
      });
    }

    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // Update
  async update<T extends Entity>(collection: string, id: string, data: Partial<T>): Promise<T> {
    const docs = this.getCollection(collection);
    const existing = docs.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found in ${collection}`);
    }
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as T;
    docs.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  // Delete
  async delete(collection: string, id: string): Promise<void> {
    const docs = this.getCollection(collection);
    docs.delete(id);
    this.saveToDisk();
  }

  // Query helpers
  async count(collection: string, query: Partial<Entity>): Promise<number> {
    const docs = this.getCollection(collection);
    let results = Array.from(docs.values());
    if (Object.keys(query).length > 0) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          results = results.filter((doc) => {
            const record = doc as Record<string, unknown>;
            return record[key] === value;
          });
        }
      });
    }
    return results.length;
  }

  async exists(collection: string, id: string): Promise<boolean> {
    const docs = this.getCollection(collection);
    return docs.has(id);
  }

  // Batch operations
  async batchCreate<T extends Entity>(
    collection: string,
    items: Omit<T, "id" | "createdAt" | "updatedAt">[]
  ): Promise<T[]> {
    const docs = this.getCollection(collection);
    const now = new Date().toISOString();
    const entities = items.map((item) => {
      const id = crypto.randomUUID();
      return {
        ...item,
        id,
        createdAt: now,
        updatedAt: now,
      } as T;
    });
    entities.forEach((entity) => {
      docs.set(entity.id, entity);
    });
    this.saveToDisk();
    return entities;
  }

  async batchUpdate<T extends Entity>(
    collection: string,
    updates: Array<{ id: string; data: Partial<T> }>
  ): Promise<T[]> {
    const promises = updates.map(({ id, data }) => this.update(collection, id, data));
    return Promise.all(promises) as Promise<T[]>;
  }

  async batchDelete(collection: string, ids: string[]): Promise<void> {
    const docs = this.getCollection(collection);
    ids.forEach((id) => {
      docs.delete(id);
    });
    this.saveToDisk();
  }

  // Transaction support (simplified for mock - just runs without rollback)
  async transaction<T>(fn: (adapter: DBAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  // Reset for testing
  reset() {
    this.data = new Map();
    this.saveToDisk();
  }
}

function compareUnknownValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

// Singleton instance
let cachedAdapter: MockDBAdapter | null = null;

export function getMockDBAdapter(): MockDBAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new MockDBAdapter();
  }
  return cachedAdapter;
}

// Export reset function for testing
export function resetMockDBAdapter() {
  cachedAdapter = null;
  const adapter = getMockDBAdapter();
  adapter.reset();
}
