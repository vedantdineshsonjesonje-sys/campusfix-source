/* Tiny browser interface for local AI; no service credentials or report uploads. */
(function () {
  'use strict';
  const scriptURL = document.currentScript?.src || new URL('ai-client.js', document.baseURI).href;
  const workerURL = new URL('ai-worker.mjs', scriptURL);
  const pending = new Map();
  let worker;
  let serial = 0;
  let status = 'idle';
  const TIMEOUT_MS = 120000;
  function stop(error) {
    worker?.terminate();
    worker = null;
    status = 'error';
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
  function getWorker() {
    if (location.protocol === 'file:') throw new Error('AI needs the local server. Run npm start, then open http://127.0.0.1:4173.');
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new Error('AI needs a modern browser with Web Workers and WebAssembly.');
    if (!worker) {
      worker = new Worker(workerURL, { type: 'module', name: 'CampusFix local AI' });
      worker.addEventListener('message', event => {
        const message = event.data;
        const request = message && pending.get(message.id);
        if (!request) return;
        if (message.type === 'progress') { if (request.onProgress) request.onProgress(message.message); return; }
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.type === 'result') { status = 'ready'; request.resolve(message.result); }
        else { status = 'error'; request.reject(new Error(message.message || 'AI analysis failed. Please try again.')); }
      });
      worker.addEventListener('error', () => stop(new Error('AI could not start. Run npm start and check that the bundled model and runtime files are present.')));
      worker.addEventListener('messageerror', () => stop(new Error('AI could not read this report. Please try again.')));
    }
    return worker;
  }
  function request(type, payload, onProgress) {
    return new Promise((resolve, reject) => {
      let active;
      try { active = getWorker(); }
      catch (error) { status = 'error'; reject(error); return; }
      const id = 'ai-' + (++serial);
      status = 'loading';
      const timer = setTimeout(() => stop(new Error('AI took too long to respond. Try again with a shorter description.')), TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer, onProgress: typeof onProgress === 'function' ? onProgress : null });
      try { active.postMessage({ id, type, payload }); }
      catch (error) { clearTimeout(timer); pending.delete(id); status = 'error'; reject(new Error('AI could not read this report. Please try again.')); }
    });
  }
  window.CampusAI = Object.freeze({
    analyze(input, onProgress) { return request('analyze', input, onProgress); },
    warmup(onProgress) { return request('warmup', null, onProgress); },
    getStatus() { return status; }
  });
})();
