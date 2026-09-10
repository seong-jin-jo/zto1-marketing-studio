import { readFile, writeFile } from 'node:fs/promises';

const htmlPath = new URL('../docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html', import.meta.url);
const vendorPath = new URL('file:///Users/sj/.claude/skills/gstack/design-html/vendor/pretext.js');
const start = '    /* PRETEXT_BUNDLE_START */';
const end = '    /* PRETEXT_BUNDLE_END */';
const html = await readFile(htmlPath, 'utf8');
let vendor = await readFile(vendorPath, 'utf8');
vendor = vendor.replace(/export\{\$1 as walkLineRanges,D1 as setLocale,V1 as profilePrepare,Y1 as prepareWithSegments,X1 as prepare,q1 as layoutWithLines,Q1 as layoutNextLine,Z1 as layout,aO as clearCache\};?\s*$/, 'window.Pretext={walkLineRanges:$1,setLocale:D1,profilePrepare:V1,prepareWithSegments:Y1,prepare:X1,layoutWithLines:q1,layoutNextLine:Q1,layout:Z1,clearCache:aO};');
if (!vendor.includes('window.Pretext=')) throw new Error('Pretext export signature changed');
const from = html.indexOf(start);
const to = html.indexOf(end);
if (from < 0 || to < 0 || to <= from) throw new Error('Pretext markers missing');
const next = `${html.slice(0, from + start.length)}\n${vendor}\n${html.slice(to)}`;
await writeFile(htmlPath, next);
console.log(`embedded Pretext bytes=${vendor.length}`);
