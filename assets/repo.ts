import { openDB, IDBPDatabase } from "idb";

// --- Database Configuration ---
export interface Screenshot {
  id?: number;
  pptId: string;
  blob: Blob;
  timestamp: number;
  order: number;
}

export interface Presentation {
  id: string;
  name: string;
  createdAt: number;
}

export async function initDB() {
  return openDB("SnapStackDB", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("presentations")) {
        db.createObjectStore("presentations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("screenshots")) {
        const store = db.createObjectStore("screenshots", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-ppt", "pptId");
      }
    },
  });
}

// --- Repository Pattern ---
export class PPTRepository {
  private static async getDB() {
    return await initDB();
  }

  static async createPresentation(name: string): Promise<Presentation> {
    const db = await this.getDB();
    const ppt = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    await db.put("presentations", ppt);
    return ppt;
  }

  static async getAllPresentations(): Promise<Presentation[]> {
    const db = await this.getDB();
    return db.getAll("presentations");
  }

  static async addScreenshot(pptId: string, blob: Blob): Promise<number> {
    const db = await this.getDB();
    const count = await db.countFromIndex("screenshots", "by-ppt", pptId);
    const id = await db.add("screenshots", {
      pptId,
      blob,
      timestamp: Date.now(),
      order: count,
    });
    return id as number;
  }

  static async getScreenshotsByPPT(pptId: string): Promise<Screenshot[]> {
    const db = await this.getDB();
    return db.getAllFromIndex("screenshots", "by-ppt", pptId);
  }

  static async deleteScreenshot(id: number): Promise<void> {
    const db = await this.getDB();
    await db.delete("screenshots", id);
  }
}
