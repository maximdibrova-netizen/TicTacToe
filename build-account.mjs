import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const options={ absWorkingDir: root, bundle: true, minify: true, platform: 'browser', target: ['es2020'], format: 'iife', legalComments: 'eof', sourcemap: false };
await build({...options,entryPoints:['src/account/entry.js'],outfile:'account.js'});
await build({...options,entryPoints:['src/ratings/game.js'],outfile:'game-rating.js'});
