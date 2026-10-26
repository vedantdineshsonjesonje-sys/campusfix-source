// The model and ONNX runtime are served by this app. Report text never leaves it.
import { env, pipeline } from './vendor/transformers/transformers.min.js';
import './ai-core.js';

const core = globalThis.CampusAICore;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.useBrowserCache = true;

let extractorPromise;
let prototypeVectors;
let currentRequest;
let requestQueue = Promise.resolve();
const vectorCache = new Map();
const CACHE_LIMIT = 200;
const progress = message => { if (currentRequest) self.postMessage({ id: currentRequest, type: 'progress', message }); };

async function extractor() {
  if (!extractorPromise) {
    progress('Loading the local AI model…');
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8', device: 'wasm', local_files_only: true,
      progress_callback(event) {
        if (event.status === 'progress' && /\.onnx$/.test(event.file || '')) progress('Loading AI model: ' + Math.min(100, Math.round(event.progress || 0)) + '%');
        else if (event.status === 'ready') progress('AI model ready. Reading your report…');
      }
    }).catch(error => { extractorPromise = null; throw error; });
  }
  return extractorPromise;
}
function remember(key, vector) {
  if (vectorCache.has(key)) vectorCache.delete(key);
  vectorCache.set(key, vector);
  while (vectorCache.size > CACHE_LIMIT) vectorCache.delete(vectorCache.keys().next().value);
}
async function embed(texts) {
  const model = await extractor();
  const unique = [...new Set(texts.filter(Boolean))];
  const missing = unique.filter(value => !vectorCache.has(value));
  const vectors = new Map(unique.filter(value => vectorCache.has(value)).map(value => [value, vectorCache.get(value)]));
  // Bounded batches keep even long campus queues responsive and memory use modest.
  for (let offset = 0; offset < missing.length; offset += 8) {
    const batch = missing.slice(offset, offset + 8);
    const tensor = await model(batch, { pooling: 'mean', normalize: true });
    const embeddings = tensor.tolist();
    batch.forEach((value, index) => { vectors.set(value, embeddings[index]); remember(value, embeddings[index]); });
    tensor.dispose?.();
  }
  return texts.map(value => value ? vectors.get(value) : null);
}
async function warmup() {
  await extractor();
  if (!prototypeVectors) {
    progress('Preparing AI category suggestions…');
    prototypeVectors = await embed(core.PROTOTYPES.map(prototype => prototype.text));
  }
}
async function analyze(payload) {
  const input = core.sanitizeInput(payload);
  await warmup();
  progress('Comparing the meaning of your report with campus categories…');
  const queryText = core.reportText(input);
  const queryVectors = await embed([queryText, input.location]);
  const classification = core.rankClassification(queryVectors[0], prototypeVectors);
  progress('Checking related reports…');
  const texts = input.issues.flatMap(issue => [core.reportText(issue), issue.location]);
  const embeddings = await embed(texts);
  const candidates = input.issues.map((issue, index) => ({ id: issue.id, vector: embeddings[index * 2], locationVector: embeddings[index * 2 + 1] }));
  return { ...classification, duplicates: core.rankDuplicates(queryVectors[0], queryVectors[1], candidates), model: 'MiniLM-L6-v2', source: 'local-model' };
}
self.addEventListener('message', event => {
  const request = event.data;
  if (!request || !['analyze', 'warmup'].includes(request.type) || typeof request.id !== 'string') return;
  requestQueue = requestQueue.catch(() => {}).then(async () => {
    currentRequest = request.id;
    try {
      let result;
      if (request.type === 'warmup') { await warmup(); result = { model: 'MiniLM-L6-v2', source: 'local-model' }; }
      else result = await analyze(request.payload);
      self.postMessage({ id: request.id, type: 'result', result });
    } catch (error) {
      // Do not expose arbitrary model/runtime diagnostics in the public interface.
      console.error('CampusFix local AI:', error);
      self.postMessage({ id: request.id, type: 'error', message: 'The local AI model could not be loaded. Restart CampusFix with npm start and try again.' });
    } finally { currentRequest = null; }
  });
});
