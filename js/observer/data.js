import { buildIndex } from "./search.js?v=276fa973-1";

const CATALOG_URL = "/observer/data/catalog.json";
let storePromise = null;

export function loadObserverStore() {
  if (storePromise) return storePromise;
  storePromise = fetch(CATALOG_URL, { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((doc) => {
      if (!doc || doc.schemaVersion !== 5 || !Array.isArray(doc.entries)) throw new Error("catalogue is malformed");
      const catalogue = doc.entries;
      const byId = new Map(catalogue.map((entry) => [entry.id, entry]));
      const shardPromises = new Map();
      const loadShard = (name) => {
        if (!shardPromises.has(name)) {
          shardPromises.set(name, fetch(`/observer/data/shards/${encodeURIComponent(name)}.json`, { cache: "default" })
            .then((response) => {
              if (!response.ok) throw new Error(`Could not load ${name} references: HTTP ${response.status}`);
              return response.json();
            })
            .then((shard) => new Map((shard.entries || []).map((entry) => [entry.id, entry]))));
        }
        return shardPromises.get(name);
      };
      return {
        catalogue,
        index: buildIndex(catalogue),
        findMeta: (id) => byId.get(id) || null,
        async getEntry(id) {
          const meta = byId.get(id);
          if (!meta) return null;
          const shard = await loadShard(meta.shard);
          return shard.get(id) || null;
        }
      };
    })
    .catch((error) => {
      storePromise = null;
      throw error;
    });
  return storePromise;
}
