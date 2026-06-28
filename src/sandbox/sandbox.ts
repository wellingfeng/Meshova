/**
 * Sandbox for running AI-written scripts safely.
 *
 * Hard requirements from the dev plan:
 *  - isolate execution (no access to host globals by default)
 *  - prevent infinite loops / runaway scripts (operation budget + wall clock)
 *
 * This is the Node/portable baseline. A Web Worker / true VM isolate is the
 * next upgrade for full memory isolation; the loop-guard and timeout contract
 * defined here stays the same so the rest of the system is stable.
 */

export class SandboxTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxTimeoutError";
  }
}

export class SandboxBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxBudgetError";
  }
}

export interface SandboxOptions {
  /** Wall-clock limit in ms. Default 2000. */
  timeoutMs?: number;
  /** Max number of guarded operations (loop iterations etc). Default 1e7. */
  opBudget?: number;
  /** Named values exposed to the script (the geometry/material DSL API). */
  api?: Record<string, unknown>;
}

export interface SandboxResult<T> {
  value: T;
  /** Operations consumed via the loop guard. */
  opsUsed: number;
  /** Wall-clock elapsed in ms. */
  elapsedMs: number;
}

/**
 * A budget tracker the sandboxed script must call inside loops (`__tick()`).
 * The DSL's own loop helpers call it automatically, so AI scripts that use
 * library combinators are guarded without thinking about it.
 */
export class LoopGuard {
  private ops = 0;
  private readonly deadline: number;

  constructor(
    private readonly budget: number,
    timeoutMs: number,
  ) {
    this.deadline = Date.now() + timeoutMs;
  }

  tick(cost = 1): void {
    this.ops += cost;
    if (this.ops > this.budget) {
      throw new SandboxBudgetError(
        `operation budget exceeded (> ${this.budget})`,
      );
    }
    // Check the clock occasionally to bound runaway tight loops.
    if ((this.ops & 0x3fff) === 0 && Date.now() > this.deadline) {
      throw new SandboxTimeoutError("script wall-clock timeout");
    }
  }

  get used(): number {
    return this.ops;
  }

  expired(): boolean {
    return Date.now() > this.deadline;
  }
}

const FORBIDDEN_GLOBALS = [
  "process",
  "require",
  "global",
  "globalThis",
  "Function",
  "fetch",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
];

/**
 * Run a script string in a restricted scope.
 *
 * The script body runs with host globals shadowed to `undefined`, plus the
 * provided `api` and a `__guard` loop guard. It must `return` its result.
 *
 * NOTE: This blocks accidental access and casual misuse, not a determined
 * attacker — full isolation requires a Worker/VM boundary, the planned
 * upgrade. Do not run untrusted third-party code with secrets in-process.
 */
export function runScript<T = unknown>(
  source: string,
  options: SandboxOptions = {},
): SandboxResult<T> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const opBudget = options.opBudget ?? 1e7;
  const guard = new LoopGuard(opBudget, timeoutMs);
  const api = options.api ?? {};

  const apiKeys = Object.keys(api);
  const apiValues = apiKeys.map((k) => api[k]);

  // Shadow dangerous globals as parameters bound to undefined.
  const shadow = FORBIDDEN_GLOBALS;

  const paramNames = [...shadow, ...apiKeys, "__guard"];
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    ...paramNames,
    `"use strict";\n${source}`,
  ) as (...args: unknown[]) => T;

  const shadowValues = shadow.map(() => undefined);
  const start = Date.now();
  const value = factory(...shadowValues, ...apiValues, guard);
  const elapsedMs = Date.now() - start;

  if (guard.expired()) {
    throw new SandboxTimeoutError("script wall-clock timeout");
  }

  return { value, opsUsed: guard.used, elapsedMs };
}
