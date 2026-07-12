import { PROC_MODELS, NIGHT_METROPOLIS_MODEL } from "/web/procmodels.js?v=gamemap1";

PROC_MODELS[NIGHT_METROPOLIS_MODEL.id] = NIGHT_METROPOLIS_MODEL;

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
