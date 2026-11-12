// SPDX-License-Identifier: Apache-2.0

/** A live drawable surface that tracks the canvas CSS size and devicePixelRatio. */
export interface WebSurface {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly native: HTMLCanvasElement;
}

/** Creates a surface and keeps the canvas backing size in sync; calls `onChange` after changes. */
export function createSurface(
  canvas: HTMLCanvasElement,
  onChange: (width: number, height: number, pixelRatio: number) => void,
): { surface: WebSurface; dispose(): void } {
  let pixelRatio = window.devicePixelRatio || 1;

  const sync = (): void => {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (width === canvas.width && height === canvas.height && ratio === pixelRatio) return;
    pixelRatio = ratio;
    canvas.width = width;
    canvas.height = height;
    onChange(width, height, ratio);
  };

  const observer = new ResizeObserver(sync);
  observer.observe(canvas);

  let media: MediaQueryList | undefined;
  const onRatio = (): void => {
    sync();
    watchRatio();
  };
  const watchRatio = (): void => {
    media?.removeEventListener("change", onRatio);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    media.addEventListener("change", onRatio);
  };
  watchRatio();
  sync();

  const surface: WebSurface = {
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
    get pixelRatio() {
      return pixelRatio;
    },
    native: canvas,
  };
  return {
    surface,
    dispose() {
      observer.disconnect();
      media?.removeEventListener("change", onRatio);
    },
  };
}
