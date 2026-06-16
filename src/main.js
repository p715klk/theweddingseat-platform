import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { setupChunkReloadHandlers } from '@/lib/chunkReload';
import './assets/index.css';
import './assets/admin.css';

setupChunkReloadHandlers(router);

createApp(App).use(router).mount('#app');
