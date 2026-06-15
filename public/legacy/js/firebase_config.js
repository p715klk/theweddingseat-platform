// 自動生成 — npm run sync:legacy-config（來源 .env.local）
const firebaseConfig = {
    "databaseURL": "https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app",
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
