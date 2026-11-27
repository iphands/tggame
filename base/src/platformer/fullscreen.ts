/**
 * True full screen on phones.
 * - Android / desktop / iPad: the Fullscreen API (must be called from a tap),
 *   then lock to landscape (only allowed while fullscreen).
 * - iPhone Safari has no Fullscreen API for pages: installing the web app
 *   ("Add to Home Screen") launches it with no browser chrome at all.
 */

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

export function canFullscreen(): boolean {
  const el = document.documentElement as FsElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  const d = document as FsDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Launched from the home screen as an installed app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function enterFullscreen(): Promise<void> {
  if (isFullscreen() || isStandalone()) return;
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return; // refused (no gesture, iframe, …): stay windowed
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* not supported: the portrait gate covers us */
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (!isFullscreen()) return enterFullscreen();
  const d = document as FsDocument;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}
