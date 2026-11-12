// SPDX-License-Identifier: Apache-2.0
import type { PlatformEvent } from "usnea";

/** Converts a client-space point to surface physical pixels relative to the canvas. */
function toSurface(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width > 0 ? canvas.width / rect.width : 1;
  const sy = rect.height > 0 ? canvas.height / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

/** Attaches DOM input listeners that feed `emit`; returns a function that removes them. */
export function attachInputListeners(
  canvas: HTMLCanvasElement,
  emit: (event: PlatformEvent) => void,
): () => void {
  const cleanups: Array<() => void> = [];
  const on = <T extends EventTarget>(
    target: T,
    type: string,
    handler: (e: never) => void,
    options?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, handler as EventListener, options);
    cleanups.push(() => target.removeEventListener(type, handler as EventListener, options));
  };

  const key = (down: boolean) => (e: KeyboardEvent) =>
    emit({ type: "key", code: e.code, down, repeat: e.repeat });
  on(window, "keydown", key(true));
  on(window, "keyup", key(false));

  const pointer = (phase: "down" | "move" | "up" | "cancel") => (e: PointerEvent) => {
    if (phase === "down") {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best-effort (synthetic pointers may not be capturable).
      }
    }
    const kind = e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse";
    const { x, y } = toSurface(canvas, e.clientX, e.clientY);
    emit({
      type: "pointer",
      phase,
      kind,
      id: e.pointerId,
      button: phase === "move" ? -1 : e.button,
      x,
      y,
    });
  };
  on(canvas, "pointerdown", pointer("down"));
  on(canvas, "pointermove", pointer("move"));
  on(canvas, "pointerup", pointer("up"));
  on(canvas, "pointercancel", pointer("cancel"));

  on(
    canvas,
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      emit({ type: "wheel", dx: e.deltaX, dy: e.deltaY });
    },
    { passive: false },
  );
  on(canvas, "touchmove", (e: TouchEvent) => e.preventDefault(), { passive: false });
  on(canvas, "contextmenu", (e: Event) => e.preventDefault());

  on(document, "visibilitychange", () =>
    emit({ type: "visibility", visible: document.visibilityState !== "hidden" }),
  );

  return () => {
    for (const c of cleanups.splice(0)) c();
  };
}
