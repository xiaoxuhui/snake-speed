const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'vendor', 'pyodide');
const output = path.join(root, 'dist', 'pyodide');
const lock = JSON.parse(fs.readFileSync(path.join(source, 'pyodide-lock.json'), 'utf8'));
const pydoc = lock.packages['pydoc-data'];
const files = ['pyodide-lock.json', 'pyodide.asm.wasm', 'python_stdlib.zip', 'LICENSE.txt', 'PYTHON-LICENSE.txt', pydoc.file_name];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256(fs.readFileSync(path.join(source, pydoc.file_name))) !== pydoc.sha256) throw new Error('pydoc package checksum mismatch');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'dist', 'LICENSE'));
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(output, file));
for (const name of ['pyodide', 'pyodide.asm']) {
  let contents = fs.readFileSync(path.join(source, name + '.mjs'), 'utf8');
  if (name === 'pyodide') {
    if (!contents.includes('pyodide.asm.mjs')) throw new Error('Unexpected Pyodide module layout');
    contents = contents.replaceAll('pyodide.asm.mjs', 'pyodide.asm.js');
  }
  fs.writeFileSync(path.join(output, name + '.js'), contents);
}
console.log('Prepared offline Pyodide runtime in dist/pyodide');
