import fs from 'node:fs/promises';
export async function loadCatalog() {
  return JSON.parse((await fs.readFile(new URL('../catalog/tools.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
}
