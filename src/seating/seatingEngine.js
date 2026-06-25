import { createCompatTenantRef } from './compatTenantRef.js';
import { tenantDataDbRef } from '@/lib/pb/dataRef';
import { saveGuestSeatingState, updateTenantData } from '@/lib/pb/tenantData';
import { serializeGroupForFirebase } from '@/lib/adminGuestModel';

let tenantRefFn = null;
let activeTenantId = '';
function tenantRef(subPath) {
    if (!tenantRefFn) throw new Error('Seating engine not initialized');
    return tenantRefFn(subPath == null || subPath === '' ? '' : subPath);
}
let tenantSlug = '';
const cleanupFns = [];
let dataUnsubs = [];
let engineInitialized = false;
let rawTenantRef = null;
let cachedMetaLabelColumns = null;
/** Vue 組件注入 UI 更新（取代 legacy globalThis / innerHTML onclick） */
let uiHooks = {
    onFindTableItemsChange: null,
    onTableLockChange: null,
    onGuestModalChange: null,
    onCategoryPoolChange: null,
    onTableSettingsModalChange: null,
    onGlobalStatsChange: null,
    onPrintPreviewChange: null,
    onCanvasTransformChange: null,
    onCanvasTableFlashChange: null,
    onLockButtonFlash: null,
    onSidebarChange: null,
    onPoolChange: null,
    onCanvasTablesChange: null,
    onCanvasTablePositionChange: null,
    onCanvasTableDragChange: null,
};

function trackCleanup(fn) {
    cleanupFns.push(fn);
}

function onEvent(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    trackCleanup(() => target.removeEventListener(type, handler, options));
}

let allGuests = {};
let unassignedPool = [];
let tableSettings = {};
let activeSettingTableNum = null;

function generateGuestId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_) { /* ignore */ }
    return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureGuestHasId(guest) {
    if (!guest || typeof guest !== 'object') return guest;
    if (guest.id && String(guest.id).trim()) return guest;
    guest.id = generateGuestId();
    return guest;
}

function normalizeTableSettings(raw) {
    const normalized = {};
    if (!raw) return normalized;

    const entries = Array.isArray(raw)
        ? raw.map((settings, idx) => [String(idx), settings])
        : Object.entries(raw);

    entries.forEach(([key, settings]) => {
        const tableNum = parseInt(key, 10);
        if (!tableNum || tableNum < 1 || !settings || typeof settings !== 'object') return;
        if (settings.x == null || settings.y == null) return;
        normalized[String(tableNum)] = settings;
    });

    return normalized;
}

function getTableSettingKeys() {
    return Object.keys(tableSettings)
        .filter(num => {
            const settings = tableSettings[num];
            return settings && settings.x != null && settings.y != null;
        })
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

let tableSettingsMigrated = false;

function loadTableSettings(raw) {
    const normalized = normalizeTableSettings(raw);
    if (Array.isArray(raw) && Object.keys(normalized).length && !tableSettingsMigrated) {
        tableSettingsMigrated = true;
        tenantRef('table_settings').set(normalized).catch(err => {
            console.warn('table_settings 轉換 object 失敗:', err);
            tableSettingsMigrated = false;
        });
    }
    return normalized;
}

function persistTableSettings() {
    return tenantRef('table_settings').set(tableSettings);
}

let selectedGuestContext = null;

const PRIMARY_TAG_KEY = 'group';
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};
let legacyLabelKeys = null;

function normalizeGuestTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes(';')) return s.split(';').map(t => t.trim()).filter(t => t && t !== '未分類');
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
}

function getGuestTags(guest) {
    const keys = legacyLabelKeys || [PRIMARY_TAG_KEY];
    const tags = new Set();
    keys.forEach(k => normalizeGuestTags(guest[k]).forEach(t => tags.add(t)));
    return [...tags];
}

function getPrimaryGroup(guest) {
    const tags = normalizeGuestTags(guest.group);
    return tags[0] || '未分類';
}

function applyMetaLabelColumns(meta) {
    if (meta && meta.keys && meta.names) {
        const mergedPool = new Set(categoriesByColumn[PRIMARY_TAG_KEY] || []);
        meta.keys.forEach(k => {
            (meta.categories?.[k] || []).forEach(c => mergedPool.add(c));
        });
        categoriesByColumn = { [PRIMARY_TAG_KEY]: [...mergedPool] };
        legacyLabelKeys = meta.keys.length > 1 ? meta.keys : null;
    } else if (meta && meta.categories) {
        categoriesByColumn = meta.categories;
        legacyLabelKeys = null;
    }
    notifyCategoryPoolChange();
}

function notifyCategoryPoolChange() {
    uiHooks.onCategoryPoolChange?.([...(categoriesByColumn[PRIMARY_TAG_KEY] || [])]);
}

function tagChipSideClasses(side) {
    if (side === '女方') {
        return {
            chip: 'bg-rose-100 text-rose-800',
            btn: 'text-rose-500 hover:text-rose-700',
            select: 'border-rose-200 bg-rose-50/20',
            pool: 'bg-rose-50 text-rose-700 border-rose-200'
        };
    }
    return {
        chip: 'bg-blue-100 text-blue-800',
        btn: 'text-blue-500 hover:text-blue-700',
        select: 'border-blue-200 bg-blue-50/20',
        pool: 'bg-blue-50 text-blue-700 border-blue-200'
    };
}

function forEachAssignedGuest(callback) {
    if (!allGuests) return;
    const processTable = table => {
        if (Array.isArray(table)) table.forEach(callback);
    };
    if (Array.isArray(allGuests)) {
        allGuests.forEach(processTable);
    } else if (typeof allGuests === 'object') {
        Object.values(allGuests).forEach(processTable);
    }
}

function collectAllGuestsInSeating() {
    const guests = [];
    forEachAssignedGuest(g => { if (g && g.name) guests.push(g); });
    normalizeUnassignedPool(unassignedPool).forEach(g => { if (g && g.name) guests.push(g); });
    return guests;
}

function getGuestsUsingTagInSeating(tag) {
    return collectAllGuestsInSeating().filter(g => getGuestTags(g).includes(tag));
}

function persistMetaLabelColumns() {
    const labelColumns = {
        keys: [PRIMARY_TAG_KEY],
        names: ['標籤 (可多選)'],
        categories: categoriesByColumn,
    };
    cachedMetaLabelColumns = labelColumns;
    if (!activeTenantId) return Promise.reject(new Error('專案未就緒'));
    return updateTenantData(activeTenantId, { meta_label_columns: labelColumns });
}

const IS_TOUCH_DEVICE = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function getSidebarPanelWidth() {
    return isMobileViewport() ? Math.min(window.innerWidth * 0.88, 300) : 320;
}

function getSidebarWidth() {
    return isSidebarOpen ? getSidebarPanelWidth() : 0;
}

function getSidebarDragOpenThreshold() {
    if (isMobileViewport()) {
        return window.innerWidth * 0.20;
    }
    return getSidebarPanelWidth() + 16;
}

function bindGuestTap(element, onTap) {
    const threshold = 14;
    let startX = 0, startY = 0, moved = false;

    if (IS_TOUCH_DEVICE) {
        element.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            moved = false;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            if (Math.hypot(e.touches[0].clientX - startX, e.touches[0].clientY - startY) > threshold) {
                moved = true;
            }
        }, { passive: true });

        element.addEventListener('touchend', (e) => {
            if (moved || isGuestDragging) return;
            e.preventDefault();
            e.stopPropagation();
            onTap(e);
        }, { passive: false });
        return;
    }

    element.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
    });
    element.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > threshold) moved = true;
    });
    element.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (moved) return;
        e.stopPropagation();
        onTap(e);
    });
}

// ==========================================
// 📌 畫布初始化與平移縮放 (已修復空白處拉唔郁問題)
// ==========================================
const CANVAS_W = 5000;
const CANVAS_H = 4000;
const PLATE_SIZE = 420;
const PLATE_CENTER = PLATE_SIZE / 2;
const TABLE_DIM = PLATE_SIZE;
const TABLE_TOTAL_H = PLATE_SIZE;
const GRID_SIZE = 20;

let zoom = 1.0;
let panX = -900;
let panY = -600;
// 手勢狀態已搬去 Vue composable（`useSeatingViewportGestures`）

let viewport = null;
let canvas = null;

export function getCanvasTransform() {
    return { panX, panY, zoom, zoomPercent: Math.round(zoom * 100) };
}

export function setCanvasTransform(next) {
    if (!next) return;
    if (next.panX != null) panX = Number(next.panX);
    if (next.panY != null) panY = Number(next.panY);
    if (next.zoom != null) zoom = Number(next.zoom);
    if (!Number.isFinite(panX)) panX = -900;
    if (!Number.isFinite(panY)) panY = -600;
    if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1;
    applyTransform();
}

export function zoomAtViewportClientPoint(nextZoom, clientX, clientY) {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomAtPoint(
        nextZoom,
        clientX - rect.left,
        clientY - rect.top
    );
}

export function canStartCanvasPanFromTarget(target) {
    return canStartCanvasPan(target);
}

// （已移除）getTouchDistance / getTouchCenter

function zoomAtPoint(nextZoom, pointX, pointY) {
    const canvasX = (pointX - panX) / zoom;
    const canvasY = (pointY - panY) / zoom;
    zoom = nextZoom;
    panX = pointX - canvasX * zoom;
    panY = pointY - canvasY * zoom;
    applyTransform();
}

function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function screenToCanvas(screenX, screenY) {
    const rect = viewport.getBoundingClientRect();
    return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom
    };
}

function notifyCanvasTransformChange() {
    uiHooks.onCanvasTransformChange?.({
        panX,
        panY,
        zoom,
        zoomPercent: Math.round(zoom * 100),
    });
}

function applyTransform() {
    guestNameFontRatioCache.clear();
    notifyCanvasTransformChange();
}

function canStartCanvasPan(target) {
    return !target.closest(
        '.seat-slot, .guest-seat-circle, .pool-guest-chip, .hub-center, .hub-title, button, input, select, a, .sidebar-content, .sidebar-panel, .sidebar-toggle-btn, .guest-drag-ghost'
    );
}

// （已移除）resetTouchGestures

// （已移除）bindViewportEvents：改由 Vue composable 綁定
function getVisibleViewportCenter() {
    const rect = viewport.getBoundingClientRect();
    const sidebarWidth = isSidebarOpen ? getSidebarWidth() : 0;
    const vpW = Math.max(0, rect.width - sidebarWidth);
    return {
        x: sidebarWidth + vpW / 2,
        y: rect.height / 2
    };
}

function zoomCanvas(factor) {
    const center = getVisibleViewportCenter();
    zoomAtPoint(
        Math.min(2.5, Math.max(0.35, zoom * factor)),
        center.x,
        center.y
    );
}

const FLOOR_PLAN_PADDING = 20;

function buildSignInFloorLayout(settings) {
    const normalized = normalizeTableSettings(settings);
    const nums = Object.keys(normalized);
    if (!nums.length) {
        return { mode: 'coords', tableSize: TABLE_DIM, items: [], bounds: null };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const items = nums.map(num => {
        const s = normalized[num];
        const x = Number(s.x);
        const y = Number(s.y);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + TABLE_DIM);
        maxY = Math.max(maxY, y + TABLE_TOTAL_H);
        return { num: String(num), x, y };
    });

    const pad = FLOOR_PLAN_PADDING;
    return {
        mode: 'coords',
        tableSize: TABLE_DIM,
        items,
        bounds: {
            minX: minX - pad,
            minY: minY - pad,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2
        }
    };
}

let lastPersistedFloorLayoutJson = null;

function normalizeFloorLayout(layout) {
    if (!layout) return null;
    if (layout.mode === 'coords' && Array.isArray(layout.items)) {
        return {
            mode: 'coords',
            tableSize: Number(layout.tableSize) || TABLE_DIM,
            items: layout.items.map(item => ({
                num: String(item.num),
                x: Number(item.x),
                y: Number(item.y)
            })),
            bounds: layout.bounds ? {
                minX: Number(layout.bounds.minX),
                minY: Number(layout.bounds.minY),
                width: Number(layout.bounds.width),
                height: Number(layout.bounds.height)
            } : null
        };
    }
    if (layout.cols != null && Array.isArray(layout.rows)) {
        return {
            cols: Number(layout.cols) || layout.rows[0]?.length || 4,
            rows: layout.rows.map(row => (Array.isArray(row) ? row : Object.values(row)).map(cell => String(cell)))
        };
    }
    const rows = Array.isArray(layout) ? layout : Object.keys(layout)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => layout[k]);
    const normalizedRows = rows.map(row => {
        if (Array.isArray(row)) return row.map(cell => String(cell));
        if (row && typeof row === 'object') {
            return Object.keys(row)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => String(row[k]));
        }
        return [String(row)];
    });
    return { cols: normalizedRows[0]?.length || 4, rows: normalizedRows };
}

function syncFloorLayoutIfNeeded(existingLayout) {
    const computed = buildSignInFloorLayout(tableSettings);
    if (!computed) return Promise.resolve();

    const normalizedExisting = normalizeFloorLayout(existingLayout);
    const computedJson = JSON.stringify(computed);
    const existingJson = JSON.stringify(normalizedExisting);
    if (computedJson === existingJson) {
        lastPersistedFloorLayoutJson = computedJson;
        return Promise.resolve();
    }
    if (computedJson === lastPersistedFloorLayoutJson) return Promise.resolve();

    return tenantRef('floor_layout').set(computed).then(() => {
        lastPersistedFloorLayoutJson = computedJson;
    }).catch(err => {
        console.warn('floor_layout 同步失敗（簽到頁排位可能未更新）:', err);
    });
}

function scheduleFloorLayoutSync(existingLayout = null) {
    syncFloorLayoutIfNeeded(existingLayout);
}

function forceFloorLayoutSync() {
    const layout = buildSignInFloorLayout(tableSettings);
    lastPersistedFloorLayoutJson = JSON.stringify(layout);
    return tenantRef('floor_layout').set(layout);
}

/** 枱位已寫入後同步 floor_layout；失敗唔應 undo 枱位拖動 */
function syncFloorLayoutBestEffort() {
    return forceFloorLayoutSync().catch((err) => {
        console.warn('floor_layout 同步失敗（簽到頁排位可能未更新）:', err);
    });
}

function getTableVisualBleed(maxSeats) {
    const { radius, guestSize } = getSeatLayout(maxSeats);
    return Math.max(0, radius + guestSize / 2 - PLATE_CENTER);
}

function getTablesBoundingBox() {
    const nums = getTableSettingKeys();
    if (nums.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nums.forEach(num => {
        const s = tableSettings[num];
        const x = Number(s.x);
        const y = Number(s.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const bleed = getTableVisualBleed(s.max_seats || 12);
        minX = Math.min(minX, x - bleed);
        minY = Math.min(minY, y - bleed);
        maxX = Math.max(maxX, x + TABLE_DIM + bleed);
        maxY = Math.max(maxY, y + TABLE_TOTAL_H + bleed);
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function panViewToCanvasPoint(canvasX, canvasY) {
    const target = getVisibleViewportCenter();
    panX = target.x - canvasX * zoom;
    panY = target.y - canvasY * zoom;
    applyTransform();
}

function centerViewOnTables() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return;
    panViewToCanvasPoint(bounds.centerX, bounds.centerY);
}

function getTableCanvasCenter(tableNum) {
    const s = tableSettings[String(tableNum)];
    if (!s || s.x == null || s.y == null) return null;
    const x = Number(s.x);
    const y = Number(s.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x + TABLE_DIM / 2, y: y + TABLE_TOTAL_H / 2 };
}

function flyToTable(tableNum) {
    const center = getTableCanvasCenter(tableNum);
    if (!center) return;
    panViewToCanvasPoint(center.x, center.y);
    uiHooks.onCanvasTableFlashChange?.({ tableNum: String(tableNum) });
}

function getFindTableMenuItems() {
    return getTableSettingKeys().map((num) => ({
        num: String(num),
        label: (tableSettings[num]?.label || '').trim(),
    }));
}

function refreshFindTableMenu() {
    uiHooks.onFindTableItemsChange?.(getFindTableMenuItems());
}

function snapAllTablesToGrid() {
    const updates = {};
    let changed = false;
    getTableSettingKeys().forEach(num => {
        const nx = snapToGrid(tableSettings[num].x);
        const ny = snapToGrid(tableSettings[num].y);
        if (nx !== tableSettings[num].x || ny !== tableSettings[num].y) {
            tableSettings[num].x = nx;
            tableSettings[num].y = ny;
            updates[`table_settings/${num}/x`] = nx;
            updates[`table_settings/${num}/y`] = ny;
            changed = true;
        }
    });
    if (!changed) return Promise.resolve(false);
    return tenantRef().update(updates).then(() => true);
}

function centerAllTablesOnCanvas() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return Promise.resolve(false);

    const dx = CANVAS_W / 2 - bounds.centerX;
    const dy = CANVAS_H / 2 - bounds.centerY;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return Promise.resolve(false);

    const updates = {};
    getTableSettingKeys().forEach(num => {
        tableSettings[num].x = snapToGrid(Math.round(tableSettings[num].x + dx));
        tableSettings[num].y = snapToGrid(Math.round(tableSettings[num].y + dy));
        updates[`table_settings/${num}/x`] = tableSettings[num].x;
        updates[`table_settings/${num}/y`] = tableSettings[num].y;
    });
    return tenantRef().update(updates).then(() => true);
}

function fitViewToTables() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return;

    const groupW = bounds.maxX - bounds.minX;
    const groupH = bounds.maxY - bounds.minY;
    const vpRect = viewport.getBoundingClientRect();
    const sidebarWidth = isSidebarOpen ? getSidebarWidth() : 0;
    const vpW = Math.max(0, vpRect.width - sidebarWidth);
    const vpH = vpRect.height;
    const mobile = isMobileViewport();
    const padding = mobile ? 24 : 100;

    const zoomX = vpW / (groupW + padding * 2);
    const zoomY = vpH / (groupH + padding * 2);
    const maxZoom = mobile ? 0.75 : 1.2;
    const minZoom = mobile ? 0.12 : 0.35;
    zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(zoomX, zoomY)));

    panViewToCanvasPoint(bounds.centerX, bounds.centerY);
}

function getOccupancyColor(filled, maxSeats) {
    const ratio = filled / maxSeats;
    if (ratio > 1) return '#f87171';
    if (ratio >= 1) return '#fb923c';
    if (ratio >= 0.7) return '#fbbf24';
    return '#4ade80';
}

function buildHubRingSVG(filled, maxSeats) {
    const r = 114;
    const stroke = 8;
    const circumference = 2 * Math.PI * r;
    const ratio = Math.min(filled / maxSeats, 1);
    const dash = circumference * ratio;
    const color = getOccupancyColor(filled, maxSeats);
    const size = 250;
    const cx = size / 2;
    return `<svg class="hub-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="width:calc(${size}px * var(--zoom));height:calc(${size}px * var(--zoom))">
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="${stroke}"/>
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
            stroke-dasharray="${dash} ${circumference}" stroke-linecap="round"
            transform="rotate(-90 ${cx} ${cx})"/>
    </svg>`;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function splitCJKNameEvenly(text) {
    const len = text.length;
    if (len <= 5) return escapeHtml(text);
    if (len === 6) return `${escapeHtml(text.slice(0, 3))}<br>${escapeHtml(text.slice(3))}`;
    if (len === 8) return `${escapeHtml(text.slice(0, 4))}<br>${escapeHtml(text.slice(4))}`;
    if (len === 10) return `${escapeHtml(text.slice(0, 5))}<br>${escapeHtml(text.slice(5))}`;
    if (len % 2 === 0) {
        const half = len / 2;
        return `${escapeHtml(text.slice(0, half))}<br>${escapeHtml(text.slice(half))}`;
    }
    const half = Math.ceil(len / 2);
    return `${escapeHtml(text.slice(0, half))}<br>${escapeHtml(text.slice(half))}`;
}

function isLatinGuestName(name) {
    const core = (name || '').trim().replace(/\s*(\*\d+)?\s*(眷屬\s*[\d０-９]+)?\s*$/u, '');
    return /^[A-Za-z][A-Za-z\s'.-]*$/.test(core);
}

function splitLatinNameEvenly(text) {
    const trimmed = text.trim();
    const parts = trimmed.split(/\s+/);
    const letterCount = trimmed.replace(/\s/g, '').length;
    if (letterCount <= 10) return escapeHtml(trimmed);
    if (parts.length > 1) {
        const mid = Math.ceil(parts.length / 2);
        return `${escapeHtml(parts.slice(0, mid).join(' '))}<br>${escapeHtml(parts.slice(mid).join(' '))}`;
    }
    const word = parts[0];
    if (word.length <= 10) return escapeHtml(word);
    const half = Math.ceil(word.length / 2);
    return `${escapeHtml(word.slice(0, half))}<br>${escapeHtml(word.slice(half))}`;
}

function getGuestNameTextClass(name) {
    return isLatinGuestName(name) ? 'guest-name-text name-latn' : 'guest-name-text name-cjk';
}

const GUEST_NAME_FONT_RATIO_MIN = 0.145;
// 字體上限 ≈ 3 個中文字（如「二姑姐」）— 單字放大但唔會頂晒個圓
const GUEST_NAME_FONT_RATIO_REF_CHARS = 3.15;
const GUEST_NAME_PADDING = 6;
const GUEST_NAME_CIRCLE_INSET = 0.9;

function getGuestNameInnerSize(guestSize) {
    return (guestSize - GUEST_NAME_PADDING) * GUEST_NAME_CIRCLE_INSET;
}

function getGuestNameFontRatioCap(guestSize) {
    const inner = getGuestNameInnerSize(guestSize);
    return inner / (guestSize * GUEST_NAME_FONT_RATIO_REF_CHARS);
}

function noBreakSpaces(text) {
    return escapeHtml(text).replace(/ /g, '&nbsp;');
}

function formatAttachSubline(text) {
    return `<span class="name-subline">${noBreakSpaces(text)}</span>`;
}

function isCJKWord(text) {
    return /^[\u4e00-\u9fff]+$/.test(text);
}

function isCJKOnlyText(text) {
    return isCJKWord((text || '').replace(/\s/g, ''));
}

function formatCJKMainPart(mainPart) {
    const parts = mainPart.trim().split(/\s+/);
    if (parts.length === 2 && parts.every(isCJKWord)) {
        return `${escapeHtml(parts[0])}<br>${escapeHtml(parts[1])}`;
    }
    const cjkMain = mainPart.replace(/\s/g, '');
    if (isCJKOnlyText(cjkMain)) {
        if (cjkMain.length <= 5) return escapeHtml(mainPart);
        return splitCJKNameEvenly(cjkMain);
    }
    return escapeHtml(mainPart);
}

const guestNameFontRatioCache = new Map();

function measureGuestNameFontRatio(circle) {
    const guestSize = parseFloat(getComputedStyle(circle).getPropertyValue('--guest-size')) || 64;
    const textSpan = circle.querySelector('.guest-name-text');
    if (!textSpan) return 0.19;

    const zoomVal = zoom;
    const nameKey = textSpan.getAttribute('title') || textSpan.textContent || '';
    const cacheKey = `${nameKey}|${guestSize}|${Math.round(zoomVal * 1000)}`;
    if (guestNameFontRatioCache.has(cacheKey)) {
        return guestNameFontRatioCache.get(cacheKey);
    }

    const inner = getGuestNameInnerSize(guestSize) * zoomVal;
    let lo = GUEST_NAME_FONT_RATIO_MIN;
    let hi = getGuestNameFontRatioCap(guestSize);
    const prevFontSize = circle.style.fontSize;

    while (hi - lo > 0.003) {
        const mid = (lo + hi) / 2;
        circle.style.fontSize = `${guestSize * mid * zoomVal}px`;
        const fits = textSpan.scrollWidth <= inner + 1 && textSpan.scrollHeight <= inner + 1;
        if (fits) lo = mid;
        else hi = mid;
    }

    circle.style.fontSize = prevFontSize;
    const ratio = Math.max(GUEST_NAME_FONT_RATIO_MIN, lo);
    guestNameFontRatioCache.set(cacheKey, ratio);
    return ratio;
}

function fitAllGuestNameFonts() {
    document.querySelectorAll('.guest-seat-circle').forEach(circle => {
        const ratio = measureGuestNameFontRatio(circle);
        circle.style.setProperty('--name-font-ratio', ratio.toFixed(4));
    });
}

function normalizeAttachLabel(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.replace(/眷屬\s*([0-9０-９]+)/gu, (_, n) => {
        const num = n.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        return `眷屬 ${num}`;
    });
}

function formatGuestDisplayName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';

    // 「靚女姑姐 *3 眷屬1」→ 兩行：靚女姑姐 / *3 眷屬 1（第二行唔再拆）
    const starAttach = trimmed.match(/^(.+?)\s*(\*\d+)\s*(眷屬\s*[\d０-９]+)\s*$/u);
    if (starAttach) {
        const star = starAttach[2];
        const attach = normalizeAttachLabel(starAttach[3]);
        return `${escapeHtml(starAttach[1].trim())}<br>${formatAttachSubline(`${star} ${attach}`)}`;
    }

    const attachMatch = trimmed.match(/^(.+?)\s*(眷屬\s*[\d０-９]+.*)$/u);
    let mainPart = trimmed;
    let attachPart = '';
    if (attachMatch) {
        mainPart = attachMatch[1].trim();
        attachPart = attachMatch[2].trim();
    }

    const starInMain = mainPart.match(/^(.+?)\s*(\*\d+)\s*$/);
    if (starInMain && attachPart) {
        const star = starInMain[2];
        const attach = normalizeAttachLabel(attachPart);
        return `${escapeHtml(starInMain[1].trim())}<br>${formatAttachSubline(`${star} ${attach}`)}`;
    }

    if (attachPart) {
        return `${formatCJKMainPart(mainPart)}<br>${formatAttachSubline(normalizeAttachLabel(attachPart))}`;
    }

    const cjkOnly = trimmed.replace(/\s/g, '');
    if (isCJKOnlyText(cjkOnly)) {
        if (cjkOnly.length <= 5) return escapeHtml(cjkOnly);
        return splitCJKNameEvenly(cjkOnly);
    }

    if (isLatinGuestName(trimmed)) {
        return splitLatinNameEvenly(trimmed);
    }

    if (trimmed.includes(' ')) {
        const combo = trimmed.match(/^(.+?)\s+(\*\d+\s+眷屬\s*[\d０-９]+.*)$/u);
        if (combo) {
            const starAttachTail = combo[2].match(/^(\*\d+)\s*(眷屬\s*[\d０-９]+.*)$/u);
            if (starAttachTail) {
                return `${escapeHtml(combo[1].trim())}<br>${formatAttachSubline(`${starAttachTail[1]} ${normalizeAttachLabel(starAttachTail[2])}`)}`;
            }
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length === 2 && parts.every(isCJKWord)) {
            return `${escapeHtml(parts[0])}<br>${escapeHtml(parts[1])}`;
        }
        const compactLen = trimmed.replace(/\s/g, '').length;
        if (compactLen <= 5) return escapeHtml(trimmed);
        if (compactLen === 6 && parts.every(isCJKWord)) {
            return splitCJKNameEvenly(trimmed.replace(/\s/g, ''));
        }
        if (isLatinGuestName(trimmed)) return splitLatinNameEvenly(trimmed);
        return parts.map(escapeHtml).join('<br>');
    }

    return escapeHtml(trimmed);
}

function getSeatLayout(maxSeats) {
    const plateR = PLATE_SIZE / 2;
    const hubClearR = 118;
    let guestSize = 64;
    if (maxSeats > 12) guestSize = 58;
    if (maxSeats > 14) guestSize = 54;
    const guestHalf = guestSize / 2;
    const edgeMargin = 16;
    const maxRadius = plateR - edgeMargin - guestHalf;
    const minRadius = hubClearR + guestHalf + 4;
    const minChord = guestSize * 0.98;

    let radius = maxRadius;
    for (let r = maxRadius; r >= minRadius; r -= 1) {
        const chord = 2 * r * Math.sin(Math.PI / maxSeats);
        if (chord >= minChord) {
            radius = r;
            break;
        }
    }
    radius = Math.max(minRadius, Math.min(maxRadius, radius));
    return { radius, guestSize };
}

// 側邊欄開合（狀態由 engine 持有，UI 經 hook 同步至 Vue）
let isSidebarOpen = true;

function notifySidebarChange(instant = false) {
    uiHooks.onSidebarChange?.({ open: isSidebarOpen, instant });
}

function getSidebarRightEdge() {
    if (!isSidebarOpen) return 0;
    return getSidebarPanelWidth();
}

function openSidebar({ instant = false } = {}) {
    if (isSidebarOpen) return;
    isSidebarOpen = true;
    notifySidebarChange(instant);
}

function closeSidebar({ instant = false } = {}) {
    if (!isSidebarOpen) return;
    isSidebarOpen = false;
    notifySidebarChange(instant);
}

function openSidebarIfDragEntersSidebar(clientX) {
    if (isSidebarOpen || !isGuestDragging) return;
    if (clientX <= getSidebarDragOpenThreshold()) {
        openSidebar();
    }
}

function closeSidebarIfDragLeavesSidebar(clientX, sidebarRight) {
    if (!isSidebarOpen) return;
    const edge = sidebarRight ?? getSidebarRightEdge();
    if (clientX > edge - 8) {
        closeSidebar();
    }
}

function initMobileExperience() {
    if (!isMobileViewport()) return;
    closeSidebar({ instant: true });
}

function toggleSidebar() {
    if (isSidebarOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

let isTablePositionLocked = false;

function getTableLockStorageKey() {
    return `seating_tables_locked_${tenantSlug || 'default'}`;
}

function loadTablePositionLockState() {
    isTablePositionLocked = localStorage.getItem(getTableLockStorageKey()) === '1';
}

function updateTableLockUI() {
    document.body.classList.toggle('tables-position-locked', isTablePositionLocked);
    uiHooks.onTableLockChange?.(isTablePositionLocked);
}

function toggleTablePositionLock() {
    isTablePositionLocked = !isTablePositionLocked;
    localStorage.setItem(getTableLockStorageKey(), isTablePositionLocked ? '1' : '0');
    if (isTablePositionLocked) cancelTableDrag();
    updateTableLockUI();
}

let printPreviewOpen = false;
let printPreviewHtml = '';
let printPreviewZoom = 1;
let printPreviewOrientation = 'portrait';
let printLayoutZoom = 1;
let printPreviewBuilder = null;
let nativePrintSnapshot = null;
const PRINT_ZOOM_STEP = 0.2;
const PRINT_ZOOM_MIN = 0.2;
const PRINT_ZOOM_MAX = 3;

function snapPrintPreviewZoom(value) {
    return Math.min(PRINT_ZOOM_MAX, Math.max(PRINT_ZOOM_MIN, Math.round(value / PRINT_ZOOM_STEP) * PRINT_ZOOM_STEP));
}

const PRINT_PAGE_PAD = 10;
const PRINT_EMPTY_MSG = '目前沒有任何枱位資料。';

function getPrintPageInnerSize(orientation = printPreviewOrientation) {
    // A4 @ 96dpi，扣除 5mm 邊距後可印區域
    if (orientation === 'landscape') return { w: 1085, h: 756 };
    return { w: 756, h: 1085 };
}

function computePrintFitScale(bounds) {
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY;
    const page = getPrintPageInnerSize();
    return Math.min(
        (page.w - PRINT_PAGE_PAD * 2) / spanW,
        (page.h - PRINT_PAGE_PAD * 2) / spanH
    );
}

function computePrintLayoutZoom(bounds) {
    return Math.max(0.05, computePrintFitScale(bounds));
}

function requireTablesBounds() {
    const bounds = getTablesBoundingBox();
    if (!bounds) {
        alert(`❌ ${PRINT_EMPTY_MSG}`);
        return null;
    }
    return bounds;
}

function getPrintPreviewState() {
    const page = getPrintPageInnerSize();
    return {
        open: printPreviewOpen,
        html: printPreviewHtml,
        zoom: printPreviewZoom,
        zoomPercent: Math.round(printPreviewZoom * 100),
        orientation: printPreviewOrientation,
        pageWidth: page.w,
        pageHeight: page.h,
    };
}

function notifyPrintPreviewChange(override = {}) {
    uiHooks.onPrintPreviewChange?.({ ...getPrintPreviewState(), ...override });
}

function buildTablePlatePrintHTML(tableNum) {
    const table = getTableViewModel(tableNum);
    if (!table) return '';
    const seatsHTML = table.seats.map((seat) => {
        const pos = `left:calc(${seat.x}px * var(--zoom));top:calc(${seat.y}px * var(--zoom))`;
        if (seat.guest) {
            return `<div class="seat-slot guest-seat-circle ${seat.guest.sideClass}" style="${pos}" data-table-num="${table.num}" data-seat-index="${seat.index}"><span class="${seat.guest.nameClass}" title="${escapeHtml(seat.guest.name)}">${seat.guest.displayHtml}</span></div>`;
        }
        return `<div class="seat-slot seat-empty" style="${pos}" data-table-num="${table.num}" data-seat-index="${seat.index}"><span>+</span></div>`;
    }).join('');
    const hubHTML = [
        `<span class="hub-title">Table ${table.num}</span>`,
        table.label ? `<span class="hub-category">${escapeHtml(table.label)}</span>` : '',
        `<span class="hub-num">${table.filled} ppl</span>`,
    ].join('');
    return `<div class="table-plate" style="--guest-size:${table.guestSize}px">${seatsHTML}${table.hubRingHtml}<div class="hub-center">${hubHTML}</div></div>`;
}

function fitPrintPreviewGuestFonts() {
    document.querySelectorAll('.print-preview-sheet .guest-seat-circle').forEach((circle) => {
        const ratio = measureGuestNameFontRatio(circle);
        circle.style.setProperty('--name-font-ratio', ratio.toFixed(4));
    });
}

function openPrintPreview(buildHTML) {
    if (!requireTablesBounds()) return;
    printPreviewBuilder = buildHTML;
    printPreviewOpen = true;
    printPreviewHtml = buildHTML();
    printPreviewZoom = 1;
    document.body.dataset.printOrientation = printPreviewOrientation;
    document.body.classList.add('print-preview-open');
    applyPrintPageStyle();
    notifyPrintPreviewChange();
}

function buildCanvasPrintHTML(options = {}) {
    const bakeScale = options?.bakeScale === true;
    const bounds = getTablesBoundingBox();
    if (!bounds) return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;

    const page = getPrintPageInnerSize();
    const pad = PRINT_PAGE_PAD;
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY;
    const fitScale = computePrintLayoutZoom(bounds);
    printLayoutZoom = fitScale;

    const innerW = spanW + pad * 2;
    const innerH = spanH + pad * 2;
    const scaledW = innerW * fitScale;
    const scaledH = innerH * fitScale;
    const offsetX = (page.w - scaledW) / 2;
    const offsetY = (page.h - scaledH) / 2;

    const tablesHTML = getTableSettingKeys().map((tableNum) => {
        const settings = tableSettings[tableNum];
        if (!settings) return '';
        const bx = Number(settings.x);
        const by = Number(settings.y);
        if (!Number.isFinite(bx) || !Number.isFinite(by)) return '';
        const relLeft = bx - bounds.minX + pad;
        const relTop = by - bounds.minY + pad;
        if (bakeScale) {
            const left = offsetX + relLeft * fitScale;
            const top = offsetY + relTop * fitScale;
            return `<div class="draggable-table" style="left:${left}px;top:${top}px;--zoom:${fitScale}">${buildTablePlatePrintHTML(tableNum)}</div>`;
        }
        return `<div class="draggable-table" style="left:${relLeft}px;top:${relTop}px;--zoom:1">${buildTablePlatePrintHTML(tableNum)}</div>`;
    }).join('');

    if (!tablesHTML) {
        return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;
    }

    if (bakeScale) {
        return `<div class="print-tables-layout" style="width:${page.w}px;height:${page.h}px;--zoom:1">${tablesHTML}</div>`;
    }

    return `<div class="print-tables-layout" style="width:${page.w}px;height:${page.h}px;--zoom:1">
        <div class="print-tables-scale-group" style="left:${offsetX}px;top:${offsetY}px;width:${innerW}px;height:${innerH}px;transform:scale(${fitScale})">${tablesHTML}</div>
    </div>`;
}

function stepPrintPreviewZoom(delta) {
    if (!printPreviewOpen) return;
    printPreviewZoom = snapPrintPreviewZoom(printPreviewZoom + delta);
    notifyPrintPreviewChange();
}

function fitPrintPreviewZoom(scrollSize) {
    if (!printPreviewOpen) return;
    const page = getPrintPageInnerSize();
    const padding = isMobileViewport() ? 24 : 48;
    const w = scrollSize?.width ?? window.innerWidth;
    const h = scrollSize?.height ?? window.innerHeight;
    const zoomX = (w - padding) / page.w;
    const zoomY = (h - padding) / page.h;
    printPreviewZoom = snapPrintPreviewZoom(Math.min(zoomX, zoomY));
    notifyPrintPreviewChange();
}

function autoFitPrintPreviewOnOpen(scrollSize) {
    if (!printPreviewOpen || !isMobileViewport()) return;
    fitPrintPreviewZoom(scrollSize);
}

function applyPrintPageStyle() {
    let styleEl = document.getElementById('print-page-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'print-page-style';
        document.head.appendChild(styleEl);
    }
    const pageSize = printPreviewOrientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    styleEl.textContent = `@media print { @page { size: ${pageSize}; margin: 5mm; } }`;
}

function setPrintOrientation(orientation) {
    if (orientation !== 'portrait' && orientation !== 'landscape') return;
    printPreviewOrientation = orientation;
    document.body.dataset.printOrientation = orientation;
    applyPrintPageStyle();
    if (printPreviewOpen && printPreviewBuilder) {
        const savedZoom = printPreviewZoom;
        printPreviewHtml = printPreviewBuilder();
        printPreviewZoom = savedZoom;
    }
    notifyPrintPreviewChange();
}

function applyNativePrintLayout() {
    if (!printPreviewOpen) return;
    const content = document.querySelector('.print-preview-content');
    const sheet = document.querySelector('.print-preview-sheet');
    const viewport = document.querySelector('.print-preview-viewport');
    if (!content) return;

    const page = getPrintPageInnerSize();
    nativePrintSnapshot = {
        contentHtml: content.innerHTML,
        sheetStyle: sheet ? {
            transform: sheet.style.transform,
            width: sheet.style.width,
            height: sheet.style.height,
        } : null,
        viewportStyle: viewport ? {
            width: viewport.style.width,
            height: viewport.style.height,
        } : null,
    };

    const bakedHtml = (printPreviewBuilder === buildCanvasPrintHTML)
        ? buildCanvasPrintHTML({ bakeScale: true })
        : content.innerHTML;

    content.innerHTML = bakedHtml;

    if (sheet) {
        sheet.style.transform = 'none';
        sheet.style.width = `${page.w}px`;
        sheet.style.height = `${page.h}px`;
    }
    if (viewport) {
        viewport.style.width = '100%';
        viewport.style.height = 'auto';
    }

    fitPrintPreviewGuestFonts();
}

function restoreNativePrintLayout() {
    if (!nativePrintSnapshot) return;
    const content = document.querySelector('.print-preview-content');
    const sheet = document.querySelector('.print-preview-sheet');
    const viewport = document.querySelector('.print-preview-viewport');

    if (content) content.innerHTML = nativePrintSnapshot.contentHtml;
    if (sheet && nativePrintSnapshot.sheetStyle) {
        sheet.style.transform = nativePrintSnapshot.sheetStyle.transform;
        sheet.style.width = nativePrintSnapshot.sheetStyle.width;
        sheet.style.height = nativePrintSnapshot.sheetStyle.height;
    }
    if (viewport && nativePrintSnapshot.viewportStyle) {
        viewport.style.width = nativePrintSnapshot.viewportStyle.width;
        viewport.style.height = nativePrintSnapshot.viewportStyle.height;
    }

    nativePrintSnapshot = null;
}

function closePrintPreview() {
    restoreNativePrintLayout();
    if (!printPreviewOpen) return;
    printPreviewOpen = false;
    printPreviewBuilder = null;
    printPreviewHtml = '';
    printPreviewZoom = 1;
    document.body.classList.remove('print-preview-open');
    delete document.body.dataset.printOrientation;
    notifyPrintPreviewChange();
}

function executePrintPreview() {
    applyPrintPageStyle();
    applyNativePrintLayout();
    const onDone = () => {
        restoreNativePrintLayout();
        window.removeEventListener('afterprint', onDone);
    };
    window.addEventListener('afterprint', onDone);
    window.print();
}

function printCanvasView() {
    openPrintPreview(buildCanvasPrintHTML);
}

function getPrintNameColumnCount(guestCount) {
    if (guestCount <= 4) return 1;
    if (guestCount <= 10) return 2;
    return 3;
}

function getPrintTextFontSize(tableSize, guestCount) {
    const base = tableSize * (guestCount <= 4 ? 0.055 : guestCount <= 8 ? 0.048 : 0.04);
    return Math.max(11, Math.min(20, Math.round(base)));
}

function buildGuestCirclePrintHTML() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;

    const page = getPrintPageInnerSize();
    const sheetW = page.w;
    const sheetH = page.h;
    const titleBleed = 24;
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY + titleBleed;
    const pad = PRINT_PAGE_PAD;
    const fitScale = Math.max(0.05, Math.min(
        (sheetW - pad * 2) / spanW,
        (sheetH - pad * 2) / spanH
    ));
    const floorW = spanW * fitScale;
    const floorH = spanH * fitScale;
    const offsetX = (sheetW - floorW) / 2;
    const offsetY = (sheetH - floorH) / 2;

    const sortedTableNums = getTableSettingKeys();

    const circles = sortedTableNums.map(tableNum => {
        const settings = tableSettings[tableNum];
        const idx = parseInt(tableNum, 10);
        const left = (settings.x - bounds.minX) * fitScale;
        const top = (settings.y - bounds.minY) * fitScale;
        const size = TABLE_DIM * fitScale;
        const guests = (allGuests[idx] || [])
            .filter(g => g && g.name)
            .sort((a, b) => (a.sort || 99) - (b.sort || 99));
        const colCount = getPrintNameColumnCount(guests.length);
        const fontSize = getPrintTextFontSize(size, guests.length);
        const titleSize = Math.max(12, Math.min(20, Math.round(size * 0.06)));
        const titleH = Math.max(16, Math.round(size * 0.07));
        const borderW = Math.max(1.5, fitScale * 2);
        const names = guests.length
            ? guests.map(g => `<span class="print-name-item">${escapeHtml(g.name)}</span>`).join('')
            : '<span class="print-empty">—</span>';

        return `
            <div class="print-table-unit" style="left:${left}px;top:${top}px;width:${size}px">
                <div class="print-table-title" style="font-size:${titleSize}px;height:${titleH}px;line-height:${titleH}px">第 ${tableNum} 桌</div>
                <div class="print-table-circle" style="width:${size}px;height:${size}px;border-width:${borderW}px">
                    <div class="print-name-grid" style="column-count:${colCount};font-size:${fontSize}px;line-height:1.25">${names}</div>
                </div>
            </div>
        `;
    }).join('');

    return `<div class="print-floor" style="width:${sheetW}px;height:${sheetH}px;overflow:hidden">
        <div class="print-floor-inner" style="position:relative;width:${floorW}px;height:${floorH}px;left:${offsetX}px;top:${offsetY}px">${circles}</div>
    </div>`;
}

function printGuestListView() {
    openPrintPreview(buildGuestCirclePrintHTML);
}

let isDraggingTable = false;
let draggedTableNum = null;
let tableDragStartX = 0;
let tableDragStartY = 0;
let tableDragPointerId = null;
let tableOffsetX = 0;
let tableOffsetY = 0;
let isGuestDragging = false;

function createDragGhost(name, x, y) {
    const ghost = document.createElement('div');
    ghost.className = 'guest-drag-ghost';
    ghost.textContent = name;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.appendChild(ghost);
    return ghost;
}

function findGuestBySeat(tableIdx, seatIndex) {
    const guests = allGuests[tableIdx] || allGuests[String(tableIdx)];
    if (!guests) return -1;
    const target = seatIndex + 1;
    return guests.findIndex(g => g && Number(g.sort) === target);
}

function findGuestIndexAtTable(tableIdx, { seatIdx, guestId, guestName } = {}) {
    const guests = allGuests[tableIdx] || allGuests[String(tableIdx)];
    if (!Array.isArray(guests)) return -1;
    const id = String(guestId || '').trim();
    if (id) {
        const byId = guests.findIndex((g) => g?.id && String(g.id) === id);
        if (byId !== -1) return byId;
    }
    if (seatIdx != null && Number.isFinite(seatIdx)) {
        const bySeat = findGuestBySeat(tableIdx, seatIdx);
        if (bySeat !== -1) return bySeat;
    }
    const name = String(guestName || '').trim();
    if (name) {
        return guests.findIndex((g) => g?.name && String(g.name).trim() === name);
    }
    return -1;
}

function sortGuestArraysBySeat() {
    if (!allGuests) return;
    const tableLists = Array.isArray(allGuests) ? allGuests : Object.values(allGuests);
    tableLists.forEach(list => {
        if (Array.isArray(list)) {
            list.sort((a, b) => (parseInt(a?.sort, 10) || 99) - (parseInt(b?.sort, 10) || 99));
        }
    });
}

let suppressGuestRemoteRenderCount = 0;
let suppressTableSettingsRemoteRenderCount = 0;

function getGridSnapStorageKey() {
    return `seating_grid_snap_v1_${tenantSlug || 'default'}`;
}
const guestPersistPendingTables = new Set();
let guestPersistPoolDirty = false;
let localGuestRevision = 0;
let lastPersistedGuestRevision = 0;
let guestIdMigrationDone = false;

function ensureIdsInGuestState() {
    let changed = false;
    // tables
    if (Array.isArray(allGuests)) {
        allGuests.forEach((list) => {
            if (!Array.isArray(list)) return;
            list.forEach((g) => {
                if (g && g.name && !g.id) { ensureGuestHasId(g); changed = true; }
            });
        });
    } else if (allGuests && typeof allGuests === 'object') {
        Object.values(allGuests).forEach((list) => {
            if (!Array.isArray(list)) return;
            list.forEach((g) => {
                if (g && g.name && !g.id) { ensureGuestHasId(g); changed = true; }
            });
        });
    }
    // pool
    const beforeLen = normalizeUnassignedPool(unassignedPool).length;
    unassignedPool = normalizeUnassignedPool(unassignedPool);
    const afterLen = unassignedPool.length;
    if (beforeLen !== afterLen) changed = true;
    return changed;
}

function shouldApplyRemoteGuestState() {
    return localGuestRevision <= lastPersistedGuestRevision;
}

function normalizeUnassignedPool(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(g => g != null).map(ensureGuestHasId);
    if (typeof raw === 'object') {
        return Object.keys(raw)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => raw[k])
            .filter(g => g != null)
            .map(ensureGuestHasId);
    }
    return [];
}

function sanitizeGuestStateBeforePersist() {
    unassignedPool = normalizeUnassignedPool(unassignedPool);

    const tableAssignedIds = new Set();
    const dedupeTableList = (list) => {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.filter(g => {
            if (!g?.name) return false;
            ensureGuestHasId(g);
            if (seen.has(g.id)) return false;
            seen.add(g.id);
            const sort = parseInt(g.sort, 10);
            if (!isNaN(sort) && sort >= 1 && sort !== 99) {
                tableAssignedIds.add(g.id);
            }
            return true;
        });
    };

    if (Array.isArray(allGuests)) {
        allGuests = allGuests.map(dedupeTableList);
    } else if (allGuests && typeof allGuests === 'object') {
        Object.keys(allGuests).forEach(key => {
            allGuests[key] = dedupeTableList(allGuests[key]);
        });
    }

    const poolIds = new Set();
    const dedupedPool = [];
    unassignedPool.forEach(g => {
        if (!g?.name) return;
        ensureGuestHasId(g);
        if (poolIds.has(g.id)) return;
        if (tableAssignedIds.has(g.id)) return;
        poolIds.add(g.id);
        g.sort = 99;
        dedupedPool.push(g);
    });
    unassignedPool = dedupedPool;
}

function serializeGuestRowForPersist(guest) {
    if (!guest?.name) return null;
    ensureGuestHasId(guest);
    const sort = parseInt(guest.sort, 10);
    const group = typeof guest.group === 'string'
        ? (guest.group.trim() || '未分類')
        : serializeGroupForFirebase(guest.group);
    return {
        id: String(guest.id),
        name: String(guest.name).trim(),
        side: guest.side === '女方' ? '女方' : '男方',
        group,
        sort: !Number.isNaN(sort) && sort >= 1 ? sort : 99,
    };
}

function buildWeddingGuestsMapForPersist() {
    const wedding = {};
    const assignTable = (idx, list) => {
        const tableNum = parseInt(idx, 10);
        if (!tableNum || tableNum < 1 || !Array.isArray(list)) return;
        const rows = list.map(serializeGuestRowForPersist).filter(Boolean);
        if (rows.length) wedding[String(tableNum)] = rows;
    };
    if (Array.isArray(allGuests)) {
        allGuests.forEach((list, idx) => assignTable(idx, list));
    } else if (allGuests && typeof allGuests === 'object') {
        Object.entries(allGuests).forEach(([idx, list]) => assignTable(idx, list));
    }
    return wedding;
}

function buildUnassignedGuestsForPersist() {
    return unassignedPool.map(serializeGuestRowForPersist).filter(Boolean);
}

function persistGuestState(affectedTableNums, poolDirty = false) {
    void affectedTableNums;
    void poolDirty;
    sanitizeGuestStateBeforePersist();
    sortGuestArraysBySeat();
    if (!activeTenantId) {
        return Promise.reject(new Error('專案未就緒'));
    }

    suppressGuestRemoteRenderCount = poolDirty ? 2 : 1;
    return saveGuestSeatingState(activeTenantId, {
        wedding: buildWeddingGuestsMapForPersist(),
        unassigned: buildUnassignedGuestsForPersist(),
    }).then(() => {
        lastPersistedGuestRevision = localGuestRevision;
    }).catch(err => {
        suppressGuestRemoteRenderCount = 0;
        lastPersistedGuestRevision = localGuestRevision;
        console.warn('賓客狀態同步失敗:', err);
        alert('❌ 排位儲存失敗，請確認已登入並具備名單寫入權限。');
        throw err;
    });
}

let guestPersistQueue = Promise.resolve();

function schedulePersistGuestState(affectedTableNums, poolDirty) {
    affectedTableNums.forEach(num => guestPersistPendingTables.add(String(num)));
    if (poolDirty) guestPersistPoolDirty = true;
    guestPersistQueue = guestPersistQueue.then(() => {
        const tables = [...guestPersistPendingTables];
        const poolDirtyNow = guestPersistPoolDirty;
        guestPersistPendingTables.clear();
        guestPersistPoolDirty = false;
        if (!tables.length && !poolDirtyNow) return;
        const tablesToPersist = tables.length ? tables : getTableSettingKeys();
        return persistGuestState(tablesToPersist, poolDirtyNow).then(() => {
            applyGuestMoveUI(tablesToPersist, { poolChanged: poolDirtyNow });
        });
    });
    return guestPersistQueue;
}

function getTableSeatSlotsArray(tableNum, maxSeats) {
    const idx = parseInt(tableNum, 10);
    const guestsInTable = allGuests[idx] || [];
    const seatSlotsArray = new Array(maxSeats).fill(null);
    guestsInTable.forEach(g => {
        if (g && g.name && g.sort >= 1 && g.sort <= maxSeats) {
            ensureGuestHasId(g);
            seatSlotsArray[g.sort - 1] = g;
        }
    });
    const filled = guestsInTable.filter(g => g && g.name).length;
    return { seatSlotsArray, filled };
}

function getTableViewModel(tableNum) {
    const settings = tableSettings[tableNum];
    if (!settings) return null;
    const maxSeats = settings.max_seats || 12;
    const { seatSlotsArray, filled } = getTableSeatSlotsArray(tableNum, maxSeats);
    const seatLayout = getSeatLayout(maxSeats);
    const seats = [];
    for (let i = 0; i < maxSeats; i++) {
        const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
        const x = PLATE_CENTER + seatLayout.radius * Math.cos(angle);
        const y = PLATE_CENTER + seatLayout.radius * Math.sin(angle);
        const guest = seatSlotsArray[i];
        seats.push({
            index: i,
            x,
            y,
            // 必須保留原始 guest 欄位（id/side/group/sort...）
            // 否則拖拽/編輯 modal 會失去標籤與來源資訊
            guest: guest ? {
                ...guest,
                displayHtml: formatGuestDisplayName(guest.name),
                nameClass: getGuestNameTextClass(guest.name),
                sideClass: guest.side === '女方' ? 'side-female' : 'side-male',
            } : null,
        });
    }
    return {
        num: String(tableNum),
        baseX: settings.x,
        baseY: settings.y,
        maxSeats,
        filled,
        guestSize: seatLayout.guestSize,
        label: (settings.label || '').trim(),
        hubRingHtml: buildHubRingSVG(filled, maxSeats),
        seats,
    };
}

function notifyCanvasTablesChange(tableNums = null) {
    const nums = tableNums?.length
        ? [...new Set(tableNums.map(String))]
        : getTableSettingKeys();
    const tables = nums.map((num) => getTableViewModel(num)).filter(Boolean);
    uiHooks.onCanvasTablesChange?.({
        tables,
        full: !tableNums?.length,
    });
    requestAnimationFrame(() => {
        requestAnimationFrame(() => fitAllGuestNameFonts());
    });
}

function bindTablePlateDrag(el, tableNum) {
    if (!el || el.dataset.tableBound === '1') return;
    el.dataset.tableBound = '1';
    if (IS_TOUCH_DEVICE) return;
    el.addEventListener('pointerdown', (e) => {
        if (isTablePositionLocked) {
            uiHooks.onLockButtonFlash?.();
            return;
        }
        if (e.button !== 0 || isGuestDragging) return;
        if (e.target.closest('.seat-slot, .hub-center, .hub-ring')) return;
        e.stopPropagation();
        isDraggingTable = true;
        draggedTableNum = String(tableNum);
        tableDragStartX = tableSettings[tableNum].x;
        tableDragStartY = tableSettings[tableNum].y;
        const pos = screenToCanvas(e.clientX, e.clientY);
        tableOffsetX = pos.x - tableDragStartX;
        tableOffsetY = pos.y - tableDragStartY;
        tableDragPointerId = e.pointerId;
        uiHooks.onCanvasTableDragChange?.({ tableNum: draggedTableNum, dragging: true });
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        cancelTableDrag();
        openSettingsModal(tableNum, tableSettings[tableNum]?.max_seats || 12);
    });
}

function bindSeatSlot(el, tableNum, seatIndex, guest) {
    if (!el) return;
    if (el.dataset.seatBound !== '1') {
        el.dataset.seatBound = '1';
        el.addEventListener('dragover', allowDrop);
        el.addEventListener('drop', (e) => handleDropOnSpecificSeat(e, tableNum, seatIndex));
    }
    if (!guest) return;
    ensureGuestHasId(guest);
    const getDragData = () => {
        const current = resolveGuestAtTable(tableNum, seatIndex, guest);
        if (!current) {
            return { fromTable: String(tableNum), seatIndex, name: '' };
        }
        ensureGuestHasId(current);
        return {
            id: current.id,
            fromTable: String(tableNum),
            seatIndex,
            name: current.name,
        };
    };
    if (IS_TOUCH_DEVICE) {
        setupTouchDrag(el, getDragData, { documentTouchDrag: true });
    } else {
        setupDesktopGuestDrag(el, getDragData, { pointerDown: true, seatDrag: true });
    }
    bindGuestTap(el, () => openGuestModal(guest, tableNum, seatIndex));
}

function bindTableHub(el, tableNum, maxSeats, titleEl = null) {
    if (!el || el.dataset.hubBound === '1') return;
    el.dataset.hubBound = '1';
    const open = () => openSettingsModal(tableNum, maxSeats);
    if (IS_TOUCH_DEVICE || !titleEl) {
        bindGuestTap(el, open);
    } else {
        bindGuestTap(titleEl, open);
    }
}

function updateTableGuestDisplay(tableNum) {
    if (!tableSettings[tableNum]) return false;
    notifyCanvasTablesChange([String(tableNum)]);
    return true;
}

function getGuestSideLabel(guest) {
    return guest?.side === '女方' ? '女方' : '男方';
}

function applyGuestMoveUI(tableNums, { poolChanged = false, poolSides = null } = {}) {
    if (poolChanged) {
        const sides = poolSides?.length ? [...new Set(poolSides)] : ['男方', '女方'];
        notifyPoolChange(sides);
    }
    updateGlobalStats();
    let needsFullRender = false;
    [...new Set(tableNums.map(String))].forEach(num => {
        if (!updateTableGuestDisplay(num)) needsFullRender = true;
    });
    if (needsFullRender) notifyCanvasTablesChange();
}

function commitGuestStateChange(affectedTableNums, { poolChanged = false, poolSides = null } = {}) {
    localGuestRevision++;
    applyGuestMoveUI(affectedTableNums, { poolChanged, poolSides });
    return schedulePersistGuestState(affectedTableNums, poolChanged);
}

// （已移除）restoreGuestToPoolAction：UUID 根治後不再需要救援入口

function moveGuestToSeat(data, toTableNum, targetSeatIdx) {
    const { fromTable, index, seatIndex } = data;
    const toTableIdx = parseInt(toTableNum, 10);
    const targetSortNum = targetSeatIdx + 1;

    if (!allGuests[toTableIdx]) allGuests[toTableIdx] = [];
    let movingGuestObj = null;

    if (fromTable === 'POOL') {
        unassignedPool = normalizeUnassignedPool(unassignedPool);
        let poolIndex = -1;
        if (data?.id) {
            poolIndex = unassignedPool.findIndex(g => g?.id && String(g.id) === String(data.id));
        }
        if (poolIndex === -1 && typeof index === 'number' && index >= 0 && index < unassignedPool.length) {
            const atIdx = unassignedPool[index];
            const indexMatchesId = !data?.id || (atIdx?.id && String(atIdx.id) === String(data.id));
            if (atIdx?.name && indexMatchesId) {
                poolIndex = index;
            }
        }
        if (poolIndex === -1 && data?.name) {
            poolIndex = unassignedPool.findIndex(g => g?.name && String(g.name).trim() === String(data.name).trim());
        }
        if (poolIndex >= 0) {
            movingGuestObj = unassignedPool[poolIndex];
            unassignedPool.splice(poolIndex, 1);
        }
    } else {
        const fromTableIdx = parseInt(fromTable, 10);
        let foundIdx = findGuestBySeat(fromTableIdx, seatIndex);
        if (foundIdx === -1 && data?.id) {
            const list = allGuests[fromTableIdx];
            if (Array.isArray(list)) {
                foundIdx = list.findIndex(g => g && g.id && String(g.id) === String(data.id));
            }
        }
        if (foundIdx === -1 && data?.name) {
            const list = allGuests[fromTableIdx];
            if (Array.isArray(list)) {
                foundIdx = list.findIndex(g => g && g.name && String(g.name).trim() === String(data.name).trim());
            }
        }
        if (foundIdx !== -1) {
            movingGuestObj = allGuests[fromTableIdx][foundIdx];
            allGuests[fromTableIdx].splice(foundIdx, 1);
        }
    }

    if (!movingGuestObj) return;
    if (!movingGuestObj?.name) {
        // 防呆：避免拖拽資料異常導致「人消失」
        console.warn('moveGuestToSeat: moving guest has no name, aborting', { data, toTableNum, targetSeatIdx, movingGuestObj });
        if (fromTable !== 'POOL') {
            const fromTableIdx = parseInt(fromTable, 10);
            if (Number.isFinite(fromTableIdx) && fromTableIdx > 0) {
                allGuests[fromTableIdx] = Array.isArray(allGuests[fromTableIdx]) ? allGuests[fromTableIdx] : [];
                movingGuestObj.sort = (parseInt(seatIndex, 10) || 0) + 1;
                allGuests[fromTableIdx].push(movingGuestObj);
                applyGuestMoveUI([String(fromTableIdx)], { poolChanged: false });
            }
        } else {
            unassignedPool = normalizeUnassignedPool(unassignedPool);
            unassignedPool.push(movingGuestObj);
            notifyPoolChange(['男方', '女方']);
        }
        return;
    }

    let bumpedToPool = null;
    const occupiedIdx = allGuests[toTableIdx].findIndex(g => g && g.sort === targetSortNum);
    if (occupiedIdx !== -1) {
        const bumpedGuest = allGuests[toTableIdx][occupiedIdx];
        if (fromTable === 'POOL') {
            bumpedGuest.sort = 99;
            unassignedPool = normalizeUnassignedPool(unassignedPool);
            ensureGuestHasId(bumpedGuest);
            if (!unassignedPool.some(g => g?.id && bumpedGuest.id && String(g.id) === String(bumpedGuest.id))) {
                unassignedPool.push(bumpedGuest);
            }
            bumpedToPool = bumpedGuest;
        } else {
            const fromTableIdx = parseInt(fromTable, 10);
            bumpedGuest.sort = seatIndex + 1;
            allGuests[fromTableIdx].push(bumpedGuest);
        }
        allGuests[toTableIdx].splice(occupiedIdx, 1);
    }

    movingGuestObj.sort = targetSortNum;
    ensureGuestHasId(movingGuestObj);
    allGuests[toTableIdx].push(movingGuestObj);

    const affected = new Set([String(toTableNum)]);
    if (fromTable !== 'POOL') affected.add(String(fromTable));

    const poolChanged = fromTable === 'POOL';
    const poolSides = poolChanged
        ? [
            getGuestSideLabel(movingGuestObj),
            ...(bumpedToPool ? [getGuestSideLabel(bumpedToPool)] : [])
        ]
        : null;

    commitGuestStateChange(Array.from(affected), { poolChanged, poolSides });
}

function moveGuestToPool(data) {
    const { fromTable } = data;
    const seatIndex = parseInt(data.seatIndex, 10);
    if (!fromTable || fromTable === 'POOL') return;
    if (!Number.isFinite(seatIndex)) return;

    const fromTableIdx = parseInt(fromTable, 10);
    let foundIdx = findGuestBySeat(fromTableIdx, seatIndex);
    if (foundIdx === -1 && data?.id) {
        const list = allGuests[fromTableIdx];
        if (Array.isArray(list)) {
            foundIdx = list.findIndex(g => g && g.id && String(g.id) === String(data.id));
        }
    }
    if (foundIdx === -1 && data?.name) {
        const list = allGuests[fromTableIdx];
        if (Array.isArray(list)) {
            foundIdx = list.findIndex(g => g && g.name && String(g.name).trim() === String(data.name).trim());
        }
    }
    if (foundIdx === -1) return;

    const movingGuestObj = allGuests[fromTableIdx][foundIdx];
    allGuests[fromTableIdx].splice(foundIdx, 1);
    if (!movingGuestObj?.name) {
        console.warn('moveGuestToPool: moving guest has no name, restoring', { data, fromTableIdx, seatIndex, movingGuestObj });
        allGuests[fromTableIdx] = Array.isArray(allGuests[fromTableIdx]) ? allGuests[fromTableIdx] : [];
        movingGuestObj.sort = seatIndex + 1;
        allGuests[fromTableIdx].push(movingGuestObj);
        applyGuestMoveUI([String(fromTableIdx)], { poolChanged: false });
        return;
    }
    movingGuestObj.sort = 99;
    unassignedPool = normalizeUnassignedPool(unassignedPool);
    ensureGuestHasId(movingGuestObj);
    if (!unassignedPool.some(g => g?.id && movingGuestObj.id && String(g.id) === String(movingGuestObj.id))) {
        unassignedPool.push(movingGuestObj);
    }

    commitGuestStateChange([String(fromTable)], {
        poolChanged: true,
        poolSides: [getGuestSideLabel(movingGuestObj)]
    });
}

function isPointOverSidebarDropZone(clientX, clientY) {
    if (document.elementFromPoint(clientX, clientY)?.closest(
        '.sidebar-content, #single-scroll-pool, .pool-group, .pool-guest-chip'
    )) {
        return true;
    }
    const panel = document.querySelector('.sidebar-panel:not(.collapsed) .sidebar-content');
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom;
}

function resolvePointerDrop(clientX, clientY, data) {
    if (isPointOverSidebarDropZone(clientX, clientY)) {
        moveGuestToPool(data);
        return;
    }

    const dropEl = document.elementFromPoint(clientX, clientY);
    if (!dropEl) return;

    const seatSlot = dropEl.closest('.seat-slot');
    if (seatSlot && seatSlot.dataset.tableNum != null) {
        moveGuestToSeat(data, seatSlot.dataset.tableNum, parseInt(seatSlot.dataset.seatIndex, 10));
    }
}

const GUEST_DRAG_THRESHOLD = 14;

function finishGuestTouchDrag(dragging, dragData, ghost, clientX, clientY) {
    if (dragging && dragData) {
        if (ghost) ghost.style.visibility = 'hidden';
        resolvePointerDrop(clientX, clientY, dragData);
    }
    if (ghost) ghost.remove();
    isGuestDragging = false;
    cancelTableDrag();
    if (dragData?.fromTable === 'POOL' && !isMobileViewport()) {
        openSidebar();
    }
}

function handleGuestTouchMove(t, startX, startY, state, opts, sidebarRight, ev) {
    openSidebarIfDragEntersSidebar(t.clientX);
    if (sidebarRight != null) closeSidebarIfDragLeavesSidebar(t.clientX, sidebarRight);

    const dist = Math.hypot(t.clientX - startX, t.clientY - startY);
    if (!state.dragging && dist > GUEST_DRAG_THRESHOLD) {
        state.dragging = true;
        isGuestDragging = true;
        state.dragData = opts.getDragData();
        state.ghost = createDragGhost(state.dragData.name || '', t.clientX, t.clientY);
        if (opts.onDragStart) opts.onDragStart(state.dragData);
    }
    if (state.dragging) {
        if (ev) ev.preventDefault();
        state.ghost.style.left = `${t.clientX}px`;
        state.ghost.style.top = `${t.clientY}px`;
        if (opts.onDragMove) opts.onDragMove(t.clientX, t.clientY, state.dragData);
    }
}

function setupTouchDrag(el, getDragData, options) {
    const opts = typeof options === 'function' ? { onDragStart: options } : (options || {});
    const useDocListeners = !!opts.closeSidebarOnLeave || !!opts.documentTouchDrag;
    opts.getDragData = getDragData;

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        cancelTableDrag();

        const touchId = e.touches[0].identifier;
        const startX = e.touches[0].clientX;
        const startY = e.touches[0].clientY;
        const state = { dragging: false, ghost: null, dragData: null };
        const sidebarRight = useDocListeners ? getSidebarRightEdge() : null;

        const findTouch = (list) => {
            for (let i = 0; i < list.length; i++) {
                if (list[i].identifier === touchId) return list[i];
            }
            return null;
        };

        if (useDocListeners) {
            const onDocMove = (ev) => {
                const t = findTouch(ev.touches);
                if (!t) return;
                handleGuestTouchMove(t, startX, startY, state, opts, sidebarRight, ev);
            };
            const onDocEnd = (ev) => {
                const ended = findTouch(ev.changedTouches);
                if (!ended) return;
                document.removeEventListener('touchmove', onDocMove, true);
                document.removeEventListener('touchend', onDocEnd, true);
                document.removeEventListener('touchcancel', onDocEnd, true);
                finishGuestTouchDrag(state.dragging, state.dragData, state.ghost, ended.clientX, ended.clientY);
            };
            document.addEventListener('touchmove', onDocMove, { passive: false, capture: true });
            document.addEventListener('touchend', onDocEnd, { capture: true });
            document.addEventListener('touchcancel', onDocEnd, { capture: true });
            return;
        }

        const onElMove = (ev) => {
            if (ev.touches.length !== 1) return;
            handleGuestTouchMove(ev.touches[0], startX, startY, state, opts, null, ev);
        };
        const onElEnd = (ev) => {
            el.removeEventListener('touchmove', onElMove);
            el.removeEventListener('touchend', onElEnd);
            el.removeEventListener('touchcancel', onElEnd);
            const t = ev.changedTouches[0];
            finishGuestTouchDrag(state.dragging, state.dragData, state.ghost, t.clientX, t.clientY);
        };
        el.addEventListener('touchmove', onElMove, { passive: false });
        el.addEventListener('touchend', onElEnd, { passive: true });
        el.addEventListener('touchcancel', onElEnd, { passive: true });
    }, { passive: true });
}

function setupDesktopGuestDrag(el, getDragData, options = {}) {
    el.setAttribute('draggable', 'true');
    if (options.pointerDown) {
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            cancelTableDrag();
            isGuestDragging = true;
        });
    }
    el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        cancelTableDrag();
        isGuestDragging = true;
        e.dataTransfer.setData('text/plain', JSON.stringify(getDragData()));
    });
    el.addEventListener('drag', (e) => {
        openSidebarIfDragEntersSidebar(e.clientX);
        if (options.trackSidebarLeave) closeSidebarIfDragLeavesSidebar(e.clientX);
    });
    el.addEventListener('dragend', (e) => {
        const data = getDragData();
        if (options.seatDrag && data?.fromTable && data.fromTable !== 'POOL') {
            const seatIdx = parseInt(data.seatIndex, 10);
            const tableIdx = parseInt(data.fromTable, 10);
            if (Number.isFinite(seatIdx) && findGuestBySeat(tableIdx, seatIdx) !== -1
                && isPointOverSidebarDropZone(e.clientX, e.clientY)) {
                moveGuestToPool(data);
            }
        }
        isGuestDragging = false;
        cancelTableDrag();
        if (options.trackSidebarLeave && !isMobileViewport()) {
            openSidebar();
        }
    });
}

function cancelTableDrag() {
    if (!draggedTableNum) return;
    const num = draggedTableNum;
    if (tableSettings[num]) {
        tableSettings[num].x = tableDragStartX;
        tableSettings[num].y = tableDragStartY;
    }
    uiHooks.onCanvasTablePositionChange?.({
        tableNum: num,
        baseX: tableDragStartX,
        baseY: tableDragStartY,
    });
    uiHooks.onCanvasTableDragChange?.({ tableNum: num, dragging: false });
    isDraggingTable = false;
    draggedTableNum = null;
    tableDragPointerId = null;
}

let seatingViewBootstrapped = false;

function runRender() {
    try {
        notifyPoolChange(['男方', '女方']);
        notifyCanvasTablesChange();
        updateGlobalStats();
        applyTransform();
        refreshFindTableMenu();
    } catch (err) {
        console.error('排位畫布渲染失敗:', err);
        setGlobalStatsMessage('載入失敗，請重新整理');
    }
}

function bootstrapSeatingView() {
    runRender();
    initMobileExperience();
    loadTablePositionLockState();
    updateTableLockUI();
    if (seatingViewBootstrapped) return;
    seatingViewBootstrapped = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => fitViewToTables());
    });
}

function setGlobalStatsMessage(message) {
    uiHooks.onGlobalStatsChange?.(message);
}

function handleSeatingDataRoot(root) {
    root = root || {};
    allGuests = root.wedding_guests || {};
    unassignedPool = normalizeUnassignedPool(root.unassigned_guests);
    tableSettings = loadTableSettings(root.table_settings);
    applyMetaLabelColumns(root.meta_label_columns);

    // 一次性補齊 guest.id（UUID），避免同名互相覆蓋/消失
    if (!guestIdMigrationDone && ensureIdsInGuestState()) {
        guestIdMigrationDone = true;
        localGuestRevision++;
        // 寫回 pool + 所有桌（一次性）
        schedulePersistGuestState(getTableSettingKeys(), true).catch((e) => {
            console.warn('guest id migration persist failed:', e);
            guestIdMigrationDone = false;
        });
    }

    if (!localStorage.getItem(getGridSnapStorageKey())) {
        snapAllTablesToGrid()
            .catch(err => console.warn('枱位對齊格線失敗:', err))
            .finally(() => {
                localStorage.setItem(getGridSnapStorageKey(), '1');
                bootstrapSeatingView();
                scheduleFloorLayoutSync();
            });
        return;
    }

    bootstrapSeatingView();
    scheduleFloorLayoutSync();
}

// Firebase 實時同步（分拆監聽，避免一次下載成個 DB 太慢）
let seatingDataReady = { guests: false, pool: false, tables: false, meta: false };

function maybeBootstrapFromPartialSync() {
    if (!seatingDataReady.tables) return;
    bootstrapSeatingView();
}

function markSeatingPartialReady(key) {
    seatingDataReady[key] = true;
    maybeBootstrapFromPartialSync();
}

function startSeatingRealtimeSync() {
    setGlobalStatsMessage('連線中...');

    dataUnsubs.push(tenantRef('wedding_guests').on('value', (snapshot) => {
        if (shouldApplyRemoteGuestState()) {
            allGuests = snapshot.val() || {};
            if (!guestIdMigrationDone && ensureIdsInGuestState()) {
                guestIdMigrationDone = true;
                localGuestRevision++;
                schedulePersistGuestState(getTableSettingKeys(), true).catch((e) => {
                    console.warn('guest id migration persist failed:', e);
                    guestIdMigrationDone = false;
                });
            }
        }
        markSeatingPartialReady('guests');
        if (suppressGuestRemoteRenderCount > 0) {
            suppressGuestRemoteRenderCount--;
            return;
        }
        if (!shouldApplyRemoteGuestState()) return;
        runRender();
    }, err => {
        console.error('wedding_guests 讀取失敗:', err);
        setGlobalStatsMessage('賓客資料讀取失敗');
    }));

    dataUnsubs.push(tenantRef('unassigned_guests').on('value', (snapshot) => {
        if (shouldApplyRemoteGuestState()) {
            unassignedPool = normalizeUnassignedPool(snapshot.val());
            if (!guestIdMigrationDone && ensureIdsInGuestState()) {
                guestIdMigrationDone = true;
                localGuestRevision++;
                schedulePersistGuestState(getTableSettingKeys(), true).catch((e) => {
                    console.warn('guest id migration persist failed:', e);
                    guestIdMigrationDone = false;
                });
            }
        }
        markSeatingPartialReady('pool');
        if (suppressGuestRemoteRenderCount > 0) {
            suppressGuestRemoteRenderCount--;
            return;
        }
        if (!shouldApplyRemoteGuestState()) return;
        runRender();
    }, err => console.error('unassigned_guests 讀取失敗:', err)));

    dataUnsubs.push(tenantRef('meta_label_columns').on('value', (snapshot) => {
        cachedMetaLabelColumns = snapshot.val();
        applyMetaLabelColumns(cachedMetaLabelColumns);
        markSeatingPartialReady('meta');
    }, err => console.error('meta_label_columns 讀取失敗:', err)));

    dataUnsubs.push(tenantRef('table_settings').on('value', (snapshot) => {
        if (isDraggingTable) return;
        const incoming = loadTableSettings(snapshot.val());
        if (suppressTableSettingsRemoteRenderCount > 0) {
            suppressTableSettingsRemoteRenderCount--;
            let addedNew = false;
            Object.keys(incoming).forEach((k) => {
                if (!tableSettings[k]) {
                    tableSettings[k] = incoming[k];
                    addedNew = true;
                }
            });
            if (addedNew) {
                runRender();
                refreshFindTableMenu();
                scheduleFloorLayoutSync();
            }
            return;
        }
        const root = {
            wedding_guests: allGuests,
            unassigned_guests: unassignedPool,
            table_settings: snapshot.val(),
            meta_label_columns: cachedMetaLabelColumns,
            floor_layout: null
        };
        handleSeatingDataRoot(root);
        markSeatingPartialReady('tables');
    }, err => {
        console.error('table_settings 讀取失敗:', err);
        setGlobalStatsMessage('枱位資料讀取失敗');
    }));

    bootstrapSeatingFromFetch();
}

async function bootstrapSeatingFromFetch() {
    if (!rawTenantRef) return;
    try {
        const [guestsSnap, poolSnap, metaSnap, tablesSnap] = await Promise.all([
            rawTenantRef('wedding_guests').once('value'),
            rawTenantRef('unassigned_guests').once('value'),
            rawTenantRef('meta_label_columns').once('value'),
            rawTenantRef('table_settings').once('value'),
        ]);
        cachedMetaLabelColumns = metaSnap.val();
        handleSeatingDataRoot({
            wedding_guests: guestsSnap.val(),
            unassigned_guests: poolSnap.val(),
            meta_label_columns: cachedMetaLabelColumns,
            table_settings: tablesSnap.val(),
        });
        markSeatingPartialReady('guests');
        markSeatingPartialReady('pool');
        markSeatingPartialReady('meta');
        markSeatingPartialReady('tables');
    } catch (err) {
        console.error('畫布初次載入失敗:', err);
        setGlobalStatsMessage(`載入失敗：${err?.message || err}`);
    }
}

function forEachGuestTable(callback) {
    if (Array.isArray(allGuests)) {
        allGuests.forEach(callback);
        return;
    }
    if (allGuests && typeof allGuests === 'object') {
        Object.values(allGuests).forEach(callback);
    }
}

function updateGlobalStats() {
    let total = 0, assigned = 0;
    forEachGuestTable(table => {
        if (Array.isArray(table)) {
            table.forEach(g => { if (g && g.name) { total++; assigned++; } });
        }
    });
    normalizeUnassignedPool(unassignedPool).forEach(g => { if (g && g.name) { total++; } });
    uiHooks.onGlobalStatsChange?.(`已排位: ${assigned} / 總人數: ${total}`);
}

function collectPoolBySide(side) {
    const groups = {};
    let count = 0;
    const pool = normalizeUnassignedPool(unassignedPool);
    pool.forEach((guest, index) => {
        if (!guest || !guest.name) return;
        // legacy data 可能無 side；統一當非「女方」= 男方，避免 pool 層刷新只更新一邊時「人消失」
        const isMatch = side === '男方' ? guest.side !== '女方' : guest.side === '女方';
        if (!isMatch) return;
        count++;
        const gName = getPrimaryGroup(guest);
        if (!groups[gName]) groups[gName] = [];
        ensureGuestHasId(guest);
        groups[gName].push({ data: guest, originalIndex: index });
    });
    return { groups, count };
}

function getPoolSideViewModel(side) {
    const isMale = side === '男方';
    const data = collectPoolBySide(side);
    const groups = Object.keys(data.groups).map((groupName) => ({
        name: groupName,
        items: data.groups[groupName].map((item) => ({
            id: item.data.id,
            name: item.data.name,
            originalIndex: item.originalIndex,
            chipClass: tagChipSideClasses(item.data.side === '女方' ? '女方' : '男方').pool,
        })),
    }));
    return {
        groups,
        count: data.count,
        emptyMessage: isMale ? '🎉 男方已全數安排' : '🎉 女方已全數安排',
    };
}

function notifyPoolChange(sides = ['男方', '女方']) {
    const unique = [...new Set(sides)];
    const patch = {};
    if (unique.includes('男方')) patch.male = getPoolSideViewModel('男方');
    if (unique.includes('女方')) patch.female = getPoolSideViewModel('女方');
    if (Object.keys(patch).length) uiHooks.onPoolChange?.(patch);
}

function bindPoolGuestChip(el, poolIndex, guestId, name) {
    if (!el) return;
    el.dataset.poolIndex = String(poolIndex);
    el.dataset.poolId = guestId ? String(guestId) : '';
    el.dataset.poolName = name || '';
    if (el.dataset.poolBound === '1') return;
    el.dataset.poolBound = '1';
    const getDragData = () => ({
        id: el.dataset.poolId || undefined,
        fromTable: 'POOL',
        index: Number.parseInt(el.dataset.poolIndex, 10),
        name: el.dataset.poolName || '',
    });
    if (IS_TOUCH_DEVICE) {
        setupTouchDrag(el, getDragData, { closeSidebarOnLeave: true });
    } else {
        setupDesktopGuestDrag(el, getDragData, { trackSidebarLeave: true });
    }
    bindGuestTap(el, () => openPoolGuestAtIndex(el.dataset.poolId, el.dataset.poolIndex));
}

function openPoolGuestAtIndex(guestIdOrIndex, poolIndexFallback) {
    unassignedPool = normalizeUnassignedPool(unassignedPool);
    let poolIndex = -1;
    if (guestIdOrIndex != null && String(guestIdOrIndex).trim()) {
        poolIndex = unassignedPool.findIndex(g => g?.id && String(g.id) === String(guestIdOrIndex));
    }
    if (poolIndex === -1 && poolIndexFallback != null) {
        const idx = Number.parseInt(poolIndexFallback, 10);
        if (Number.isFinite(idx) && idx >= 0 && idx < unassignedPool.length) {
            poolIndex = idx;
        }
    }
    const guest = poolIndex >= 0 ? unassignedPool[poolIndex] : null;
    if (guest?.name) openGuestModal(guest, null, null, poolIndex);
}

function finishTableDrag() {
    if (isGuestDragging) {
        cancelTableDrag();
        return;
    }
    if (isDraggingTable && draggedTableNum) {
        const tableNum = draggedTableNum;
        const bx = tableSettings[tableNum]?.x ?? tableDragStartX;
        const by = tableSettings[tableNum]?.y ?? tableDragStartY;
        const moved = Math.abs(bx - tableDragStartX) > 2 || Math.abs(by - tableDragStartY) > 2;
        if (moved) {
            suppressTableSettingsRemoteRenderCount = 2;
            tenantRef(`table_settings/${tableNum}`).update({ x: bx, y: by })
                .then(() => syncFloorLayoutBestEffort())
                .catch(err => {
                    suppressTableSettingsRemoteRenderCount = 0;
                    console.error('枱位同步失敗:', err);
                    alert('❌ 枱位儲存失敗，請確認已登入並具備畫布寫入權限（需開啟「畫布」功能開關）。');
                    if (tableSettings[tableNum]) {
                        tableSettings[tableNum].x = tableDragStartX;
                        tableSettings[tableNum].y = tableDragStartY;
                    }
                    uiHooks.onCanvasTablePositionChange?.({
                        tableNum,
                        baseX: tableDragStartX,
                        baseY: tableDragStartY,
                    });
                    uiHooks.onCanvasTableDragChange?.({ tableNum, dragging: false });
                    isDraggingTable = false;
                    draggedTableNum = null;
                    tableDragPointerId = null;
                });
        } else {
            cancelTableDrag();
            return;
        }
        uiHooks.onCanvasTableDragChange?.({ tableNum, dragging: false });
    }
    isDraggingTable = false;
    draggedTableNum = null;
    tableDragPointerId = null;
}

function bindTableDragHandlers() {
    onEvent(document, 'pointermove', (e) => {
        if (isGuestDragging || !isDraggingTable || !draggedTableNum) return;
        if (tableDragPointerId != null && e.pointerId !== tableDragPointerId) return;
        const pos = screenToCanvas(e.clientX, e.clientY);
        let bx = snapToGrid(pos.x - tableOffsetX);
        let by = snapToGrid(pos.y - tableOffsetY);
        if (bx < 0) bx = 0;
        if (by < 0) by = 0;
        if (tableSettings[draggedTableNum]) {
            tableSettings[draggedTableNum].x = bx;
            tableSettings[draggedTableNum].y = by;
        }
        uiHooks.onCanvasTablePositionChange?.({
            tableNum: draggedTableNum,
            baseX: bx,
            baseY: by,
        });
    });
    onEvent(document, 'pointerup', finishTableDrag);
    onEvent(document, 'pointercancel', finishTableDrag);
}

function allowDrop(e) { e.preventDefault(); }

function allowCanvasDrop(e) {
    if (e.target.closest('.seat-slot')) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
}

function resolveGuestAtTable(tableNum, seatIdx, guestHint = null) {
    const tableIdx = parseInt(tableNum, 10);
    if (!Number.isFinite(tableIdx) || tableIdx < 1) return guestHint || null;
    const foundIdx = findGuestIndexAtTable(tableIdx, {
        seatIdx,
        guestId: guestHint?.id,
        guestName: guestHint?.name,
    });
    if (foundIdx === -1) return guestHint || null;
    const list = allGuests[tableIdx] || allGuests[String(tableIdx)];
    return list?.[foundIdx] || guestHint || null;
}

function openGuestModal(guest, tableNum, seatIdx, poolIndex) {
    const fromPool = poolIndex != null;
    const resolved = fromPool
        ? (unassignedPool[poolIndex] || guest)
        : resolveGuestAtTable(tableNum, seatIdx, guest);
    if (!resolved) return;
    selectedGuestContext = { guest: resolved, tableNum, seatIdx, poolIndex, fromPool };
    uiHooks.onGuestModalChange?.({
        open: true,
        name: resolved.name || '',
        side: resolved.side === '女方' ? '女方' : '男方',
        group: normalizeGuestTags(resolved.group),
        seatLabel: fromPool ? '未安排' : `第 ${tableNum} 桌 - 座位 ${seatIdx + 1}`,
        fromPool,
    });
}

function closeGuestModal() {
    selectedGuestContext = null;
    uiHooks.onGuestModalChange?.({ open: false });
}

function saveGuestChangesAction(payload) {
    if (!selectedGuestContext) return Promise.resolve();
    const { guest, tableNum, seatIdx, poolIndex, fromPool } = selectedGuestContext;

    const newName = String(payload?.name ?? '').trim();
    const newGroup = normalizeGuestTags(payload?.group);
    const newSide = payload?.side === '女方' ? '女方' : '男方';

    if (!newName) {
        alert('❌ 姓名不能為空！');
        return Promise.reject(new Error('empty name'));
    }

    if (fromPool) {
        if (!unassignedPool[poolIndex]) return Promise.resolve();
        unassignedPool[poolIndex].name = newName;
        unassignedPool[poolIndex].group = newGroup;
        unassignedPool[poolIndex].side = newSide;
        localGuestRevision++;
        return persistMetaLabelColumns()
            .then(() => persistGuestState(getTableSettingKeys(), true))
            .then(() => {
                applyGuestMoveUI([], { poolChanged: true, poolSides: [newSide] });
                closeGuestModal();
            })
            .catch((err) => {
                console.error('賓客儲存失敗:', err);
                alert('❌ 賓客儲存失敗，請確認已登入並具備名單寫入權限。');
                throw err;
            });
    }

    const tableIdx = parseInt(tableNum, 10);
    const foundIdx = findGuestIndexAtTable(tableIdx, {
        seatIdx,
        guestId: guest?.id,
        guestName: guest?.name,
    });
    if (foundIdx === -1) {
        alert('❌ 找不到該座位上的賓客，請關閉視窗後重試。');
        return Promise.reject(new Error('guest not found at seat'));
    }
    allGuests[tableIdx][foundIdx].name = newName;
    allGuests[tableIdx][foundIdx].group = newGroup;
    allGuests[tableIdx][foundIdx].side = newSide;
    localGuestRevision++;

    return persistMetaLabelColumns()
        .then(() => persistGuestState([String(tableIdx)], false))
        .then(() => {
            applyGuestMoveUI([String(tableIdx)], { poolChanged: false });
            closeGuestModal();
        })
        .catch((err) => {
            console.error('賓客儲存失敗:', err);
            alert('❌ 賓客儲存失敗，請確認已登入並具備名單寫入權限。');
            throw err;
        });
}

function removeGuestFromSeatAction() {
    if (!selectedGuestContext) return;
    const { tableNum, seatIdx } = selectedGuestContext;
    const tableIdx = parseInt(tableNum);

    const foundIdx = findGuestBySeat(tableIdx, seatIdx);
    if (foundIdx !== -1) {
        let guestObj = allGuests[tableIdx][foundIdx];
        allGuests[tableIdx].splice(foundIdx, 1);
        guestObj.sort = 99;
        unassignedPool = normalizeUnassignedPool(unassignedPool);
        ensureGuestHasId(guestObj);
        const guestId = String(guestObj.id || '').trim();
        if (guestId && !unassignedPool.some(g => g?.id && String(g.id) === guestId)) {
            unassignedPool.push(guestObj);
        }

        commitGuestStateChange([String(tableNum)], {
            poolChanged: true,
            poolSides: [getGuestSideLabel(guestObj)]
        });
        closeGuestModal();
    }
}

function handleDropOnSpecificSeat(e, toTableNum, targetSeatIdx) {
    e.preventDefault();
    e.stopPropagation();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        moveGuestToSeat(data, toTableNum, targetSeatIdx);
    } catch (err) { console.error(err); }
}

function bindDragSidebarHandlers() {
    onEvent(document, 'dragover', (e) => {
        if (e.target.closest('.sidebar-content, #single-scroll-pool, .pool-group, .pool-guest-chip')) {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            return;
        }
        if (isGuestDragging) {
            openSidebarIfDragEntersSidebar(e.clientX);
        }
    });
    onEvent(document, 'drop', (e) => {
        if (!isPointOverSidebarDropZone(e.clientX, e.clientY)) return;
        handleDropTrash(e);
    }, { capture: true });
    onEvent(document, 'dragend', () => {
        isGuestDragging = false;
        cancelTableDrag();
    });
}

function handleDropTrash(e) {
    e.preventDefault();
    e.stopPropagation();
    isGuestDragging = false;
    cancelTableDrag();
    try {
        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;
        moveGuestToPool(JSON.parse(dataStr));
    } catch (err) { console.error(err); }
}

function createNewTableAction() {
    const newNum = prompt("請輸入全新圓枱桌號:");
    if (!newNum || newNum.trim() === "") return;
    const cleanNum = newNum.trim();

    if (tableSettings[cleanNum]) { alert("❌ 此桌號已存在！"); return; }
    const maxSeats = prompt(`請輸入第 ${cleanNum} 桌的人數上限：`, "12");
    const cleanMax = parseInt(maxSeats) || 12;

    const center = screenToCanvas(
        viewport.getBoundingClientRect().left + viewport.getBoundingClientRect().width / 2,
        viewport.getBoundingClientRect().top + viewport.getBoundingClientRect().height / 2
    );
    const newSettings = {
        max_seats: cleanMax,
        x: snapToGrid(center.x - PLATE_SIZE / 2),
        y: snapToGrid(center.y - TABLE_TOTAL_H / 2),
    };
    tableSettings[cleanNum] = newSettings;
    runRender();
    refreshFindTableMenu();
    suppressTableSettingsRemoteRenderCount = 1;
    tenantRef(`table_settings/${cleanNum}`).set(newSettings)
        .then(() => syncFloorLayoutBestEffort())
        .catch((err) => {
            suppressTableSettingsRemoteRenderCount = 0;
            delete tableSettings[cleanNum];
            runRender();
            refreshFindTableMenu();
            console.error('新增圓枱失敗:', err);
            alert('❌ 新增圓枱失敗，請確認已登入並有寫入權限。');
        });
}

function getMinAllowedMaxSeats(tableNum) {
    const idx = parseInt(tableNum, 10);
    const guests = (allGuests[idx] || []).filter(g => g && g.name);
    if (!guests.length) return 1;
    let maxSort = 0;
    guests.forEach(g => {
        const sort = parseInt(g.sort, 10);
        if (!isNaN(sort) && sort >= 1) maxSort = Math.max(maxSort, sort);
    });
    return Math.max(guests.length, maxSort, 1);
}

function openSettingsModal(tableNum, currentMax) {
    activeSettingTableNum = String(tableNum);
    const settings = tableSettings[activeSettingTableNum] || {};
    const minMax = getMinAllowedMaxSeats(tableNum);
    uiHooks.onTableSettingsModalChange?.({
        open: true,
        originalTableNum: activeSettingTableNum,
        tableNum: activeSettingTableNum,
        label: settings.label || '',
        maxSeats: Math.max(parseInt(currentMax, 10) || settings.max_seats || 12, minMax),
        minMaxSeats: minMax,
    });
}

function closeSettingsModal() {
    activeSettingTableNum = null;
    uiHooks.onTableSettingsModalChange?.({ open: false });
}

function saveTableSettingsAction(payload) {
    if (!activeSettingTableNum) return Promise.resolve();

    const oldNum = String(activeSettingTableNum);
    const newNumRaw = String(payload?.tableNum ?? '').trim();
    const newLabel = String(payload?.label ?? '').trim();
    const newMax = parseInt(payload?.maxSeats, 10) || 12;

    if (!newNumRaw) {
        alert('❌ 枱號不能為空！');
        return Promise.reject(new Error('empty table num'));
    }
    const newNum = String(parseInt(newNumRaw, 10));
    if (!newNum || newNum === 'NaN' || parseInt(newNum, 10) < 1) {
        alert('❌ 請輸入有效枱號（1–99）！');
        return Promise.reject(new Error('invalid table num'));
    }
    if (newNum !== oldNum && tableSettings[newNum]) {
        alert(`❌ Table ${newNum} 已存在！`);
        return Promise.reject(new Error('duplicate table num'));
    }

    const minMax = getMinAllowedMaxSeats(oldNum);
    if (newMax < minMax) {
        alert(`❌ 此桌已有 ${minMax} 位賓客，座位上限不能少於 ${minMax}！`);
        return Promise.reject(new Error('max seats too low'));
    }

    const oldSettings = tableSettings[oldNum] || {};
    const newSettings = {
        ...oldSettings,
        max_seats: newMax,
        label: newLabel,
    };

    if (newNum === oldNum) {
        tableSettings[oldNum] = { ...tableSettings[oldNum], max_seats: newMax, label: newLabel };
        return tenantRef(`table_settings/${oldNum}`).update({
            max_seats: newMax,
            label: newLabel,
        }).then(() => {
            notifyCanvasTablesChange([oldNum]);
            refreshFindTableMenu();
            scheduleFloorLayoutSync();
            closeSettingsModal();
        });
    }

    const oldIdx = parseInt(oldNum, 10);
    const newIdx = parseInt(newNum, 10);
    const guests = (allGuests[oldIdx] || []).map(g => {
        if (!g || !g.name) return g;
        return { ...g, table: newIdx };
    });

    delete tableSettings[oldNum];
    tableSettings[newNum] = newSettings;
    if (Array.isArray(allGuests)) {
        allGuests[newIdx] = guests;
        allGuests[oldIdx] = [];
    }

    const updates = {};
    updates[`table_settings/${newNum}`] = newSettings;
    updates[`table_settings/${oldNum}`] = null;
    updates[`wedding_guests/${newIdx}`] = guests;
    updates[`wedding_guests/${oldIdx}`] = null;

    return tenantRef().update(updates).then(() => persistTableSettings())
        .then(() => forceFloorLayoutSync())
        .then(() => {
            notifyCanvasTablesChange();
            refreshFindTableMenu();
            runRender();
            closeSettingsModal();
        })
        .catch(err => {
            alert(`❌ 儲存失敗：${err.message || err}`);
            throw err;
        });
}

function deleteTableAction() {
    if (!activeSettingTableNum) return Promise.resolve();

    const tableNum = String(activeSettingTableNum);
    const idx = parseInt(tableNum, 10);
    const guestsInTable = Array.isArray(allGuests[idx]) ? allGuests[idx] : [];
    if (!Array.isArray(unassignedPool)) unassignedPool = normalizeUnassignedPool(unassignedPool);

    guestsInTable.forEach(g => {
        if (g && g.name) {
            g.sort = 99;
            unassignedPool.push(g);
        }
    });
    if (Array.isArray(allGuests)) {
        allGuests[idx] = [];
    } else if (allGuests && typeof allGuests === 'object') {
        delete allGuests[idx];
        delete allGuests[String(idx)];
    }

    delete tableSettings[tableNum];
    localGuestRevision++;

    return persistTableSettings()
        .then(() => persistGuestState([tableNum], true))
        .then(() => forceFloorLayoutSync())
        .then(() => {
            runRender();
            closeSettingsModal();
        })
        .catch(err => {
            alert(`❌ 刪除失敗：${err.message || err}`);
            throw err;
        });
}

function getSeatingGuestsUsingTag(tag) {
    return getGuestsUsingTagInSeating(tag).map((g) => g.name);
}

function addSeatingCategory(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return Promise.resolve(false);
    const pool = categoriesByColumn[PRIMARY_TAG_KEY] || [];
    if (pool.includes(trimmed)) return Promise.resolve(false);
    pool.push(trimmed);
    categoriesByColumn[PRIMARY_TAG_KEY] = pool;
    return persistMetaLabelColumns()
        .then(() => {
            notifyCategoryPoolChange();
            return true;
        });
}

function removeSeatingCategory(tag) {
    const trimmed = String(tag || '').trim();
    if (!trimmed || getGuestsUsingTagInSeating(trimmed).length > 0) {
        return Promise.resolve(false);
    }
    const pool = categoriesByColumn[PRIMARY_TAG_KEY] || [];
    const idx = pool.indexOf(trimmed);
    if (idx === -1) return Promise.resolve(false);
    pool.splice(idx, 1);
    return persistMetaLabelColumns()
        .then(() => {
            notifyCategoryPoolChange();
            return true;
        });
}

function resetEngineState() {
    seatingViewBootstrapped = false;
    seatingDataReady = { guests: false, pool: false, tables: false, meta: false };
    tableSettingsMigrated = false;
    cachedMetaLabelColumns = null;
    allGuests = {};
    unassignedPool = [];
    tableSettings = {};
    zoom = 1.0;
    panX = -900;
    panY = -600;
    uiHooks = {
        onFindTableItemsChange: null,
        onTableLockChange: null,
        onGuestModalChange: null,
        onCategoryPoolChange: null,
        onTableSettingsModalChange: null,
        onGlobalStatsChange: null,
        onPrintPreviewChange: null,
        onCanvasTransformChange: null,
        onCanvasTableFlashChange: null,
        onLockButtonFlash: null,
        onSidebarChange: null,
        onPoolChange: null,
        onCanvasTablesChange: null,
        onCanvasTablePositionChange: null,
        onCanvasTableDragChange: null,
    };
    isSidebarOpen = true;
    draggedTableNum = null;
    printPreviewOpen = false;
    printPreviewHtml = '';
    printPreviewZoom = 1;
    printPreviewBuilder = null;
    nativePrintSnapshot = null;
}

export function initSeatingEngine({ tenantId, tenantRef: tenantRefProp, slug, hooks = {} }) {
    if (engineInitialized) destroySeatingEngine();
    const tid = String(tenantId || '').trim();
    if (!tid) throw new Error('Seating engine: missing tenantId');
    activeTenantId = tid;
    const refFn = tenantRefProp || ((subPath) => tenantDataDbRef(tid, subPath));
    rawTenantRef = refFn;
    tenantRefFn = createCompatTenantRef(refFn);
    tenantSlug = slug || 'default';
    uiHooks = {
        onFindTableItemsChange: hooks.onFindTableItemsChange || null,
        onTableLockChange: hooks.onTableLockChange || null,
        onGuestModalChange: hooks.onGuestModalChange || null,
        onCategoryPoolChange: hooks.onCategoryPoolChange || null,
        onTableSettingsModalChange: hooks.onTableSettingsModalChange || null,
        onGlobalStatsChange: hooks.onGlobalStatsChange || null,
        onPrintPreviewChange: hooks.onPrintPreviewChange || null,
        onCanvasTransformChange: hooks.onCanvasTransformChange || null,
        onCanvasTableFlashChange: hooks.onCanvasTableFlashChange || null,
        onLockButtonFlash: hooks.onLockButtonFlash || null,
        onSidebarChange: hooks.onSidebarChange || null,
        onPoolChange: hooks.onPoolChange || null,
        onCanvasTablesChange: hooks.onCanvasTablesChange || null,
        onCanvasTablePositionChange: hooks.onCanvasTablePositionChange || null,
        onCanvasTableDragChange: hooks.onCanvasTableDragChange || null,
    };
    viewport = document.getElementById('canvas-viewport');
    canvas = document.getElementById('main-canvas');
    if (!viewport || !canvas) throw new Error('Seating canvas DOM not found');

    // 手勢（pan/zoom）已搬去 Vue composable 綁定
    bindTableDragHandlers();
    bindDragSidebarHandlers();

    onEvent(window, 'resize', () => {
        if (!isMobileViewport()) return;
        clearTimeout(window._seatingResizeTimer);
        window._seatingResizeTimer = setTimeout(() => fitViewToTables(), 200);
    });

    applyPrintPageStyle();
    document.body.classList.add('seating-touch');
    startSeatingRealtimeSync();
    engineInitialized = true;
}

export function destroySeatingEngine() {
    dataUnsubs.forEach((u) => { try { u(); } catch (_) { /* ignore */ } });
    dataUnsubs = [];
    cleanupFns.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    cleanupFns.length = 0;
    restoreNativePrintLayout();
    document.body.classList.remove('seating-touch', 'tables-position-locked', 'print-preview-open');
    engineInitialized = false;
    rawTenantRef = null;
    tenantRefFn = null;
    activeTenantId = '';
    resetEngineState();
}

export {
    zoomCanvas,
    centerViewOnTables,
    refreshFindTableMenu,
    flyToTable,
    createNewTableAction,
    toggleTablePositionLock,
    printCanvasView,
    printGuestListView,
    toggleSidebar,
    bindPoolGuestChip,
    bindTablePlateDrag,
    bindSeatSlot,
    bindTableHub,
    closeGuestModal,
    saveGuestChangesAction,
    removeGuestFromSeatAction,
    getSeatingGuestsUsingTag,
    addSeatingCategory,
    removeSeatingCategory,
    closeSettingsModal,
    saveTableSettingsAction,
    deleteTableAction,
    closePrintPreview,
    stepPrintPreviewZoom,
    fitPrintPreviewZoom,
    autoFitPrintPreviewOnOpen,
    fitPrintPreviewGuestFonts,
    setPrintOrientation,
    executePrintPreview,
    allowDrop,
    allowCanvasDrop,
    handleDropTrash,
};
