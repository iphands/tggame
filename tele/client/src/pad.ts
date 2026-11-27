/** The drawing pad: pointer input → vector strokes, with undo/redo. */
import { DRAW_LIMITS, ERASER, ERASER_NIBS, NIBS, PAGE_H, PAGE_W } from '../../shared/src/constants';
import { simplify, splitStroke } from '../../shared/src/drawing';
import type { Drawing, Stroke } from '../../shared/src/types';
import { isFill } from '@tggame/base/party/draw/fill';
import { paint, paintFill, paintStroke } from '@tggame/base/party/draw/paint';

export class DrawPad {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private strokes: Drawing = [];
  private undone: Drawing = [];
  private live: Stroke | null = null;
  private pointerId: number | null = null;
  private scale = 1;
  private readonly ro: ResizeObserver;

  color = 0;
  nib = 1;
  erasing = false;
  /** Bucket mode: a tap floods with the current colour instead of starting a line. */
  filling = false;
  /** Called after every committed change (stroke, undo, redo, clear). */
  onChange: () => void = () => {};
  /** Called when a stroke is refused because the page is full. */
  onFull: () => void = () => {};

  constructor(initial: Drawing = []) {
    this.strokes = initial.slice();
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

  get drawing(): Drawing {
    return this.strokes;
  }
  get canUndo(): boolean {
    return this.strokes.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  undo(): void {
    const s = this.strokes.pop();
    if (!s) return;
    this.undone.push(s);
    this.repaint();
    this.onChange();
  }

  redo(): void {
    const s = this.undone.pop();
    if (!s) return;
    this.strokes.push(s);
    this.repaint();
    this.onChange();
  }

  clear(): void {
    if (!this.strokes.length) return;
    this.strokes = [];
    this.undone = [];
    this.repaint();
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

  private repaint(): void {
    paint(this.ctx, this.strokes, this.scale);
    if (this.live) paintStroke(this.ctx, this.live, this.scale);
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

  private down = (e: PointerEvent): void => {
    if (this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    if (this.strokes.length >= DRAW_LIMITS.maxStrokes - 4 || this.points() >= DRAW_LIMITS.maxPoints - DRAW_LIMITS.maxPointsPerStroke) {
      this.onFull();
      return;
    }
    const [x, y] = this.toPage(e);
    if (this.filling && !this.erasing) {
      // bucket tap: one fill stroke, no dragging
      if (this.strokes.filter(isFill).length >= DRAW_LIMITS.maxFills) return this.onFull();
      const s: Stroke = { c: this.color, w: NIBS[0], p: [x, y], f: 1 };
      paintFill(this.ctx, this.strokes, s, this.scale);
      this.strokes.push(s);
      this.undone = [];
      this.onChange();
      return;
    }
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.live = {
      c: this.erasing ? ERASER : this.color,
      w: (this.erasing ? ERASER_NIBS : NIBS)[this.nib],
      p: [x, y],
    };
    paintStroke(this.ctx, this.live, this.scale);
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId || !this.live) return;
    e.preventDefault();
    const p = this.live.p;
    const before = p.length / 2;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this.toPage(ev);
      const dx = x - p[p.length - 2];
      const dy = y - p[p.length - 1];
      if (dx * dx + dy * dy >= 4) p.push(x, y);
    }
    const after = p.length / 2;
    if (after > before) paintStroke(this.ctx, this.live, this.scale, Math.max(0, before - 2), after - 1);
    // runaway stroke: commit it and carry on with a fresh one from the same spot
    if (after >= DRAW_LIMITS.maxPointsPerStroke * 3) {
      const last = p.slice(-2);
      const { c, w } = this.live;
      this.commit();
      this.live = { c, w, p: last };
    }
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.commit();
    this.live = null;
    this.repaint();
  };

  private commit(): void {
    if (!this.live) return;
    const s: Stroke = { ...this.live, p: simplify(this.live.p, 1.2) };
    this.strokes.push(...splitStroke(s));
    this.undone = [];
    this.live = null;
    this.onChange();
  }
}
