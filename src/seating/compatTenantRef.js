import { get, onValue, remove, set, update } from 'firebase/database';

/** 將 Vue composable 的 tenantRef 包成 legacy seating.js 相容的 .on / .set API */
export function createCompatTenantRef(tenantRefFn) {
  function compatRef(dbRef) {
    return {
      set(val) {
        if (val === null) return remove(dbRef);
        return set(dbRef, val);
      },
      update(val) {
        return update(dbRef, val);
      },
      remove() {
        return remove(dbRef);
      },
      once() {
        return get(dbRef).then((snap) => ({ val: () => snap.val() }));
      },
      on(event, callback, onError) {
        if (event !== 'value') throw new Error(`Unsupported event: ${event}`);
        return onValue(dbRef, (snap) => callback({ val: () => snap.val() }), onError);
      },
    };
  }

  return function ref(subPath) {
    const path = subPath == null || subPath === '' ? '' : subPath;
    return compatRef(tenantRefFn(path));
  };
}
