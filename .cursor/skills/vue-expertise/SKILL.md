---
name: vue-expertise
description: >-
  Vue 3 frontend development with Composition API, script setup, Vue Router,
  and Pinia. Writes clean, reactive, component-based code. Use when editing
  .vue files, Vue Router routes, Pinia stores, composables, or when the user
  asks for Vue components, reactivity, or frontend UI work in this project.
---

# Vue.js Expertise

- **Vue.js Expertise:** Proficient in Vue 3, Composition API (`<script setup>`), and Vue Router/Pinia for state management. Write clean, reactive, and component-based code.

## Core rules

1. **Always Vue 3** — never suggest React, Angular, or plain HTML/JS unless explicitly requested.
2. **Always `<script setup>`** — no Options API or `defineComponent` unless matching existing legacy code.
3. **Composition API primitives** — prefer `ref`, `computed`, `watch`, `watchEffect`, and lifecycle hooks from `vue`.
4. **Component-based** — single responsibility; extract reusable logic into composables or child components.
5. **Reactive by default** — unwrap refs in `<script setup>`; use `.value` only where JS scope requires it.

## This project

| Area | Convention |
|------|------------|
| Entry | `src/main.js` — `createApp(App).use(router).mount('#app')` |
| Router | `src/router/index.js` — lazy `() => import('@/views/...')` |
| Views | `src/views/` — route-level pages, auth/tenant bootstrapping |
| Components | `src/components/{feature}/` — presentational & feature UI |
| Shared logic | `src/composables/use*.js` — module-level state & side effects |
| Utilities | `src/lib/` — pure helpers, no Vue reactivity |
| Imports | `@/` alias (e.g. `@/composables/useAuth`) |
| Language | JavaScript — match existing `.js` composables unless TS is introduced |
| Styling | Scoped `<style>` blocks + Tailwind utility classes in templates |

**State in this repo:** composables with module-scoped `ref`s (e.g. `useAuth`, `useTenant`), not Pinia. Follow that pattern here. Use Pinia only when adding cross-cutting store needs that composables cannot serve cleanly.

## Component template

```vue
<template>
  <div class="feature-host">
    <ChildWidget v-if="ready" :items="items" @select="onSelect" />
    <p v-else class="text-gray-400">載入中…</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import ChildWidget from '@/components/feature/ChildWidget.vue';
import { useFeature } from '@/composables/useFeature';

const emit = defineEmits(['select', 'close']);
const props = defineProps({
  slug: { type: String, required: true },
});

const route = useRoute();
const { items, ready, load } = useFeature();

watch(() => props.slug, load, { immediate: true });

function onSelect(id) {
  emit('select', id);
}
</script>

<style scoped>
.feature-host { /* component-specific styles only */ }
</style>
```

## Composable template

Extract when logic is reused or a view grows beyond ~80 lines of script.

```js
import { ref, computed } from 'vue';

const items = ref([]);
const loading = ref(false);
const error = ref(null);

const ready = computed(() => !loading.value && !error.value);

async function load(slug) {
  loading.value = true;
  error.value = null;
  try {
    // fetch / subscribe
  } catch (e) {
    error.value = e?.message ?? '載入失敗';
  } finally {
    loading.value = false;
  }
}

export function useFeature() {
  return { items, loading, error, ready, load };
}
```

## Vue Router

- Define routes in `src/router/index.js`.
- Lazy-load view components.
- Use `useRoute()` / `useRouter()` in `<script setup>` — not `this.$route`.
- Nested routes via `children` (see `/super` shell pattern).
- Pass `meta` for auth gates; enforce in views or `beforeEach` as needed.

## Pinia (when appropriate)

Use for shared client state that spans many unrelated components:

```js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCartStore = defineStore('cart', () => {
  const items = ref([]);
  const count = computed(() => items.value.length);
  function add(item) { items.value.push(item); }
  return { items, count, add };
});
```

Prefer composables in this repo unless Pinia is already installed and the feature clearly needs a global store.

## Reactivity checklist

- [ ] Props down, events up (`defineProps` / `defineEmits`)
- [ ] Avoid mutating props — derive with `computed` or local `ref`
- [ ] `v-for` always has a stable `:key`
- [ ] Async UI states: loading, error, empty, success
- [ ] Clean up subscriptions in `onUnmounted` (Firebase listeners, timers)
- [ ] `watch` with `{ immediate: true }` for bootstrapping; avoid redundant watchers

## Anti-patterns

- Options API in new code
- Mixing React patterns (`useState`, JSX)
- Business logic bloating templates — move to composables
- Deep prop drilling — composable or Pinia store
- `watch` without clear trigger — prefer `computed` when deriving state
- Global mutable singletons outside composables/stores

## Before finishing

1. Read surrounding files and match naming, import style, and structure.
2. Keep diffs minimal — no unrelated refactors.
3. Run linter on edited `.vue` / `.js` files when available.
