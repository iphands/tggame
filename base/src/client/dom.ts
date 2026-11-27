/** Tiny DOM helpers: the whole UI is plain elements, no framework. */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** Create an element. `class`, `style`, `on*` handlers and `data-*`/attributes are all accepted in `props`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.style.cssText = String(v);
      else if (k in el && !k.includes('-')) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/** A small deterministic tilt (degrees) from any string, so notes keep their angle between renders. */
export function tilt(seed: string, max = 3): number {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) | 0;
  return (((x >>> 0) % 1000) / 1000) * 2 * max - max;
}

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
