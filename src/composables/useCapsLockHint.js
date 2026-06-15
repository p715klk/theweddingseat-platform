import { computed, ref } from 'vue';

export function useCapsLockHint() {
  const capsLockOn = ref(false);
  const passwordFocused = ref(false);

  function syncCapsLock(e) {
    if (typeof e?.getModifierState === 'function') {
      capsLockOn.value = e.getModifierState('CapsLock');
    }
  }

  function onPasswordKey(e) {
    passwordFocused.value = true;
    syncCapsLock(e);
  }

  function onPasswordFocus(e) {
    passwordFocused.value = true;
    syncCapsLock(e);
  }

  function onPasswordBlur() {
    passwordFocused.value = false;
    capsLockOn.value = false;
  }

  const showCapsLockHint = computed(() => capsLockOn.value && passwordFocused.value);

  const passwordInputHandlers = {
    keydown: onPasswordKey,
    keyup: onPasswordKey,
    focus: onPasswordFocus,
    blur: onPasswordBlur,
  };

  return { showCapsLockHint, passwordInputHandlers };
}
