// 自動生成 — npm run sync:legacy-config（來源 .env.local）
const firebaseConfig = {
<<<<<<< HEAD
    "databaseURL": "https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app",
=======
    "apiKey": "AIzaSyA075znd53lbm7RcaAAlFzrWKmysy7o8Sg",
    "authDomain": "theweddingseat-prod.firebaseapp.com",
    "databaseURL": "https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app/",
    "projectId": "theweddingseat-prod",
    "storageBucket": "theweddingseat-prod.firebasestorage.app",
    "messagingSenderId": "727373308491",
    "appId": "1:727373308491:web:f4ecde3c90dd0b170f23ce"
>>>>>>> 34dfe08 (Remove legacy Firebase configuration file to streamline project structure and enhance security by eliminating hardcoded credentials.)
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
