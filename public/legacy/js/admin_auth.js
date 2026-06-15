// 後台 Email/Password 登入（admin / seating 頁用）
const adminAuth = firebase.auth();

adminAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
    console.warn('Auth persistence 設定失敗:', err);
});

function waitForAdminUser() {
    if (adminAuth.currentUser) {
        return Promise.resolve(adminAuth.currentUser);
    }
    return new Promise((resolve) => {
        const unsub = adminAuth.onAuthStateChanged((user) => {
            if (user) {
                unsub();
                resolve(user);
            }
        });
    });
}

let authUiInitialized = false;
let showLoginOverlayTimer = null;

function setLoginOverlayVisible(visible) {
    const overlay = document.getElementById('admin-login-overlay');
    const errEl = document.getElementById('admin-login-error');
    if (!overlay) return;
    if (visible) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
        errEl?.classList.add('hidden');
    }
}

adminAuth.onAuthStateChanged((user) => {
    clearTimeout(showLoginOverlayTimer);

    if (user) {
        authUiInitialized = true;
        setLoginOverlayVisible(false);
        return;
    }

    // 等 Firebase 從 IndexedDB 還原 session（同 Vue 登入共用），避免一入頁就彈登入
    const delay = authUiInitialized ? 100 : 1200;
    showLoginOverlayTimer = setTimeout(() => {
        authUiInitialized = true;
        if (!adminAuth.currentUser) {
            setLoginOverlayVisible(true);
        }
    }, delay);
});

function handleAdminLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('admin-login-email')?.value?.trim();
    const password = document.getElementById('admin-login-password')?.value || '';
    const errEl = document.getElementById('admin-login-error');
    if (!email || !password) return false;

    adminAuth.signInWithEmailAndPassword(email, password)
        .catch((err) => {
            if (errEl) {
                errEl.textContent = err.message || '登入失敗';
                errEl.classList.remove('hidden');
            }
        });
    return false;
}

function adminSignOut() {
    return adminAuth.signOut().then(() => {
        location.reload();
    });
}

function whenAdminSessionReady() {
    return whenTenantReady.then(() => waitForAdminUser());
}
