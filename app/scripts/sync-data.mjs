import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../data/shoes.json', import.meta.url));
const dst = fileURLToPath(new URL('../public/shoes.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../public', import.meta.url)), { recursive: true });
copyFileSync(src, dst);
