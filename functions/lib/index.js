import { onCall, HttpsError } from "firebase-functions/v2/https";
import { auth as authTriggers } from "firebase-functions/v1";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";
initializeApp();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function normalizeSlug(input) {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
function isValidSlug(slug) {
    return slug.length >= 2 && slug.length <= 48 && SLUG_PATTERN.test(slug);
}
function requireString(val, field) {
    const s = String(val ?? "").trim();
    if (!s)
        throw new HttpsError("invalid-argument", `缺少 ${field}`);
    return s;
}
function randomPassword(len = 12) {
    // Firebase Auth password requires at least 6 chars; keep it simple+safe.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let out = "";
    for (let i = 0; i < len; i += 1) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}
// Copy from frontend defaults (src/lib/guestUtils.js)
const DEFAULT_MAX_SEATS = 12;
const DEFAULT_LABEL_COLUMNS = {
    keys: ["group"],
    names: ["標籤 (可多選)"],
    categories: {
        group: ["家人", "男方親戚", "女方親戚", "中學同學"],
    },
};
function buildDefaultTableSettings(tableCount = 1) {
    if (!tableCount || tableCount < 1)
        return {};
    const arr = [null];
    const cols = 4;
    const gapX = 440;
    const gapY = 460;
    const startX = 1640;
    const startY = 1100;
    for (let i = 1; i <= tableCount; i += 1) {
        arr[i] = {
            max_seats: DEFAULT_MAX_SEATS,
            x: startX + ((i - 1) % cols) * gapX,
            y: startY + Math.floor((i - 1) / cols) * gapY,
        };
    }
    return arr;
}
const TABLE_DIM = 420;
const FLOOR_PLAN_PADDING = 20;
function normalizeTableSettings(raw) {
    const normalized = {};
    if (!raw)
        return normalized;
    const entries = Array.isArray(raw)
        ? raw.map((settings, idx) => [String(idx), settings])
        : Object.entries(raw);
    entries.forEach(([key, settings]) => {
        const tableNum = parseInt(key, 10);
        if (!tableNum || tableNum < 1 || !settings || typeof settings !== "object")
            return;
        if (settings.x == null || settings.y == null)
            return;
        normalized[String(tableNum)] = settings;
    });
    return normalized;
}
function buildFloorPlanFromTableSettings(settings) {
    const normalized = normalizeTableSettings(settings);
    const nums = Object.keys(normalized);
    if (!nums.length) {
        return { mode: "coords", tableSize: TABLE_DIM, items: [], bounds: null };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const items = nums.map((num) => {
        const s = normalized[num];
        const x = Number(s.x);
        const y = Number(s.y);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + TABLE_DIM);
        maxY = Math.max(maxY, y + TABLE_DIM);
        return { num: String(num), x, y };
    });
    const pad = FLOOR_PLAN_PADDING;
    return {
        mode: "coords",
        tableSize: TABLE_DIM,
        items,
        bounds: {
            minX: minX - pad,
            minY: minY - pad,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
        },
    };
}
async function isPlatformAdmin(uid) {
    const db = getDatabase();
    const snap = await db.ref(`platform_admins/${uid}`).get();
    return snap.exists() && snap.val() === true;
}
function normalizeMemberRole(val) {
    if (val === true)
        return "admin";
    if (val === "admin" || val === "reception")
        return val;
    return "";
}
async function isTenantOwner(tenantId, uid) {
    const db = getDatabase();
    const snap = await db.ref(`tenants/${tenantId}/meta/owner_uid`).get();
    return snap.exists() && snap.val() === uid;
}
async function countTenantAdmins(tenantId) {
    const db = getDatabase();
    const snap = await db.ref(`tenants/${tenantId}/members`).get();
    const members = snap.val() || {};
    return Object.values(members).filter((v) => normalizeMemberRole(v) === "admin").length;
}
async function uidHasOtherMemberships(uid, excludeTenantId) {
    const db = getDatabase();
    const slugsSnap = await db.ref("slugs").get();
    const slugs = slugsSnap.val() || {};
    for (const tenantIdRaw of Object.values(slugs)) {
        const tenantId = String(tenantIdRaw);
        if (tenantId === excludeTenantId)
            continue;
        const memberSnap = await db.ref(`tenants/${tenantId}/members/${uid}`).get();
        if (memberSnap.exists() && normalizeMemberRole(memberSnap.val()))
            return true;
    }
    return false;
}
async function uidIsOwnerOfAnyTenant(uid, excludeTenantId) {
    const db = getDatabase();
    const slugsSnap = await db.ref("slugs").get();
    const slugs = slugsSnap.val() || {};
    for (const tenantIdRaw of Object.values(slugs)) {
        const tenantId = String(tenantIdRaw);
        if (excludeTenantId && tenantId === excludeTenantId)
            continue;
        const ownerSnap = await db.ref(`tenants/${tenantId}/meta/owner_uid`).get();
        if (ownerSnap.exists() && ownerSnap.val() === uid)
            return true;
    }
    return false;
}
async function shouldDeleteAuth(uid, excludeTenantId) {
    if (await isPlatformAdmin(uid))
        return false;
    if (await uidIsOwnerOfAnyTenant(uid, excludeTenantId))
        return false;
    if (await uidHasOtherMemberships(uid, excludeTenantId))
        return false;
    return true;
}
async function collectTenantMembershipCleanup(uid) {
    const db = getDatabase();
    const updates = {};
    const slugsSnap = await db.ref("slugs").get();
    const slugs = slugsSnap.val() || {};
    for (const tenantIdRaw of Object.values(slugs)) {
        const tenantId = String(tenantIdRaw);
        const memberSnap = await db.ref(`tenants/${tenantId}/members/${uid}`).get();
        if (memberSnap.exists() && normalizeMemberRole(memberSnap.val())) {
            updates[`tenants/${tenantId}/members/${uid}`] = null;
            updates[`tenants/${tenantId}/user_profiles/${uid}`] = null;
        }
    }
    if ((await db.ref(`platform_admins/${uid}`).get()).exists()) {
        updates[`platform_admins/${uid}`] = null;
        updates[`platform_admin_profiles/${uid}`] = null;
    }
    return updates;
}
export const createTenant = onCall({ region: "asia-southeast1" }, async (req) => {
    if (!req.auth?.uid) {
        throw new HttpsError("unauthenticated", "需要登入");
    }
    if (!(await isPlatformAdmin(req.auth.uid))) {
        throw new HttpsError("permission-denied", "只限平台管理員");
    }
    const data = (req.data || {});
    const normalized = normalizeSlug(data.slug);
    if (!isValidSlug(normalized)) {
        throw new HttpsError("invalid-argument", "Slug 格式無效（小寫英文、數字、連字號）");
    }
    const coupleNames = requireString(data.coupleNames, "新人姓名");
    const venueName = requireString(data.venueName, "酒店");
    const weddingDate = requireString(data.weddingDate, "婚期");
    const ownerEmail = requireString(data.ownerEmail, "Owner Email").toLowerCase();
    const ownerDisplayName = String(data.ownerDisplayName ?? "").trim();
    const ownerPasswordRaw = String(data.ownerPassword ?? "").trim();
    const ownerPassword = ownerPasswordRaw ? ownerPasswordRaw : randomPassword(12);
    if (ownerPassword.length < 6) {
        throw new HttpsError("invalid-argument", "密碼至少需要 6 個字元");
    }
    const db = getDatabase();
    const slugRef = db.ref(`slugs/${normalized}`);
    const exists = await slugRef.get();
    if (exists.exists()) {
        throw new HttpsError("already-exists", `Slug「${normalized}」已被使用`);
    }
    // Create Auth user first; if DB write fails later, caller can delete user manually.
    // (We try to reduce the chance by using multi-path update afterwards.)
    const auth = getAuth();
    let userRecord;
    let authUserWasCreated = false;
    try {
        userRecord = await auth.createUser({
            email: ownerEmail,
            password: ownerPassword,
            displayName: ownerDisplayName || undefined,
        });
        authUserWasCreated = true;
    }
    catch (e) {
        console.error("createTenant: auth.createUser failed", {
            ownerEmail,
            code: e?.code,
            message: e?.message,
        });
        const code = String(e?.code || "");
        if (code === "auth/email-already-exists") {
            // Reuse existing Auth user (same email can join multiple projects).
            try {
                const existing = await auth.getUserByEmail(ownerEmail);
                userRecord = { uid: existing.uid };
                authUserWasCreated = false;
            }
            catch (lookupErr) {
                console.error("createTenant: getUserByEmail failed", {
                    ownerEmail,
                    code: lookupErr?.code,
                    message: lookupErr?.message,
                });
                throw new HttpsError("internal", lookupErr?.message || "找不到既有帳號");
            }
        }
        else if (code === "auth/invalid-email") {
            throw new HttpsError("invalid-argument", "Email 格式無效");
        }
        else if (code === "auth/invalid-password") {
            throw new HttpsError("invalid-argument", "密碼格式無效（至少 6 個字元）");
        }
        else {
            throw new HttpsError("internal", e?.message || "建立 Auth 帳號失敗");
        }
    }
    const now = Date.now();
    const editorEmail = req.auth.token.email ? String(req.auth.token.email) : "";
    const meta = {
        couple_names: coupleNames,
        venue_name: venueName,
        venue_hall: String(data.venueHall ?? "").trim(),
        wedding_date: weddingDate,
        theme_color: String(data.themeColor ?? "#b91c1c"),
        status: "active",
        slug: normalized,
        plan: String(data.plan ?? "standard"),
        owner_uid: userRecord.uid,
        created_at: now,
        created_by_uid: req.auth.uid,
        created_by_email: editorEmail,
        updated_at: now,
        updated_by_uid: req.auth.uid,
        updated_by_email: editorEmail,
    };
    const tenantId = normalized;
    const tenantBase = `tenants/${tenantId}`;
    // Preserve existing profile audit if it already exists (email reuse)
    const existingProfileSnap = await db.ref(`${tenantBase}/user_profiles/${userRecord.uid}`).get();
    const existingProfile = existingProfileSnap.exists() ? existingProfileSnap.val() : null;
    const profile = {
        email: ownerEmail,
        display_name: ownerDisplayName,
        created_at: existingProfile?.created_at ?? now,
        created_by_uid: existingProfile?.created_by_uid ?? req.auth.uid,
        created_by_email: existingProfile?.created_by_email ?? editorEmail,
    };
    const tableSettings = buildDefaultTableSettings(1);
    const floorLayout = buildFloorPlanFromTableSettings(tableSettings);
    const updates = {
        [`slugs/${normalized}`]: tenantId,
        [`${tenantBase}/meta`]: meta,
        [`${tenantBase}/wedding_guests`]: {},
        [`${tenantBase}/unassigned_guests`]: [],
        [`${tenantBase}/guest_status`]: {},
        [`${tenantBase}/table_settings`]: tableSettings,
        [`${tenantBase}/floor_layout`]: floorLayout,
        [`${tenantBase}/meta_label_columns`]: DEFAULT_LABEL_COLUMNS,
        [`${tenantBase}/members/${userRecord.uid}`]: "admin",
        [`${tenantBase}/user_profiles/${userRecord.uid}`]: profile,
    };
    try {
        await db.ref().update(updates);
    }
    catch (e) {
        console.error("createTenant: rtdb update failed", {
            tenantId,
            ownerEmail,
            ownerUid: userRecord.uid,
            message: e?.message,
        });
        // Best-effort rollback for the newly created Auth user
        try {
            if (authUserWasCreated) {
                await auth.deleteUser(userRecord.uid);
            }
        }
        catch {
            // ignore
        }
        throw new HttpsError("internal", e?.message || "建立 tenant 失敗");
    }
    return {
        tenantId,
        slug: normalized,
        checkInUrl: `/p/${normalized}`,
        adminUrl: `/p/${normalized}/admin`,
        ownerUid: userRecord.uid,
        ownerEmail,
        ...(authUserWasCreated && !ownerPasswordRaw ? { ownerTempPassword: ownerPassword } : {}),
    };
});
export const removeTenantMember = onCall({ region: "asia-southeast1" }, async (req) => {
    if (!req.auth?.uid) {
        throw new HttpsError("unauthenticated", "需要登入");
    }
    const tenantId = requireString(req.data?.tenantId, "tenantId");
    const targetUid = requireString(req.data?.uid, "uid");
    const callerUid = req.auth.uid;
    if (targetUid === callerUid) {
        throw new HttpsError("failed-precondition", "不能移除自己的帳號");
    }
    const db = getDatabase();
    const callerIsPlatformAdmin = await isPlatformAdmin(callerUid);
    const callerIsOwner = await isTenantOwner(tenantId, callerUid);
    if (!callerIsPlatformAdmin && !callerIsOwner) {
        throw new HttpsError("permission-denied", "只有 owner 或平台管理員可以移除用戶");
    }
    const ownerUidSnap = await db.ref(`tenants/${tenantId}/meta/owner_uid`).get();
    const ownerUid = ownerUidSnap.exists() ? String(ownerUidSnap.val()) : "";
    if (ownerUid && targetUid === ownerUid) {
        throw new HttpsError("failed-precondition", "不能移除專案 Owner");
    }
    const memberSnap = await db.ref(`tenants/${tenantId}/members/${targetUid}`).get();
    if (!memberSnap.exists()) {
        throw new HttpsError("not-found", "此用戶不在專案成員清單內");
    }
    const targetRole = normalizeMemberRole(memberSnap.val());
    if (!targetRole) {
        throw new HttpsError("not-found", "此用戶不在專案成員清單內");
    }
    if (!callerIsPlatformAdmin) {
        const profileSnap = await db.ref(`tenants/${tenantId}/user_profiles/${targetUid}`).get();
        if (!profileSnap.exists()) {
            throw new HttpsError("permission-denied", "只能移除此專案內建立的帳號；如為舊版帳號請聯絡平台管理員");
        }
    }
    if (targetRole === "admin") {
        const adminCount = await countTenantAdmins(tenantId);
        if (adminCount <= 1) {
            throw new HttpsError("failed-precondition", "至少需要保留一位後台用戶");
        }
    }
    await db.ref().update({
        [`tenants/${tenantId}/members/${targetUid}`]: null,
        [`tenants/${tenantId}/user_profiles/${targetUid}`]: null,
    });
    let authDeleted = false;
    if (await shouldDeleteAuth(targetUid, tenantId)) {
        try {
            await getAuth().deleteUser(targetUid);
            authDeleted = true;
        }
        catch (e) {
            const code = String(e?.code || "");
            if (code !== "auth/user-not-found") {
                console.error("removeTenantMember: auth.deleteUser failed", {
                    targetUid,
                    tenantId,
                    message: e?.message,
                });
                throw new HttpsError("internal", e?.message || "移除 Auth 帳號失敗");
            }
        }
    }
    return { tenantId, uid: targetUid, authDeleted };
});
export const cleanupUserDataOnAuthDelete = authTriggers.user().onDelete(async (user) => {
    const uid = user.uid;
    if (!uid)
        return;
    const updates = await collectTenantMembershipCleanup(uid);
    if (!Object.keys(updates).length)
        return;
    const db = getDatabase();
    await db.ref().update(updates);
});
export const setUserPassword = onCall({ region: "asia-southeast1" }, async (req) => {
    if (!req.auth?.uid) {
        throw new HttpsError("unauthenticated", "需要登入");
    }
    if (!(await isPlatformAdmin(req.auth.uid))) {
        throw new HttpsError("permission-denied", "只限平台管理員");
    }
    const uid = requireString(req.data?.uid, "uid");
    const newPassword = requireString(req.data?.newPassword, "newPassword");
    if (newPassword.length < 6) {
        throw new HttpsError("invalid-argument", "密碼至少需要 6 個字元");
    }
    try {
        await getAuth().updateUser(uid, { password: newPassword });
        return { uid };
    }
    catch (e) {
        throw new HttpsError("internal", e?.message || "更新密碼失敗");
    }
});
