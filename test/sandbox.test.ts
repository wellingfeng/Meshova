import { describe, it, expect } from "vitest";
import {
  runScript,
  SandboxBudgetError,
  SandboxTimeoutError,
} from "../src/index.js";

describe("sandbox", () => {
  it("runs a simple script and returns its value", () => {
    const r = runScript<number>("return 1 + 2;");
    expect(r.value).toBe(3);
  });

  it("exposes api functions to the script", () => {
    const r = runScript<number>("return double(21);", {
      api: { double: (x: number) => x * 2 },
    });
    expect(r.value).toBe(42);
  });

  it("shadows dangerous globals", () => {
    const r = runScript<boolean>(
      "return typeof process === 'undefined' && typeof require === 'undefined';",
    );
    expect(r.value).toBe(true);
  });

  it("stops a runaway loop via op budget", () => {
    const src = `
      let i = 0;
      while (true) { __guard.tick(); i++; }
      return i;
    `;
    expect(() => runScript(src, { opBudget: 100000 })).toThrow(
      SandboxBudgetError,
    );
  });

  it("reports ops used for guarded loops", () => {
    const src = `
      let s = 0;
      for (let i = 0; i < 1000; i++) { __guard.tick(); s += i; }
      return s;
    `;
    const r = runScript<number>(src);
    expect(r.value).toBe(499500);
    expect(r.opsUsed).toBe(1000);
  });

  it("times out a tight guarded loop", () => {
    const src = `
      while (true) { __guard.tick(); }
      return 0;
    `;
    expect(() =>
      runScript(src, { timeoutMs: 50, opBudget: Number.MAX_SAFE_INTEGER }),
    ).toThrow(SandboxTimeoutError);
  });
});
