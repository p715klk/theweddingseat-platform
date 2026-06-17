import { onBeforeUnmount } from 'vue';
import { canStartCanvasPanFromTarget, getCanvasTransform, setCanvasTransform, zoomAtViewportClientPoint } from '@/seating/seatingEngine';

export function useSeatingViewportGestures(viewportRef) {
  const unsubs = [];

  function onEvent(el, type, handler, options) {
    el.addEventListener(type, handler, options);
    unsubs.push(() => el.removeEventListener(type, handler, options));
  }

  function getTouchesDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getTouchesCenterInViewport(el, touches) {
    const rect = el.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }

  function attach() {
    const viewport = viewportRef?.value;
    if (!viewport) return () => {};

    let isPanning = false;
    let panPointerId = null;
    let startX = 0;
    let startY = 0;

    let lastPinchDist = 0;
    let touchPanOrigin = null; // { x, y, panX, panY }
    let touchPanActive = false;

    const zoomFactor = 1.08;
    const clampWheelZoom = (z) => Math.min(2.5, Math.max(0.35, z));
    const clampPinchZoom = (z) => Math.min(2.5, Math.max(0.15, z));

    onEvent(viewport, 'wheel', (e) => {
      e.preventDefault();
      const { zoom } = getCanvasTransform();
      const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
      zoomAtViewportClientPoint(clampWheelZoom(nextZoom), e.clientX, e.clientY);
    }, { passive: false });

    onEvent(viewport, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!canStartCanvasPanFromTarget(e.target)) return;

      const { panX, panY } = getCanvasTransform();
      isPanning = true;
      panPointerId = e.pointerId;
      viewport.style.cursor = 'grabbing';
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    onEvent(viewport, 'pointermove', (e) => {
      if (!isPanning || e.pointerId !== panPointerId) return;
      setCanvasTransform({ panX: e.clientX - startX, panY: e.clientY - startY });
    });

    function endCanvasPan(e) {
      if (panPointerId !== null && e && e.pointerId !== panPointerId) return;
      isPanning = false;
      panPointerId = null;
      viewport.style.cursor = 'grab';
    }

    onEvent(viewport, 'pointerup', endCanvasPan);
    onEvent(viewport, 'pointercancel', endCanvasPan);

    onEvent(viewport, 'touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchPanActive = false;
        touchPanOrigin = null;
        isPanning = false;
        panPointerId = null;
        lastPinchDist = getTouchesDistance(e.touches);
        return;
      }

      if (e.touches.length === 1 && canStartCanvasPanFromTarget(e.target)) {
        touchPanActive = true;
        const { panX, panY } = getCanvasTransform();
        touchPanOrigin = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX,
          panY,
        };
      }
    }, { passive: false, capture: true });

    onEvent(viewport, 'touchmove', (e) => {
      if (e.touches.length === 2 && lastPinchDist > 0) {
        e.preventDefault();
        const dist = getTouchesDistance(e.touches);
        const scale = dist / lastPinchDist;
        const { zoom } = getCanvasTransform();
        const nextZoom = clampPinchZoom(zoom * scale);
        const center = getTouchesCenterInViewport(viewport, e.touches);
        const rect = viewport.getBoundingClientRect();
        zoomAtViewportClientPoint(nextZoom, center.x + rect.left, center.y + rect.top);
        lastPinchDist = dist;
        return;
      }

      if (e.touches.length === 1 && touchPanActive && touchPanOrigin) {
        e.preventDefault();
        setCanvasTransform({
          panX: touchPanOrigin.panX + (e.touches[0].clientX - touchPanOrigin.x),
          panY: touchPanOrigin.panY + (e.touches[0].clientY - touchPanOrigin.y),
        });
      }
    }, { passive: false, capture: true });

    onEvent(viewport, 'touchend', (e) => {
      if (e.touches.length === 0) {
        touchPanActive = false;
        touchPanOrigin = null;
        lastPinchDist = 0;
        return;
      }
      if (e.touches.length === 1) {
        lastPinchDist = 0;
        if (canStartCanvasPanFromTarget(e.target)) {
          touchPanActive = true;
          const { panX, panY } = getCanvasTransform();
          touchPanOrigin = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            panX,
            panY,
          };
        }
      }
    }, { capture: true });

    onEvent(viewport, 'touchcancel', () => {
      touchPanActive = false;
      touchPanOrigin = null;
      lastPinchDist = 0;
    }, { capture: true });

    onEvent(viewport, 'contextmenu', (e) => e.preventDefault());

    return () => {
      unsubs.splice(0).forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    };
  }

  onBeforeUnmount(() => {
    unsubs.splice(0).forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  });

  return { attach };
}

