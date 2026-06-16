/**
 * 將 legacy seating.js 包裝為 Vue 可初始化的 ES module（一次性轉換）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '../src/seating/seatingEngine.js');
let src = readFileSync(filePath, 'utf8');

const header = `import { createCompatTenantRef } from './compatTenantRef.js';

let tenantRefFn = null;
function tenantRef(subPath) {
    if (!tenantRefFn) throw new Error('Seating engine not initialized');
    return tenantRefFn(subPath == null || subPath === '' ? '' : subPath);
}
let tenantSlug = '';
const cleanupFns = [];
let firebaseUnsubs = [];
let engineInitialized = false;

function trackCleanup(fn) {
    cleanupFns.push(fn);
}

function onEvent(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    trackCleanup(() => target.removeEventListener(type, handler, options));
}

`;

src = src.replace(/^\/\/ Firebase[^\n]*\n\n/, header);

src = src.replace(
    `const viewport = document.getElementById('canvas-viewport');
const canvas = document.getElementById('main-canvas');`,
    `let viewport = null;
let canvas = null;`,
);

// --- viewport event block: lines from wheel to contextmenu ---
const viewportBlockStart = src.indexOf("viewport.addEventListener('wheel'");
const viewportBlockEnd = src.indexOf('function getVisibleViewportCenter()');
if (viewportBlockStart === -1 || viewportBlockEnd === -1) {
    throw new Error('Could not find viewport event block');
}
const viewportBlock = src.slice(viewportBlockStart, viewportBlockEnd);
let patchedViewport = viewportBlock
    .replace(/viewport\.addEventListener\(/g, 'onEvent(viewport, ')
    .replace(/if \(!IS_TOUCH_DEVICE\) \{\n    onEvent\(viewport, 'pointerdown'/,
        `if (!IS_TOUCH_DEVICE) {
        onEvent(viewport, 'pointerdown'`);
patchedViewport = `function bindViewportEvents() {
    if (!viewport) return;
    ${patchedViewport}}
`;
src = src.slice(0, viewportBlockStart) + patchedViewport + src.slice(viewportBlockEnd);

// --- print/find menu document clicks ---
src = src.replace(
    `document.addEventListener('click', (e) => {
    if (Date.now() < printMenuIgnoreCloseUntil) return;
    if (!e.target.closest('#print-menu-wrap')) closePrintMenu();
});
document.addEventListener('click', (e) => {
    if (Date.now() < findTableMenuIgnoreCloseUntil) return;
    if (!e.target.closest('#find-table-wrap')) closeFindTableMenu();
});`,
    `function bindDocumentClickHandlers() {
    onEvent(document, 'click', (e) => {
        if (Date.now() < printMenuIgnoreCloseUntil) return;
        if (!e.target.closest('#print-menu-wrap')) closePrintMenu();
    });
    onEvent(document, 'click', (e) => {
        if (Date.now() < findTableMenuIgnoreCloseUntil) return;
        if (!e.target.closest('#find-table-wrap')) closeFindTableMenu();
    });
}`,
);

// --- table drag handlers ---
src = src.replace(
    `document.addEventListener('pointermove', (e) => {
    if (isGuestDragging || !isDraggingTable || !draggedTableElement) return;
    if (draggedTableElement.dataset.dragPointerId && e.pointerId !== parseInt(draggedTableElement.dataset.dragPointerId, 10)) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    let bx = snapToGrid(pos.x - tableOffsetX);
    let by = snapToGrid(pos.y - tableOffsetY);
    if (bx < 0) bx = 0;
    if (by < 0) by = 0;
    draggedTableElement.dataset.baseX = bx;
    draggedTableElement.dataset.baseY = by;
    draggedTableElement.style.left = \`\${bx * zoom}px\`;
    draggedTableElement.style.top = \`\${by * zoom}px\`;
});

document.addEventListener('pointerup', finishTableDrag);
document.addEventListener('pointercancel', finishTableDrag);`,
    `function bindTableDragHandlers() {
    onEvent(document, 'pointermove', (e) => {
        if (isGuestDragging || !isDraggingTable || !draggedTableElement) return;
        if (draggedTableElement.dataset.dragPointerId && e.pointerId !== parseInt(draggedTableElement.dataset.dragPointerId, 10)) return;
        const pos = screenToCanvas(e.clientX, e.clientY);
        let bx = snapToGrid(pos.x - tableOffsetX);
        let by = snapToGrid(pos.y - tableOffsetY);
        if (bx < 0) bx = 0;
        if (by < 0) by = 0;
        draggedTableElement.dataset.baseX = bx;
        draggedTableElement.dataset.baseY = by;
        draggedTableElement.style.left = \`\${bx * zoom}px\`;
        draggedTableElement.style.top = \`\${by * zoom}px\`;
    });
    onEvent(document, 'pointerup', finishTableDrag);
    onEvent(document, 'pointercancel', finishTableDrag);
}`,
);

src = src.replace(
    `document.addEventListener('dragover', (e) => {
    if (!isGuestDragging) return;
    openSidebarIfDragEntersSidebar(e.clientX);
}, { passive: true });

document.addEventListener('dragend', () => {
    isGuestDragging = false;
    cancelTableDrag();
});`,
    `function bindDragSidebarHandlers() {
    onEvent(document, 'dragover', (e) => {
        if (!isGuestDragging) return;
        openSidebarIfDragEntersSidebar(e.clientX);
    }, { passive: true });
    onEvent(document, 'dragend', () => {
        isGuestDragging = false;
        cancelTableDrag();
    });
}`,
);

// Firebase unsubs
for (const path of ['wedding_guests', 'unassigned_guests', 'meta_label_columns', 'table_settings']) {
    src = src.replace(
        `tenantRef('${path}').on('value',`,
        `firebaseUnsubs.push(tenantRef('${path}').on('value',`,
    );
}

// Remove auto-init
src = src.replace(
    `whenAdminSessionReady().then(startSeatingRealtimeSync).catch(() => {});

window.addEventListener('resize', () => {
    if (!isMobileViewport()) return;
    clearTimeout(window._seatingResizeTimer);
    window._seatingResizeTimer = setTimeout(() => fitViewToTables(), 200);
});

`,
    '',
);

src = src.replace(/\napplyPrintPageStyle\(\);\s*$/, '');

const footer = `

function exposeWindowActions(onLogout) {
    Object.assign(globalThis, {
        zoomCanvas, centerViewOnTables, toggleFindTableMenu, createNewTableAction,
        toggleTablePositionLock, togglePrintMenu, handlePrintMenuAction,
        toggleSidebar, closeGuestModal, saveGuestChangesAction, removeGuestFromSeatAction,
        closeCustomCategoryDialog, closeDeleteTagDialog, closeSettingsModal,
        saveTableSettingsAction, deleteTableAction, closePrintPreview,
        stepPrintPreviewZoom, fitPrintPreviewZoom, setPrintOrientation, executePrintPreview,
        removeModalTag, refreshModalTagColors, allowDrop, handleDropTrash,
        flyToTable, handleModalTagAdd, updateDeleteTagUsageHint,
        adminSignOut: onLogout,
    });
}

function resetEngineState() {
    seatingViewBootstrapped = false;
    seatingDataReady = { guests: false, pool: false, tables: false, meta: false };
    allGuests = [];
    unassignedPool = [];
    tableSettings = {};
    zoom = 1.0;
    panX = -900;
    panY = -600;
}

export function initSeatingEngine({ tenantRef, slug, onLogout, adminHref }) {
    if (engineInitialized) destroySeatingEngine();
    tenantRefFn = createCompatTenantRef(tenantRef);
    tenantSlug = slug || 'default';
    viewport = document.getElementById('canvas-viewport');
    canvas = document.getElementById('main-canvas');
    if (!viewport || !canvas) throw new Error('Seating canvas DOM not found');

    const backLink = document.getElementById('link-back-admin');
    if (backLink && adminHref) backLink.setAttribute('href', adminHref);

    exposeWindowActions(onLogout);
    bindViewportEvents();
    bindDocumentClickHandlers();
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
    firebaseUnsubs.forEach((u) => { try { u(); } catch (_) { /* ignore */ } });
    firebaseUnsubs = [];
    cleanupFns.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    cleanupFns.length = 0;
    document.body.classList.remove('seating-touch', 'tables-position-locked', 'print-preview-open');
    engineInitialized = false;
    resetEngineState();
}

export {
    zoomCanvas,
    centerViewOnTables,
    toggleFindTableMenu,
    createNewTableAction,
    toggleTablePositionLock,
    togglePrintMenu,
    handlePrintMenuAction,
    toggleSidebar,
    closeGuestModal,
    saveGuestChangesAction,
    removeGuestFromSeatAction,
    closeCustomCategoryDialog,
    closeDeleteTagDialog,
    closeSettingsModal,
    saveTableSettingsAction,
    deleteTableAction,
    closePrintPreview,
    stepPrintPreviewZoom,
    fitPrintPreviewZoom,
    setPrintOrientation,
    executePrintPreview,
    allowDrop,
    handleDropTrash,
    refreshModalTagColors,
};
`;

src += footer;
writeFileSync(filePath, src);
console.log('Patched seatingEngine.js OK');
