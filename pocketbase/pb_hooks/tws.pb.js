/// <reference path="../types.d.ts" />
/**
 * PocketBase record hooks（onRecord* 要 inline helper，見下方）
 * HTTP routes 喺 tws_routes.pb.js（由 scripts/build-tws-hooks.mjs 生成）
 */

/** Admin 刪 user 時跳過；一般用戶刪除時先清 tenant_members */
onRecordBeforeDeleteRequest(function(e) {
  if (e.collection.name !== "users") return;
  try {
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return;
  } catch (err0) {
  }
  var uid = e.record.id;
  var findRows = function(col, filter, params, limit) {
    var lim = limit || 500;
    var bind = params || {};
    try {
      if (typeof $app.findRecordsByFilter === "function") {
        return $app.findRecordsByFilter(col, filter, "", lim, 0, bind) || [];
      }
    } catch (err) {
    }
    try {
      var dao = $app.dao();
      if (dao && typeof dao.findRecordsByFilter === "function") {
        return dao.findRecordsByFilter(col, filter, bind, lim, 0) || [];
      }
    } catch (err2) {
    }
    return [];
  };
  try {
    var members = findRows("tenant_members", "user_id = {:uid}", { uid: uid }, 500);
    for (var i = 0; i < members.length; i += 1) {
      try {
        $app.delete(members[i]);
      } catch (err3) {
        console.error("tws: member cascade skipped:", err3);
      }
    }
  } catch (err) {
    console.error("tws: users beforeDelete skipped:", err);
  }
}, "users");

onRecordBeforeDeleteRequest(function(e) {
  if (e.collection.name !== "tenants") return;
  var readStr = function(rec, field) {
    try {
      return rec.getString(field) || "";
    } catch (err) {
      try {
        return String(rec.get(field) || "");
      } catch (err2) {
        return "";
      }
    }
  };
  var tenantId = readStr(e.record, "tenant_id") || readStr(e.record, "slug");
  if (!tenantId) return;
  var findRows = function(col, filter, params, limit) {
    var lim = limit || 500;
    var bind = params || {};
    try {
      if (typeof $app.findRecordsByFilter === "function") {
        return $app.findRecordsByFilter(col, filter, "", lim, 0, bind) || [];
      }
    } catch (err) {
    }
    try {
      var dao = $app.dao();
      if (dao && typeof dao.findRecordsByFilter === "function") {
        return dao.findRecordsByFilter(col, filter, bind, lim, 0) || [];
      }
    } catch (err2) {
    }
    return [];
  };
  var tenantRecordId = e.record.id;
  var ownerUid = readStr(e.record, "owner_uid");
  var cleanupUids = {};
  if (ownerUid) cleanupUids[ownerUid] = true;

  try {
    var members = findRows("tenant_members", "tenant_id = {:tid}", { tid: tenantId }, 500);
    for (var i = 0; i < members.length; i += 1) {
      var memberUid = readStr(members[i], "user_id");
      if (memberUid) cleanupUids[memberUid] = true;
      try {
        $app.delete(members[i]);
      } catch (err) {
        console.error("tws: tenant member cleanup skipped:", err);
      }
    }
  } catch (err) {
    console.error("tws: tenant member lookup skipped:", err);
  }

  try {
    var dataRows = findRows("tenant_data", "tenant_id = {:tid}", { tid: tenantId }, 10);
    for (var j = 0; j < dataRows.length; j += 1) {
      try {
        $app.delete(dataRows[j]);
      } catch (err) {
        console.error("tws: tenant_data cleanup skipped:", err);
      }
    }
  } catch (err) {
    console.error("tws: tenant_data lookup skipped:", err);
  }

  for (var key in cleanupUids) {
    var cleanupUid = key;
    try {
      var remainMembers = findRows("tenant_members", "user_id = {:uid}", { uid: cleanupUid }, 1);
      if (remainMembers.length > 0) continue;
      var ownedTenants = findRows("tenants", "owner_uid = {:uid}", { uid: cleanupUid }, 200);
      var hasOtherTenant = false;
      for (var k = 0; k < ownedTenants.length; k += 1) {
        if (ownedTenants[k].id !== tenantRecordId) {
          hasOtherTenant = true;
          break;
        }
      }
      if (hasOtherTenant) continue;
      var orphan = $app.findRecordById("users", cleanupUid);
      var isAdmin = false;
      try {
        isAdmin = orphan.getBool("is_platform_admin") === true;
      } catch (errA) {
        try {
          isAdmin = orphan.get("is_platform_admin") === true;
        } catch (errB) {
          isAdmin = false;
        }
      }
      if (isAdmin) continue;
      $app.delete(orphan);
    } catch (err) {
      console.error("tws: orphan user cleanup skipped:", cleanupUid, err);
    }
  }
}, "tenants");

/** Super Admin 建帳後自動 verified（兼容 PB <0.23 同 >=0.23） */
(function registerAutoVerifyUsers() {
  var fn = function(e) {
    if (e.collection && e.collection.name !== "users") return;
    var rec = e.record || e.model;
    if (!rec) return;
    try {
      if (typeof rec.setVerified === "function") rec.setVerified(true);
      else rec.set("verified", true);
    } catch (err) {
      console.error("tws: auto-verify skipped:", err);
    }
  };
  if (typeof onRecordBeforeCreateRequest === "function") {
    onRecordBeforeCreateRequest(fn, "users");
    return;
  }
  if (typeof onRecordCreate === "function") {
    onRecordCreate(fn, "users");
    return;
  }
  if (typeof onRecordAfterCreateRequest === "function") {
    onRecordAfterCreateRequest(fn, "users");
  }
})();
