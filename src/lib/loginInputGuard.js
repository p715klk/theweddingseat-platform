/** CJK 及全形字元 — login email / password 不允許輸入 */
const CJK_PATTERN = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/g;

export function stripCjkFromLogin(value) {
  return String(value ?? '').replace(CJK_PATTERN, '');
}

export function createLoginInputHandlers(modelRef) {
  let composing = false;

  function sanitize(e) {
    const el = e.target;
    if (!el) return;
    const cleaned = stripCjkFromLogin(el.value);
    if (cleaned !== el.value) el.value = cleaned;
    modelRef.value = cleaned;
  }

  return {
    compositionstart: () => {
      composing = true;
    },
    compositionend: (e) => {
      composing = false;
      sanitize(e);
    },
    input: (e) => {
      if (!composing) sanitize(e);
    },
  };
}

export function mergeInputHandlers(...handlerGroups) {
  const eventNames = ['compositionstart', 'compositionend', 'input', 'keydown', 'keyup', 'focus', 'blur'];
  const merged = {};

  for (const name of eventNames) {
    const handlers = handlerGroups.map((group) => group?.[name]).filter(Boolean);
    if (!handlers.length) continue;
    merged[name] = (e) => {
      for (const fn of handlers) fn(e);
    };
  }

  return merged;
}

export const loginEmailInputAttrs = {
  lang: 'en',
  inputmode: 'email',
  autocapitalize: 'off',
  spellcheck: 'false',
};

export const loginPasswordInputAttrs = {
  lang: 'en',
  autocapitalize: 'off',
  spellcheck: 'false',
};
