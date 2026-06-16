import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(input: unknown) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(slug: string) {
  return slug.length >= 2 && slug.length <= 48 && SLUG_PATTERN.test(slug);
}

function requireString(val: unknown, field: string) {
  const s = String(val ?? "").trim();
  if (!s) throw new HttpsError("invalid-argument", `缺少 ${field}`);
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
  if (!tableCount || tableCount < 1) return {};
  const arr: any[] = [null];
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

function normalizeTableSettings(raw: any) {
  const normalized: Record<string, any> = {};
  if (!raw) return normalized;
  const entries: [string, any][] = Array.isArray(raw)
    ? raw.map((settings, idx) => [String(idx), settings])
    : Object.entries(raw);
  entries.forEach(([key, settings]) => {
    const tableNum = parseInt(key, 10);
    if (!tableNum || tableNum < 1 || !settings || typeof settings !== "object") return;
    if (settings.x == null || settings.y == null) return;
    normalized[String(tableNum)] = settings;
  });
  return normalized;
}

function buildFloorPlanFromTableSettings(settings: any) {
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

async function isPlatformAdmin(uid: string) {
  const db = getDatabase();
  const snap = await db.ref(`platform_admins/${uid}`).get();
  return snap.exists() && snap.val() === true;
}

type CreateTenantInput = {
  slug: string;
  coupleNames: string;
  venueName: string;
  venueHall?: string;
  weddingDate: string;
  themeColor?: string;
  plan?: string;
  ownerEmail: string;
  ownerPassword?: string;
  ownerDisplayName?: string;
};

export const createTenant = onCall(
  { region: "asia-southeast1" },
  async (req): Promise<{
    tenantId: string;
    slug: string;
    checkInUrl: string;
    adminUrl: string;
    ownerUid: string;
    ownerEmail: string;
    ownerTempPassword?: string;
  }> => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "需要登入");
    }
    if (!(await isPlatformAdmin(req.auth.uid))) {
      throw new HttpsError("permission-denied", "只限平台管理員");
    }

    const data = (req.data || {}) as Partial<CreateTenantInput>;
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
    const userRecord = await auth.createUser({
      email: ownerEmail,
      password: ownerPassword,
      displayName: ownerDisplayName || undefined,
    });

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

    const profile = {
      email: ownerEmail,
      display_name: ownerDisplayName,
      created_at: now,
      created_by_uid: req.auth.uid,
      created_by_email: editorEmail,
    };

    const tenantId = normalized;
    const tenantBase = `tenants/${tenantId}`;
    const tableSettings = buildDefaultTableSettings(1);
    const floorLayout = buildFloorPlanFromTableSettings(tableSettings);

    const updates: Record<string, any> = {
      [`slugs/${normalized}`]: tenantId,
      [`${tenantBase}/meta`]: meta,
      [`${tenantBase}/wedding_guests`]: {},
      [`${tenantBase}/unassigned_guests`]: [],
      [`${tenantBase}/guest_status`]: {},
      [`${tenantBase}/table_settings`]: tableSettings,
      [`${tenantBase}/floor_layout`]: floorLayout,
      [`${tenantBase}/meta_label_columns`]: DEFAULT_LABEL_COLUMNS,
      [`${tenantBase}/members/${userRecord.uid}`]: true,
      [`${tenantBase}/user_profiles/${userRecord.uid}`]: profile,
    };

    try {
      await db.ref().update(updates);
    } catch (e: any) {
      // Best-effort rollback for the newly created Auth user
      try {
        await auth.deleteUser(userRecord.uid);
      } catch {
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
      ...(ownerPasswordRaw ? {} : { ownerTempPassword: ownerPassword }),
    };
  },
);

export const setUserPassword = onCall(
  { region: "asia-southeast1" },
  async (req): Promise<{ uid: string }> => {
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
    } catch (e: any) {
      throw new HttpsError("internal", e?.message || "更新密碼失敗");
    }
  },
);

