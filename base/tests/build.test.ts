import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildId } from '../src/server/http.js';

describe('buildId', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('is the same for the same client and changes when the client does', () => {
    fs.writeFileSync(path.join(dir, 'index.html'), '<script src="assets/index-AAA.js"></script>');
    const a = buildId(dir);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(buildId(dir)).toBe(a);
    fs.writeFileSync(path.join(dir, 'index.html'), '<script src="assets/index-BBB.js"></script>');
    expect(buildId(dir)).not.toBe(a);
  });

  it('copes with a server that has no built client', () => {
    expect(buildId(path.join(dir, 'nowhere'))).toBe('none');
  });
});
