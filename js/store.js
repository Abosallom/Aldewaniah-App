/* ===========================================================
   Store — a swappable data layer.

   Everything is async (returns Promises) on purpose: today it is
   backed by localStorage, but you can replace the internals with
   Firebase, Supabase, or your own REST API WITHOUT touching any
   feature module — they only ever call Store.list/add/update/remove.

   To switch backends later, implement the same 6 methods against
   your service and assign it to window.Store.
   =========================================================== */
(function () {
  const PREFIX = 'aldewaniah.data.';
  const subscribers = {}; // collection -> [fn]

  function read(collection) {
    try { return JSON.parse(localStorage.getItem(PREFIX + collection)) || []; }
    catch { return []; }
  }
  function write(collection, rows) {
    localStorage.setItem(PREFIX + collection, JSON.stringify(rows));
    (subscribers[collection] || []).forEach((fn) => fn(rows));
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const Store = {
    /** Get all records in a collection, newest first by `createdAt`. */
    async list(collection) {
      return read(collection).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async get(collection, id) {
      return read(collection).find((r) => r.id === id) || null;
    },
    async add(collection, record) {
      const rows = read(collection);
      const row = Object.assign({ id: uid(), createdAt: Date.now() }, record);
      rows.push(row);
      write(collection, rows);
      return row;
    },
    async update(collection, id, patch) {
      const rows = read(collection);
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) return null;
      rows[i] = Object.assign({}, rows[i], patch, { id, updatedAt: Date.now() });
      write(collection, rows);
      return rows[i];
    },
    async remove(collection, id) {
      write(collection, read(collection).filter((r) => r.id !== id));
    },
    /** Subscribe to changes in a collection. Returns an unsubscribe fn. */
    subscribe(collection, fn) {
      (subscribers[collection] = subscribers[collection] || []).push(fn);
      return () => {
        subscribers[collection] = (subscribers[collection] || []).filter((f) => f !== fn);
      };
    },
    /** Seed a collection only if it is currently empty (sample data). */
    async seedIfEmpty(collection, rows) {
      if (read(collection).length) return;
      write(collection, rows.map((r) => Object.assign({ id: uid(), createdAt: Date.now() }, r)));
    }
  };

  window.Store = Store;
})();
