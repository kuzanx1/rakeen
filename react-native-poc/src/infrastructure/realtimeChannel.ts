import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * One realtime channel per topic, shared by however many parts of the app
 * want it.
 *
 * supabase-js keys channels by topic: `supabase.channel(topic)` returns the
 * EXISTING channel when one with that topic is already registered, rather
 * than making a second one. So the obvious-looking pattern
 *
 *     const channel = supabase.channel(topic).on('postgres_changes', ...).subscribe();
 *     return () => supabase.removeChannel(channel);
 *
 * is only safe while exactly one caller uses that topic. The moment a
 * second one subscribes, `.channel()` hands back the already-subscribed
 * channel and `.on()` throws:
 *
 *     cannot add `postgres_changes` callbacks for
 *     realtime:pos-business-settings:83 after `subscribe()`
 *
 * which, thrown from inside a useEffect, takes down the whole tree. That
 * is exactly what happened: App.tsx watches business settings for the
 * notification-bell flag and ProductsScreen watches the same settings for
 * its own re-read, both on `pos-business-settings:<id>`.
 *
 * The unsubscribe half was just as wrong -- whichever screen unmounted
 * first called removeChannel() on the channel the other one was still
 * listening to, silently killing its updates.
 *
 * So callers no longer own channels. They register a listener; the first
 * one opens the channel, the last one to leave closes it. Adding a third
 * subscriber to any topic is now a non-event.
 */

export interface PostgresChangeFilter {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  filter?: string;
}

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;
type Listener = (payload: Payload) => void;
/** يُنادى عند كل اشتراكٍ ناجح بعد الأول (رجع الاتصال): ما فات وقت الانقطاع يُجلب. */
type ResubscribeListener = () => void;

interface SharedEntry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  resubscribers: Set<ResubscribeListener>;
}

const shared = new Map<string, SharedEntry>();

/**
 * والقناة الفعلية باسمٍ فريد لكل فتحة، لا باسم الموضوع نفسه.
 *
 * removeChannel غير متزامنة: تنتظر ردّ الخادم قبل ما تشيل القناة من
 * القائمة. فشاشةٌ تنفكّ ثم تنركّب فوراً (تنقّل بين «جارية» و«مكتملة»)
 * كانت تطلب supabase.channel(نفس الاسم) فترجع لها القديمة وهي تُغلق --
 * و.on('postgres_changes') عليها يرمي، فينقفل التطبيق في نسخة الإنتاج.
 * اسم postgres_changes لا يعني للخادم شيئاً (الفلتر هو المهم)، فالتفريد آمن.
 */
let openSeq = 0;

export function subscribeToPostgresChanges(
  topic: string,
  filter: PostgresChangeFilter,
  listener: Listener,
  onResubscribe?: ResubscribeListener,
): () => void {
  let entry = shared.get(topic);

  if (!entry) {
    const listeners = new Set<Listener>();
    const resubscribers = new Set<ResubscribeListener>();
    let joinedOnce = false;
    const channel = supabase
      .channel(`${topic}#${++openSeq}`)
      // Cast: the overload wants each field as a literal, and this filter
      // arrives as a value. The shape is the same one every call site
      // passed inline before.
      .on('postgres_changes', filter as never, (payload: Payload) => {
        // Copied before iterating: a listener is free to unsubscribe from
        // inside its own callback, and mutating the Set mid-iteration
        // would skip whoever came after it.
        for (const l of Array.from(listeners)) {
          try {
            l(payload);
          } catch {
            // One screen's handler must never stop the others from being
            // told, and must never surface as a realtime failure.
          }
        }
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        if (!joinedOnce) { joinedOnce = true; return; }
        for (const r of Array.from(resubscribers)) {
          try { r(); } catch { /* مثل أعلاه */ }
        }
      });
    entry = { channel, listeners, resubscribers };
    shared.set(topic, entry);
  }

  entry.listeners.add(listener);
  if (onResubscribe) entry.resubscribers.add(onResubscribe);

  let released = false;
  return () => {
    // Guarded: React can run a cleanup more than once, and a second run
    // must not tear down a channel that a later subscriber now owns.
    if (released) return;
    released = true;
    const current = shared.get(topic);
    if (!current) return;
    current.listeners.delete(listener);
    if (onResubscribe) current.resubscribers.delete(onResubscribe);
    if (current.listeners.size === 0) {
      shared.delete(topic);
      supabase.removeChannel(current.channel);
    }
  };
}
