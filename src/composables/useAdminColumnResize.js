import { onMounted, onUnmounted, nextTick, watch } from 'vue';

function attachResizers(theadRowEl) {
  if (!theadRowEl) return () => {};

  const cleanups = [];

  theadRowEl.querySelectorAll('th').forEach((th) => {
    if (th.querySelector('.col-resizer')) return;

    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    resizer.title = '拖拉調整欄寬';
    resizer.setAttribute('aria-label', '拖拉調整欄寬');
    th.appendChild(resizer);

    let startX;
    let startWidth;

    function drag(e) {
      const width = startWidth + (e.pageX - startX);
      const minW = parseInt(th.dataset.minWidth, 10) || 32;
      if (width >= minW) th.style.width = `${width}px`;
    }

    function stopDrag() {
      resizer.classList.remove('resizing');
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', stopDrag);
    }

    function onMouseDown(e) {
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      resizer.classList.add('resizing');
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
    }

    resizer.addEventListener('mousedown', onMouseDown);
    cleanups.push(() => {
      resizer.removeEventListener('mousedown', onMouseDown);
      resizer.remove();
    });
  });

  return () => cleanups.forEach((fn) => fn());
}

export function useAdminColumnResize(theadRowRef, ready) {
  let cleanup = null;

  function init() {
    cleanup?.();
    cleanup = attachResizers(theadRowRef.value);
  }

  onMounted(() => nextTick(init));

  watch(ready, (isReady) => {
    if (isReady) nextTick(init);
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return { init };
}
