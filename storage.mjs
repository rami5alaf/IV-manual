const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('iv-smartcheck', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('manuals', { keyPath: 'id' });
    request.result.createObjectStore('reviews', { autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function records(store) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function add(store, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.objectStore(store).add(value);
  });
}
