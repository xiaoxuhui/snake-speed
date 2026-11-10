const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const bridgeRoot = process.env.TURBOWARP_BRIDGE || path.resolve(__dirname, '../../turbowarp-codex-bridge');
const bridge = createRequire(path.join(bridgeRoot, 'package.json'));
const { chromium } = createRequire(bridge.resolve('@playwright/mcp/package.json'))('playwright');
const config = require(path.join(bridgeRoot, 'config/playwright.json'));
const root = path.resolve(__dirname, '../dist');

async function main() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { console.log('missing', url.pathname); response.writeHead(404).end(); return; }
    const ext = path.extname(file);
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm' }[ext] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    const external = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('browser:', message.text()); });
    page.on('worker', worker => {
      worker.on('console', message => console.log('worker:', message.type(), message.text()));
      worker.on('close', () => console.log('worker closed'));
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      external.push(url.href);
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#python-code').fill('import math\nprint("offline", math.isqrt(81))\nprint("D")');
    await page.locator('#python-run').click();
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('#python-runtime').dataset.state), null, { timeout: 30000 }).catch(async error => {
      console.log('runtime:', await page.locator('#python-runtime').textContent());
      console.log('output:', await page.locator('#python-output').textContent());
      throw error;
    });
    assert.equal(await page.locator('#python-runtime').getAttribute('data-state'), 'ready', await page.locator('#python-output').textContent());
    await page.waitForFunction(() => document.querySelector('#python-output').textContent.includes('offline 9'), null, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('#python-run').disabled === false, null, { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => window.snakeGame.snapshot().head), [1, 0]);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('PASS offline CPython startup, standard library and snake movement');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
