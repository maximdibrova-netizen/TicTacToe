import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
await build({ absWorkingDir: root, entryPoints: ['src/account/app.js'], outfile: 'account.js', bundle: true, minify: true, platform: 'browser', target: ['es2020'], format: 'iife', legalComments: 'eof', sourcemap: false });
