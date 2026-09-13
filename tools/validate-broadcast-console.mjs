import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('broadcast/index.html','utf8');
const css=fs.readFileSync('broadcast/broadcast.css','utf8');
const js=fs.readFileSync('broadcast/broadcast.js','utf8');

assert.match(html,/Chépica Play · Broadcast/);
assert.match(html,/sólo lectura/i);
assert.match(html,/broadcast\.css/);
assert.match(html,/broadcast\.js/);
assert.match(html,/id="feedUrl"/);
assert.match(html,/id="copyUrl"/);
assert.match(html,/id="content"/);

assert.match(js,/cudo-sports-event-bus\.carlos-valdes-morales\.workers\.dev/);
assert.match(js,/\/vmix\/fecha\/\$\{round\}\.json/);
assert.match(js,/const POLL_MS=3000/);
assert.match(js,/status_label==='INFORMADO'/);
assert.match(js,/status_label==='OFICIAL'/);
assert.match(js,/home_crest_url/);
assert.match(js,/away_crest_url/);
assert.doesNotMatch(js,/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'broadcast console must remain read-only');
assert.doesNotMatch(js,/localStorage|sessionStorage/,'broadcast console must not become a second data store');

assert.match(css,/\.chip-reported/);
assert.match(css,/\.chip-official/);
assert.match(css,/@media/);

console.log('BROADCAST_CONSOLE_CONTRACT_OK');
