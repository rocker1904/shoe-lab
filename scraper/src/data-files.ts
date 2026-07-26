import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from './canonical.js';

export interface DataDir {
  read<T>(name: string): T | null;
  write(name: string, value: unknown): void;
}

export function dataDir(dir: string): DataDir {
  return {
    read<T>(name: string): T | null {
      const p = join(dir, name);
      if (!existsSync(p)) return null;
      return JSON.parse(readFileSync(p, 'utf8')) as T;
    },
    write(name: string, value: unknown): void {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), canonicalJson(value));
    },
  };
}
