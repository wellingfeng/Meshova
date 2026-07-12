import { PROC_MODELS } from "/web/procmodels.js?v=gamemap1";

self.onmessage = async (event) => {
  const { requestId, modelId, params, context } = event.data || {};
  try {
    const model = PROC_MODELS[modelId];
    if (!model) throw new Error(`未知程序化模型: ${modelId}`);
    const startedAt = performance.now();
    const parts = await model.build(params, context);
    self.postMessage({
      requestId,
      ok: true,
      parts,
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error?.message || String(error),
    });
  }
};
