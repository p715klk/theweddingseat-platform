// 後台 Email/Password 登入（admin / seating 頁用）
const adminAuth = firebase.auth();

let adminSessionResolve;
const whenAdminAuthed = new Promise((resolve) => {
    adminSessionResolve = resolve;
});

adminAuth.onAuthStateChanged((user) => {
    const overlay = document.getElementById('admin-login-overlay');
    const errEl = document.getElementById('admin-login-error');
    if (user) {
        overlay?.classList.add('hidden');
        errEl?.classList.add('hidden');
        adminSessionResolve(user);
    } else {
        overlay?.classList.remove('hidden');
    }
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
    return whenTenantReady.then(() => whenAdminAuthed);
}
