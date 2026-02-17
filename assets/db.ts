import { openDB, IDBPDatabase } from "idb";

export interface Screenshot {
  id?: number;
  pptId: string; // Groups screenshots by presentation
  blob: Blob; // The actual image data
  timestamp: number;
  order: number;
}

export interface Presentation {
  id: string; // Unique ID for the PPT
  name: string;
  createdAt: number;
}

const DB_NAME = "SnapStackDB";
const DB_VERSION = 1;

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("presentations")) {
        db.createObjectStore("presentations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("screenshots")) {
        const screenshotStore = db.createObjectStore("screenshots", {
          keyPath: "id",
          autoIncrement: true,
        });
        screenshotStore.createIndex("by-ppt", "pptId");
      }
    },
  });
}
