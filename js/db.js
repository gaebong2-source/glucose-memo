// IndexedDB 데이터 계층 (Dexie 기반)
// 동기화를 위해 updatedAt / deleted 필드 포함

const db = new Dexie('glucose_memo');

db.version(1).stores({
  // ++id: auto-increment, indexed fields after
  readings: '++id, timestamp, context, updatedAt, deleted',
  alarms: '++id, enabled, updatedAt, deleted',
  meta: 'key',
});

const now = () => Date.now();

export const Readings = {
  async add({ value, context, timestamp, insulin = null, note = '' }) {
    const id = await db.readings.add({
      value: Number(value),
      context: context || 'random',
      timestamp: timestamp || now(),
      insulin: insulin == null || insulin === '' ? null : Number(insulin),
      note: note || '',
      updatedAt: now(),
      deleted: 0,
    });
    return id;
  },

  async update(id, patch) {
    await db.readings.update(id, { ...patch, updatedAt: now() });
  },

  async softDelete(id) {
    await db.readings.update(id, { deleted: 1, updatedAt: now() });
  },

  async list({ from, to, limit } = {}) {
    let coll = db.readings.orderBy('timestamp').reverse().filter((r) => !r.deleted);
    if (from != null || to != null) {
      coll = db.readings
        .where('timestamp')
        .between(from ?? 0, to ?? Number.MAX_SAFE_INTEGER, true, true)
        .filter((r) => !r.deleted)
        .reverse();
    }
    let arr = await coll.toArray();
    if (limit) arr = arr.slice(0, limit);
    return arr;
  },

  async get(id) {
    return db.readings.get(Number(id));
  },

  async stats() {
    const all = await db.readings.filter((r) => !r.deleted).toArray();
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const week0 = today0.getTime() - 6 * 86400000;

    const today = all.filter((r) => r.timestamp >= today0.getTime());
    const week = all.filter((r) => r.timestamp >= week0);

    const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, r) => s + r.value, 0) / arr.length) : null);
    return { todayAvg: avg(today), weekAvg: avg(week), count: all.length };
  },
};

export const Alarms = {
  async list() {
    return db.alarms.filter((a) => !a.deleted).toArray();
  },

  async add({ time, days, label = '', enabled = true }) {
    return db.alarms.add({
      time,
      days: days || [],
      label,
      enabled: enabled ? 1 : 0,
      updatedAt: now(),
      deleted: 0,
    });
  },

  async update(id, patch) {
    if ('enabled' in patch) patch.enabled = patch.enabled ? 1 : 0;
    await db.alarms.update(id, { ...patch, updatedAt: now() });
  },

  async softDelete(id) {
    await db.alarms.update(id, { deleted: 1, updatedAt: now() });
  },

  async get(id) {
    return db.alarms.get(Number(id));
  },
};

export const Meta = {
  async get(key, fallback = null) {
    const row = await db.meta.get(key);
    return row ? row.value : fallback;
  },
  async set(key, value) {
    await db.meta.put({ key, value });
  },
};

export async function exportAll() {
  const [readings, alarms] = await Promise.all([db.readings.toArray(), db.alarms.toArray()]);
  return { schema: 1, exportedAt: now(), readings, alarms };
}

// payload: { schema, readings, alarms } - 머지 (updatedAt 큰 쪽 우선)
export async function importMerge(payload) {
  if (!payload || payload.schema !== 1) throw new Error('알 수 없는 데이터 형식');
  let added = 0, updated = 0;

  await db.transaction('rw', db.readings, db.alarms, async () => {
    for (const r of payload.readings || []) {
      // id 충돌 회피: timestamp + value + context로 매칭
      const existing = await db.readings.where('timestamp').equals(r.timestamp).first();
      if (!existing) {
        const { id, ...rest } = r;
        await db.readings.add(rest);
        added++;
      } else if ((r.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.readings.update(existing.id, { ...r, id: existing.id });
        updated++;
      }
    }
    for (const a of payload.alarms || []) {
      const existing = await db.alarms.filter((x) => x.time === a.time && x.label === a.label).first();
      if (!existing) {
        const { id, ...rest } = a;
        await db.alarms.add(rest);
        added++;
      } else if ((a.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.alarms.update(existing.id, { ...a, id: existing.id });
        updated++;
      }
    }
  });

  return { added, updated };
}

export { db };
