// 多租戶：從 URL 解析 slug，提供 tenantRef() 同 meta 載入
let tenantSlug = null;
let tenantId = null;
let tenantMeta = null;

function resolveTenantSlug() {
    const fromQuery = new URLSearchParams(location.search).get('slug');
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();

    const parts = location.pathname.split('/').filter(Boolean);
    const pIdx = parts.indexOf('p');
    if (pIdx >= 0 && parts[pIdx + 1]) return parts[pIdx + 1];

    return 'demo';
}

function tenantRef(subPath) {
    if (!tenantId) {
        throw new Error('Tenant 尚未初始化，請先 await whenTenantReady');
    }
    const base = `tenants/${tenantId}`;
    if (subPath == null || subPath === '') return database.ref(base);
    return database.ref(`${base}/${subPath}`);
}

function showTenantError(message) {
    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:sans-serif;background:#f3f4f6;">
            <div style="max-width:28rem;text-align:center;background:#fff;border-radius:0.75rem;padding:2rem;box-shadow:0 4px 6px rgba(0,0,0,.1);">
                <p style="font-size:2rem;margin:0 0 1rem;">⚠️</p>
                <h1 style="font-size:1.25rem;font-weight:700;color:#b91c1c;margin:0 0 0.5rem;">無法載入婚宴專案</h1>
                <p style="color:#4b5563;margin:0;">${message}</p>
            </div>
        </div>`;
}

function applyTenantBranding() {
    if (!tenantMeta) return;

    const couple = tenantMeta.couple_names || '';
    const venue = tenantMeta.venue_name || '';
    const hall = tenantMeta.venue_hall || '';
    const theme = tenantMeta.theme_color || '#b91c1c';

    if (couple) {
        document.title = couple + (document.title.includes('管理') || document.title.includes('畫布')
            ? ' — ' + document.title.split('—').pop().trim()
            : ' — 婚宴帶位');
    }

    const headerTitle = document.querySelector('header h1');
    const headerSub = document.querySelector('header p.text-xs, header .header-subtitle');
    if (headerTitle && couple) {
        headerTitle.textContent = couple;
    }
    if (headerSub) {
        const parts = [venue, hall].filter(Boolean);
        headerSub.textContent = parts.length ? parts.join(' · ') + ' 現場即時點名' : headerSub.textContent;
    }

    const header = document.querySelector('header.bg-red-700, header[class*="bg-red"]');
    if (header && theme) {
        header.style.backgroundColor = theme;
    }

    document.documentElement.style.setProperty('--tenant-theme', theme);
    appendSlugToInternalLinks();
}

function appendSlugToInternalLinks() {
    if (!tenantSlug) return;
    document.querySelectorAll('a[href]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || href.includes('slug=')) {
            return;
        }
        const sep = href.includes('?') ? '&' : '?';
        anchor.setAttribute('href', `${href}${sep}slug=${encodeURIComponent(tenantSlug)}`);
    });
}

function isAdminContext() {
    if (location.pathname.includes('/admin/')) return true;
    return new URLSearchParams(location.search).get('admin') === '1';
}

function initTenant() {
    tenantSlug = resolveTenantSlug();

    return database.ref(`slugs/${tenantSlug}`).once('value')
        .then((snap) => {
            tenantId = snap.val() || tenantSlug;
            return tenantRef('meta').once('value');
        })
        .then((snap) => {
            tenantMeta = snap.val();
            if (!tenantMeta) {
                showTenantError(`找不到專案「${tenantSlug}」。請確認 URL 或 Firebase 內 tenants/${tenantSlug}/meta 已建立。`);
                throw new Error(`Tenant not found: ${tenantSlug}`);
            }
            if (tenantMeta.status === 'expired' && !isAdminContext()) {
                showTenantError('此婚宴專案已結束，如有疑問請聯絡婚禮統籌。');
                throw new Error(`Tenant expired: ${tenantSlug}`);
            }
            applyTenantBranding();
            return tenantMeta;
        })
        .catch((err) => {
            if (!tenantMeta) console.error('Tenant 初始化失敗:', err);
            throw err;
        });
}

const whenTenantReady = initTenant();
