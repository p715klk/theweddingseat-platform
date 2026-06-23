/// <reference path="../pb_data/types.d.ts" />

function requireAuth(c) {
  const record = c.get("authRecord");
  if (!record) throw new UnauthorizedError("需要登入");
  return record;
}

function isPlatformAdmin(record) {
  return record.getBool("is_platform_admin") === true;
}

function normalizeMemberRole(val) {
  if (val === true || val === "admin") return "admin";
  if (val === "reception") return "reception";
  return "";
}

function countAdmins(members) {
  let n = 0;
  for (const m of members) {
    if (normalizeMemberRole(m.getString("role")) === "admin") n += 1;
  }
  return n;
}

function isTenantOwner(tenantId, uid) {
  const tenant = $app.findFirstRecordByFilter("tenants", `tenant_id = {:tid}`, { tid: tenantId });
  return tenant && tenant.getString("owner_uid") === uid;
}

function callerCanManageUsers(caller, tenantId) {
  if (isPlatformAdmin(caller)) return true;
  return isTenantOwner(tenantId, caller.id);
}

function callerCanCreateUsers(caller) {
  if (isPlatformAdmin(caller)) return true;
  const owned = $app.findRecordsByFilter("tenants", `owner_uid = {:uid}`, { uid: caller.id }, 1, 0);
  return owned.length > 0;
}

function shouldDeleteAuth(uid, excludeTenantId) {
  const members = $app.findRecordsByFilter("tenant_members", `user_id = {:uid}`, { uid }, 200, 0);
  for (const m of members) {
    if (m.getString("tenant_id") !== excludeTenantId) return false;
  }
  try {
    const user = $app.findRecordById("users", uid);
    if (user && user.getBool("is_platform_admin")) return false;
  } catch (err) {
  }
  return true;
}

routerAdd("POST", "/api/tws/create-user", (c) => {
  const caller = requireAuth(c);
  if (!callerCanCreateUsers(caller)) {
    throw new ForbiddenError("沒有權限建立用戶");
  }

  const data = $apis.requestInfo(c).data;
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!email) throw new BadRequestError("請輸入 Email");
  if (password.length < 6) throw new BadRequestError("密碼至少需要 6 個字元");

  const collection = $app.findCollectionByNameOrId("users");
  const record = new Record(collection);
  record.set("email", email);
  record.setPassword(password);
  record.set("verified", true);
  record.set("is_platform_admin", false);
  record.set("created_at", Date.now());
  record.set("created_by_uid", caller.id);
  record.set("created_by_email", caller.getString("email"));

  $app.save(record);

  return c.json(200, { uid: record.id, email: record.getString("email") });
});

routerAdd("POST", "/api/tws/remove-member", (c) => {
  const caller = requireAuth(c);
  const data = $apis.requestInfo(c).data;
  const tenantId = String(data.tenantId || "").trim();
  const targetUid = String(data.uid || "").trim();

  if (!tenantId || !targetUid) throw new BadRequestError("缺少 tenantId 或 uid");
  if (targetUid === caller.id) throw new BadRequestError("不能移除自己的帳號");
  if (!callerCanManageUsers(caller, tenantId)) {
    throw new ForbiddenError("只有 owner 或平台管理員可以移除用戶");
  }

  const tenant = $app.findFirstRecordByFilter("tenants", `tenant_id = {:tid}`, { tid: tenantId });
  if (!tenant) throw new NotFoundError("找不到專案");

  const ownerUid = tenant.getString("owner_uid");
  if (ownerUid && targetUid === ownerUid) {
    throw new BadRequestError("不能移除專案 Owner");
  }

  const member = $app.findFirstRecordByFilter(
    "tenant_members",
    `tenant_id = {:tid} && user_id = {:uid}`,
    { tid: tenantId, uid: targetUid },
  );
  if (!member) throw new NotFoundError("此用戶不在專案成員清單內");

  const role = normalizeMemberRole(member.getString("role"));
  if (!role) throw new NotFoundError("此用戶不在專案成員清單內");

  if (role === "admin") {
    const allMembers = $app.findRecordsByFilter("tenant_members", `tenant_id = {:tid}`, { tid: tenantId }, 200, 0);
    if (countAdmins(allMembers) <= 1) {
      throw new BadRequestError("至少需要保留一位後台用戶");
    }
  }

  $app.delete(member);

  let authDeleted = false;
  if (shouldDeleteAuth(targetUid, tenantId)) {
    try {
      const user = $app.findRecordById("users", targetUid);
      $app.delete(user);
      authDeleted = true;
    } catch (err) {
    }
  }

  return c.json(200, { tenantId, uid: targetUid, authDeleted });
});

routerAdd("POST", "/api/tws/set-password", (c) => {
  const caller = requireAuth(c);
  if (!isPlatformAdmin(caller)) {
    throw new ForbiddenError("只限平台管理員");
  }

  const data = $apis.requestInfo(c).data;
  const uid = String(data.uid || "").trim();
  const newPassword = String(data.newPassword || "");
  if (!uid) throw new BadRequestError("缺少 uid");
  if (newPassword.length < 6) throw new BadRequestError("密碼至少需要 6 個字元");

  const user = $app.findRecordById("users", uid);
  user.setPassword(newPassword);
  $app.save(user);

  return c.json(200, { uid });
});

onRecordBeforeDeleteRequest((e) => {
  if (e.collection.name !== "users") return;
  const uid = e.record.id;
  const members = $app.findRecordsByFilter("tenant_members", `user_id = {:uid}`, { uid }, 500, 0);
  for (const m of members) {
    $app.delete(m);
  }
}, "users");
