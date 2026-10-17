import { loadCatalog } from './catalog.js';
import { scanTools } from './scanner.js';
console.log(JSON.stringify(await scanTools((await loadCatalog()).tools), null, 2));
