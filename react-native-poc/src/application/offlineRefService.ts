import * as kvStorage from '../infrastructure/mmkvStorage';

/**
 * رقمٌ مؤقت لطلبٍ انحفظ بلا نت: «م-7».
 *
 * رقمُ الطلب يعطيه الخادم -- عشان ما يتكرر بين أجهزة الفرع -- فطلبٌ بلا نت
 * كان ينطبع «سيُحدَّد عند الاتصال»، والكاشير ما عنده شي ينادي به الزبون،
 * والزبون ما عنده شي يسأل به عن طلبه.
 *
 * فينطبع رقمٌ من الجهاز نفسه، يبدأ من 1 كل يوم. ولما يرتفع الطلب ويأخذ
 * رقمه الحقيقي، يُحفظ الربطُ بينهما (م-7 ← #1234): تنبيهٌ للكاشير لحظتها،
 * وسجلُّ الطلبات يكتب «كان م-7» جنب الرقم.
 *
 * والحرف «م» عمداً: رقمٌ بلا حرف يُخلط برقم طلبٍ حقيقي.
 * (نظيره في الويب: rkNextOfflineRef في rakeen-pos.js.)
 */

const SEQ_KEY = 'rakeen_offline_ref_seq';
const MAP_KEY = 'rakeen_offline_ref_map';
const MAP_LIMIT = 300;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function nextOfflineRef(): Promise<string> {
  let n = 1;
  try {
    const raw = await kvStorage.getItem(SEQ_KEY);
    const seq = raw ? (JSON.parse(raw) as { day: string; n: number }) : null;
    if (seq && seq.day === today()) n = seq.n + 1;
  } catch {
    n = 1;
  }
  try {
    await kvStorage.setItem(SEQ_KEY, JSON.stringify({ day: today(), n }));
  } catch {
    // ما انحفظ العدّاد: أسوأ ما يصير رقمٌ مؤقت يتكرر، والطلب نفسه سليم.
  }
  return `م-${n}`;
}

type RefMap = Record<string, string>;

async function readMap(): Promise<RefMap> {
  try {
    const raw = await kvStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as RefMap) : {};
  } catch {
    return {};
  }
}

const listeners = new Set<(orderId: number, ref: string) => void>();

/** يُنادى لما يرتفع طلبٌ كان بلا نت ويأخذ رقمه الحقيقي. */
export async function rememberOfflineRef(orderId: number, ref: string): Promise<void> {
  const map = await readMap();
  if (map[String(orderId)] === ref) return;
  map[String(orderId)] = ref;
  const ids = Object.keys(map);
  if (ids.length > MAP_LIMIT) {
    ids.sort((a, b) => Number(a) - Number(b)).slice(0, ids.length - MAP_LIMIT).forEach(id => delete map[id]);
  }
  try {
    await kvStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // التنبيه يطلع ولو ما انحفظ.
  }
  listeners.forEach(fn => fn(orderId, ref));
}

/** رقمُ الطلب الحقيقي ← رقمه المؤقت، للطلبات اللي انحفظت بلا نت على هذا الجهاز. */
export async function getOfflineRefMap(): Promise<RefMap> {
  return readMap();
}

export function onOfflineRefResolved(fn: (orderId: number, ref: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
