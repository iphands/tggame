/**
 * The shared page. For the drawer it turns pointer input into strokes and
 * streams them out while they are being drawn; for everyone else it paints
 * what arrives. Either way it works on the stroke list it was given by `load`.
 */
import { DRAW_LIMITS, ERASER, ERASER_NIBS, NIBS, PAGE_H, PAGE_W } from '../../shared/src/constants';
import type { Drawing, Stroke } from '../../shared/src/types';
import { paint, paintStroke } from './render';

/** Ink is sent at most this often while a stroke is in progress. */
const FLUSH_MS = 45;

export class DrawPad {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private strokes: Drawing = [];
  private undone: Drawing = [];
  /** The stroke under the pointer; already the last entry of `strokes`. */
  private live: Stroke | null = null;
  /** Points of `live` already handed to `onInk`. */
  private sent = 0;
  private lastFlush = 0;
  private pointerId: number | null = null;
  private scale = 1;
  private readonly ro: ResizeObserver;
  private canDraw = false;

  color = 0;
  nib = 1;
  erasing = false;
  /** New points for stroke `i` (a new stroke when `i` is one past the last one sent). */
  onInk: (i: number, c: number, w: number, p: number[]) => void = () => {};
  onUndo: () => void = () => {};
  onClear: () => void = () => {};
  /** Called after every change to the stroke list made here. */
  onChange: () => void = () => {};
  /** Called when a stroke is refused because the page is full. */
  onFull: () => void = () => {};

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pad-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.el = document.createElement('div');
    this.el.className = 'pad paper-sheet';
    this.el.append(this.canvas);

    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    // long-press menus and pinch gestures have no business on a drawing surface
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  destroy(): void {
    this.ro.disconnect();
  }

  /** Whether pointer input draws. Turning it off drops a stroke in progress where it is. */
  get enabled(): boolean {
    return this.canDraw;
  }
  set enabled(on: boolean) {
    this.canDraw = on;
    this.el.classList.toggle('live', on);
    if (!on) this.letGo();
  }

  get hasInk(): boolean {
    return this.strokes.length > 0;
  }
  get canUndo(): boolean {
    return this.strokes.length > 0 && !this.live;
  }
  get canRedo(): boolean {
    return this.undone.length > 0 && !this.live;
  }

  /** Show `strokes` and keep working on that very list. */
  load(strokes: Drawing): void {
    this.letGo();
    this.strokes = strokes;
    this.undone = [];
    this.repaint();
  }

  /** Stroke `i` of the list grew from point `from` on (someone else drew it): paint just that. */
  grew(i: number, from: number): void {
    const s = this.strokes[i];
    if (s) paintStroke(this.ctx, s, this.scale, Math.max(0, from - 1));
  }

  repaint(): void {
    paint(this.ctx, this.strokes, this.scale);
  }

  undo(): void {
    if (!this.canUndo) return;
    this.undone.push(this.strokes.pop()!);
    this.repaint();
    this.onUndo();
    this.onChange();
  }

  redo(): void {
    if (!this.canRedo) return;
    const s = this.undone.pop()!;
    this.strokes.push(s);
    this.repaint();
    this.onInk(this.strokes.length - 1, s.c, s.w, s.p);
    this.onChange();
  }

  clear(): void {
    if (!this.strokes.length || this.live) return;
    this.strokes.length = 0;
    this.undone = [];
    this.repaint();
    this.onClear();
    this.onChange();
  }

  // ---- internals

  private resize(): void {
    const rect = this.el.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    if (w === this.canvas.width) return;
    this.canvas.width = w;
    this.canvas.height = Math.round((w * PAGE_H) / PAGE_W);
    this.scale = w / PAGE_W;
    this.repaint();
  }

  private points(): number {
    return this.strokes.reduce((n, s) => n + s.p.length / 2, 0);
  }

  private toPage(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * PAGE_W;
    const y = ((e.clientY - r.top) / r.height) * PAGE_H;
    return [Math.max(0, Math.min(PAGE_W, Math.round(x))), Math.max(0, Math.min(PAGE_H, Math.round(y)))];
  }

  /** Start a stroke at a point; false when the page has no room for one. */
  private begin(c: number, w: number, x: number, y: number): boolean {
    if (this.strokes.length >= DRAW_LIMITS.maxStrokes || this.points() >= DRAW_LIMITS.maxPoints - 50) return false;
    this.live = { c, w, p: [x, y] };
    this.strokes.push(this.live);
    this.undone = [];
    this.sent = 0;
    this.flush();
    return true;
  }

  private flush(): void {
    const s = this.live;
    if (!s || s.p.length / 2 <= this.sent) return;
    this.onInk(this.strokes.length - 1, s.c, s.w, s.p.slice(this.sent * 2));
    this.sent = s.p.length / 2;
    this.lastFlush = performance.now();
  }

  private end(): void {
    this.flush();
    this.live = null;
    this.onChange();
  }

  private letGo(): void {
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        /* capture already gone */
      }
    }
    this.pointerId = null;
    this.live = null;
  }

  private down = (e: PointerEvent): void => {
    if (!this.canDraw || this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const [x, y] = this.toPage(e);
    if (!this.begin(this.erasing ? ERASER : this.color, (this.erasing ? ERASER_NIBS : NIBS)[this.nib], x, y)) {
      this.onFull();
      return;
    }
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    paintStroke(this.ctx, this.live!, this.scale);
    this.onChange();
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId || !this.live) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      if (!this.live) break;
      const p = this.live.p;
      const [x, y] = this.toPage(ev);
      const dx = x - p[p.length - 2];
      const dy = y - p[p.length - 1];
      if (dx * dx + dy * dy < 9) continue;
      p.push(x, y);
      const n = p.length / 2;
      paintStroke(this.ctx, this.live, this.scale, Math.max(0, n - 3), n - 1);
      // a stroke as long as the wire allows: finish it and carry on with a fresh one from the same spot
      if (n >= DRAW_LIMITS.maxPointsPerStroke) {
        const { c, w } = this.live;
        this.end();
        if (!this.begin(c, w, x, y)) {
          this.pointerId = null;
          this.onFull();
        }
      }
    }
    if (performance.now() - this.lastFlush >= FLUSH_MS) this.flush();
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (!this.live) return;
    this.end();
    this.repaint();
  };
}
