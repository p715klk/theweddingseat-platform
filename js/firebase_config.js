// 平台版 Firebase 設定 — 只喺呢度改 databaseURL
const firebaseConfig = {
    databaseURL: "https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
