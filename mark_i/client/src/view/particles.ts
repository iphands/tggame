/** A small pooled particle system (sprites updated by hand for full control). */
import Phaser from 'phaser';

type P = {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  age: number;
  s0: number;
  s1: number;
  a0: number;
  spin: number;
  active: boolean;
};

export type BurstOpts = {
  count: number;
  colors: number[];
  speed: [number, number];
  /** Degrees; 0 = right, -90 = up. */
  angle?: [number, number];
  life: [number, number];
  size?: [number, number];
  endScale?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
  texture?: 'px' | 'soft' | 'puff';
  add?: boolean;
  spread?: number;
  depth?: number;
};

export class Particles {
  private pool: P[] = [];

  constructor(private scene: Phaser.Scene, private max = 700) {}

  private get(): P | null {
    for (const p of this.pool) if (!p.active) return p;
    if (this.pool.length >= this.max) return null;
    const img = this.scene.add.image(0, 0, 'px').setVisible(false);
    const p: P = { img, vx: 0, vy: 0, gravity: 0, drag: 0, life: 1, age: 0, s0: 1, s1: 0, a0: 1, spin: 0, active: false };
    this.pool.push(p);
    return p;
  }

  burst(x: number, y: number, o: BurstOpts): void {
    const [amin, amax] = o.angle ?? [0, 360];
    for (let i = 0; i < o.count; i++) {
      const p = this.get();
      if (!p) return;
      const a = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(amin, amax));
      const sp = Phaser.Math.FloatBetween(o.speed[0], o.speed[1]);
      const size = o.size ? Phaser.Math.FloatBetween(o.size[0], o.size[1]) : 1;
      const spread = o.spread ?? 0;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 0;
      p.life = Phaser.Math.FloatBetween(o.life[0], o.life[1]);
      p.age = 0;
      p.s0 = size;
      p.s1 = size * (o.endScale ?? 0.2);
      p.a0 = o.alpha ?? 1;
      p.spin = Phaser.Math.FloatBetween(-6, 6);
      p.active = true;
      const tex = o.texture ?? 'px';
      const base = tex === 'px' ? 1 : tex === 'puff' ? 1 / 12 : 1 / 32;
      p.img
        .setTexture(tex)
        .setPosition(x + Phaser.Math.FloatBetween(-spread, spread), y + Phaser.Math.FloatBetween(-spread, spread))
        .setTint(o.colors[Math.floor(Math.random() * o.colors.length)])
        .setScale(size * base)
        .setAlpha(p.a0)
        .setRotation(0)
        .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setDepth(o.depth ?? 30)
        .setVisible(true);
      p.img.setData('base', base);
    }
  }

  update(dtMs: number): void {
    const s = Math.min(dtMs, 50) / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dtMs;
      if (p.age >= p.life) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      const k = p.age / p.life;
      p.vy += p.gravity * s;
      if (p.drag) {
        const f = Math.exp(-p.drag * s);
        p.vx *= f;
        p.vy *= f;
      }
      const base = p.img.getData('base') as number;
      p.img.x += p.vx * s;
      p.img.y += p.vy * s;
      p.img.rotation += p.spin * s;
      p.img.setScale((p.s0 + (p.s1 - p.s0) * k) * base);
      p.img.setAlpha(p.a0 * (1 - k * k));
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.img.setVisible(false);
    }
  }
}
