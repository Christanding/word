import type { DBAdapter, DBAdapterWithTransaction } from "./adapter";
import type { Entity } from "../models";
import cloudbase from "@cloudbase/node-sdk";

type CloudRecord = Record<string, unknown>;

interface CloudDocRef {
  get(): Promise<{ data: CloudRecord | null }>;
  update(data: CloudRecord): Promise<void>;
  remove(): Promise<void>;
}

interface CloudCollectionRef {
  add(data: unknown): Promise<{ id: string; ids?: string[] }>;
  doc(id: string): CloudDocRef;
  where(query: CloudRecord): CloudCollectionRef;
  orderBy(field: string, order: "asc" | "desc"): CloudCollectionRef;
  limit(limit: number): CloudCollectionRef;
  get(): Promise<{ data: CloudRecord[] }>;
  count(): Promise<{ total: number }>;
  remove(ids: string[]): Promise<void>;
}

interface CloudTransaction {
  collection(name: string): CloudCollectionRef;
}

interface CloudDatabase {
  collection(name: string): CloudCollectionRef;
  runTransaction<T>(fn: (transaction: CloudTransaction) => Promise<T>): Promise<T>;
}

// CloudBase configuration
const config = {
  env: process.env.CLOUDBASE_ENV || "your-env-id",
  credentials: {
    secretId: process.env.TENCENT_SECRET_ID || "",
    secretKey: process.env.TENCENT_SECRET_KEY || "",
  },
};

// Initialize CloudBase client
const app = cloudbase.init({
  env: config.env,
  secretId: config.credentials.secretId || undefined,
  secretKey: config.credentials.secretKey || undefined,
});

// CloudBase DB Adapter implementation
export class CloudBaseDBAdapter implements DBAdapterWithTransaction {
  private db: CloudDatabase;

  constructor() {
    this.db = app.database() as unknown as CloudDatabase;
  }

  // Create
  async create<T extends Entity>(
    collection: string,
    data: Omit<T, "id" | "createdAt" | "updatedAt">
  ): Promise<T> {
    const result = await this.db.collection(collection).add(data);
    return { ...data, id: result.id } as T;
  }

  // Read
  async findById<T extends Entity>(collection: string, id: string): Promise<T | null> {
    const result = await this.db.collection(collection).doc(id).get();
    return result.data as T | null;
  }

  async findMany<T extends Entity>(
    collection: string,
    query: Partial<T> & { userId?: string },
    options?: { limit?: number; orderBy?: string; order?: "asc" | "desc" }
  ): Promise<T[]> {
    let queryBuilder = this.db.collection(collection);

    // Apply filters
    if (query) {
      const whereClause: CloudRecord = {};
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          whereClause[key] = value;
        }
      });
      if (Object.keys(whereClause).length > 0) {
        queryBuilder = queryBuilder.where(whereClause);
      }
    }

    // Apply ordering
    if (options?.orderBy) {
      queryBuilder = queryBuilder.orderBy(options.orderBy, options.order || "desc");
    }

    // Apply limit
    if (options?.limit) {
      queryBuilder = queryBuilder.limit(options.limit);
    }

    const result = await queryBuilder.get();
    return result.data as T[];
  }

  // Update
  async update<T extends Entity>(collection: string, id: string, data: Partial<T>): Promise<T> {
    await this.db.collection(collection).doc(id).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return this.findById(collection, id) as Promise<T>;
  }

  // Delete
  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).remove();
  }

  // Query helpers
  async count(collection: string, query: Partial<Entity>): Promise<number> {
    let queryBuilder = this.db.collection(collection);
    if (Object.keys(query).length > 0) {
      queryBuilder = queryBuilder.where(query as CloudRecord);
    }
    const result = await queryBuilder.count();
    return result.total;
  }

  async exists(collection: string, id: string): Promise<boolean> {
    const doc = await this.findById(collection, id);
    return doc !== null;
  }

  // Batch operations
  async batchCreate<T extends Entity>(
    collection: string,
    items: Omit<T, "id" | "createdAt" | "updatedAt">[]
  ): Promise<T[]> {
    const result = await this.db.collection(collection).add(items);
    const createdIds = result.ids || [];
    return items.map((item, index) => ({
      ...item,
      id: createdIds[index] || result.id,
    })) as T[];
  }

  async batchUpdate<T extends Entity>(
    collection: string,
    updates: Array<{ id: string; data: Partial<T> }>
  ): Promise<T[]> {
    const promises = updates.map(({ id, data }) => this.update(collection, id, data));
    return Promise.all(promises) as Promise<T[]>;
  }

  async batchDelete(collection: string, ids: string[]): Promise<void> {
    await this.db.collection(collection).remove(ids);
  }

  // Transaction support
  async transaction<T>(fn: (adapter: DBAdapter) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (transaction) => {
      const transactionAdapter: DBAdapter = {
        create: async <TEntity extends Entity>(
          collection: string,
          data: Omit<TEntity, "id" | "createdAt" | "updatedAt">
        ): Promise<TEntity> => {
          const result = await transaction.collection(collection).add(data);
          return { ...data, id: result.id } as TEntity;
        },
        findById: async <TEntity extends Entity>(collection: string, id: string): Promise<TEntity | null> => {
          const result = await transaction.collection(collection).doc(id).get();
          return result.data as TEntity | null;
        },
        findMany: async <TEntity extends Entity>(
          collection: string,
          query: Partial<TEntity> & { userId?: string },
          options?: { limit?: number; orderBy?: string; order?: "asc" | "desc" }
        ): Promise<TEntity[]> => {
          let queryBuilder = transaction.collection(collection);
          if (Object.keys(query).length > 0) {
            queryBuilder = queryBuilder.where(query as CloudRecord);
          }
          if (options?.orderBy) {
            queryBuilder = queryBuilder.orderBy(options.orderBy, options.order || "desc");
          }
          if (options?.limit) {
            queryBuilder = queryBuilder.limit(options.limit);
          }
          const result = await queryBuilder.get();
          return result.data as TEntity[];
        },
        update: async <TEntity extends Entity>(
          collection: string,
          id: string,
          data: Partial<TEntity>
        ): Promise<TEntity> => {
          await transaction.collection(collection).doc(id).update({
            ...data,
            updatedAt: new Date().toISOString(),
          });
          const result = await transaction.collection(collection).doc(id).get();
          return result.data as TEntity;
        },
        delete: async (collection, id) => {
          await transaction.collection(collection).doc(id).remove();
        },
        count: async (collection, query) => {
          let queryBuilder = transaction.collection(collection);
          if (Object.keys(query).length > 0) {
            queryBuilder = queryBuilder.where(query as CloudRecord);
          }
          const result = await queryBuilder.count();
          return result.total;
        },
        exists: async (collection, id) => {
          const doc = await this.findById(collection, id);
          return doc !== null;
        },
        batchCreate: async <TEntity extends Entity>(
          collection: string,
          items: Omit<TEntity, "id" | "createdAt" | "updatedAt">[]
        ): Promise<TEntity[]> => {
          const result = await transaction.collection(collection).add(items);
          const createdIds = result.ids || [];
          return items.map((item, index) => ({
            ...item,
            id: createdIds[index] || result.id,
          })) as TEntity[];
        },
        batchUpdate: async <TEntity extends Entity>(
          collection: string,
          updates: Array<{ id: string; data: Partial<TEntity> }>
        ): Promise<TEntity[]> => {
          const promises = updates.map(({ id, data }) => this.update(collection, id, data));
          return Promise.all(promises) as Promise<TEntity[]>;
        },
        batchDelete: async (collection, ids) => {
          await transaction.collection(collection).remove(ids);
        },
      };

      return fn(transactionAdapter);
    });
  }
}

// Singleton instance
let cachedAdapter: CloudBaseDBAdapter | null = null;

export function getCloudBaseAdapter(): CloudBaseDBAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new CloudBaseDBAdapter();
  }
  return cachedAdapter;
}
