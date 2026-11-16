export const CLIPFLOW_DB_NAME = 'clipflow';
export const CLIPFLOW_RECORDS_STORE = 'records';

let opening: Promise<IDBDatabase> | null = null;

export function openRecordsDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(CLIPFLOW_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLIPFLOW_RECORDS_STORE)) {
        db.createObjectStore(CLIPFLOW_RECORDS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
  });
  return opening;
}

export function readRecord(key: string): Promise<unknown> {
  return openRecordsDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CLIPFLOW_RECORDS_STORE, 'readonly');
        const request = tx.objectStore(CLIPFLOW_RECORDS_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
      }),
  );
}

export function writeRecord(key: string, value: unknown): Promise<void> {
  return openRecordsDb().then((db) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(CLIPFLOW_RECORDS_STORE, 'readwrite');
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(tx.error ?? new Error('IndexedDB write failed'));
      };
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = fail;
      tx.onabort = fail;
      try {
        tx.objectStore(CLIPFLOW_RECORDS_STORE).put(value, key);
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
    });
  });
}
