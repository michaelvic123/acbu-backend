import { MongoClient, Db } from "mongodb";
import { config } from "./env";
import { logger } from "./logger";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongoDB(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(config.mongodbUri);
    await client.connect();
    db = client.db();

    logger.info("MongoDB connected successfully");

    const collection = db.collection("cache");

    await Promise.all([
      collection.createIndex(
        { key: 1, expiresAt: 1 },
        { name: "idx_key_expiresAt" }
      ),
      collection.createIndex(
        { expiresAt: 1 },
        { name: "idx_expiresAt_ttl", expireAfterSeconds: 0 }
      ),
    ]).catch((error) => {
      logger.warn("Index creation warning", error);
    });

    return db;
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    throw error;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("MongoDB disconnected");
  }
}

export function getMongoDB(): Db {
  if (!db) {
    throw new Error("MongoDB not connected. Call connectMongoDB() first.");
  }
  return db;
}
