/** 將 tenantRef(path) 包成 legacy seating.js 相容的 .on / .set API（底層 PocketBase DbRef） */
export function createCompatTenantRef(tenantRefFn) {
  function compatRef(dbRef) {
    return {
      set(val) {
        return dbRef.set(val);
      },
      update(val) {
        return dbRef.update(val);
      },
      remove() {
        return dbRef.remove();
      },
      once() {
        return dbRef.once('value').then((snap) => ({ val: () => snap.val() }));
      },
      on(event, callback, onError) {
        if (event !== 'value') throw new Error(`Unsupported event: ${event}`);
        const handler = (snapshot) => callback({ val: () => snapshot.val() });
        dbRef.on('value', handler, onError);
        return () => dbRef.off('value', handler);
      },
    };
  }

  return function ref(subPath) {
    const path = subPath == null || subPath === '' ? '' : subPath;
    return compatRef(tenantRefFn(path));
  };
}
