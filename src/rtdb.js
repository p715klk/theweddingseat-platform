/**
 * RTDB 相容層 — 底層由 PocketBase collections 支援。
 */
import { database } from '@/firebase';

export { database };

export function ref(db, path) {
  if (path === undefined || path === null || path === '') {
    return db.ref();
  }
  return db.ref(String(path));
}

export function child(parentRef, pathSegment) {
  return parentRef.child(String(pathSegment));
}

export function get(reference) {
  return reference.once('value').then((snapshot) => ({
    val: () => snapshot.val(),
    exists: () => snapshot.exists(),
  }));
}

export function set(reference, value) {
  if (value === null || value === undefined) {
    return reference.remove();
  }
  return reference.set(value);
}

export function update(reference, values) {
  return reference.update(values);
}

export function remove(reference) {
  return reference.remove();
}

export function onValue(reference, callback, onError) {
  const handler = (snapshot) => {
    callback({
      val: () => snapshot.val(),
      exists: () => snapshot.exists(),
    });
  };
  const unsub = reference.on('value', handler, onError);
  return () => {
    if (typeof unsub === 'function') unsub();
    else reference.off('value', handler);
  };
}
