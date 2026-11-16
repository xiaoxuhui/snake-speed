# 贪吃蛇 · Python 自动控制

网页贪吃蛇支持手动操作和使用 Python 编程控制。离线版本使用 Pyodide 314.0.7，解释器运行在独立 Worker 中。

执行 `node scripts/build-offline.cjs` 将仓库内的固定运行时复制到 `dist/pyodide`。通过 HTTP 服务打开 `dist/index.html`。运行环境需要支持 WebAssembly、Worker 和 JavaScript 模块。WebAssembly 文件必须以 `application/wasm` 类型提供。

`node --test tests/python-control.cjs` 验证移动逻辑。`node tests/offline-browser.cjs` 验证浏览器离线执行 Python，测试需要本机 Playwright 和 Chromium。

项目代码采用 MIT 许可。Pyodide 及 Python 的许可分别随运行时保存在 `dist/pyodide/LICENSE.txt` 和 `dist/pyodide/PYTHON-LICENSE.txt`。
