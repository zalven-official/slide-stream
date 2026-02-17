import { initDB, Screenshot, Presentation } from "./db";

export class PPTRepository {
  private static async getDB() {
    return await initDB();
  }
  static async createPresentation(name: string): Promise<string> {
    const db = await this.getDB();
    const id = crypto.randomUUID();
    await db.put("presentations", { id, name, createdAt: Date.now() });
    return id;
  }
  static async getAllPresentations(): Promise<Presentation[]> {
    const db = await this.getDB();
    return db.getAll("presentations");
  }
  static async addScreenshot(pptId: string, blob: Blob): Promise<number> {
    const db = await this.getDB();
    const count = await db.countFromIndex("screenshots", "by-ppt", pptId);

    const newScreenshot: Screenshot = {
      pptId,
      blob,
      timestamp: Date.now(),
      order: count,
    };
    const result = await db.add("screenshots", newScreenshot);
    return result as number;
  }
  static async getScreenshotsByPPT(pptId: string): Promise<Screenshot[]> {
    const db = await this.getDB();
    return db.getAllFromIndex("screenshots", "by-ppt", pptId);
  }

  static async deleteScreenshot(id: number): Promise<void> {
    const db = await this.getDB();
    await db.delete("screenshots", id);
  }

  static async deletePresentation(pptId: string): Promise<void> {
    const db = await this.getDB();
    // 1. Delete all screenshots linked to this PPT
    const tx = db.transaction(["screenshots", "presentations"], "readwrite");
    const index = tx.objectStore("screenshots").index("by-ppt");
    const keys = await index.getAllKeys(pptId);

    for (const key of keys) {
      await tx.objectStore("screenshots").delete(key);
    }

    // 2. Delete the presentation entry
    await tx.objectStore("presentations").delete(pptId);
    await tx.done;
  }
}
