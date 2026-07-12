/**
 * Feedback-style procedural flow helpers.
 *
 * Houdini-style networks often use a feedback loop: start with state, run a
 * deterministic step N times, feed the previous state into the next step. This
 * small helper keeps that pattern explicit without introducing a node graph.
 */

export interface RepeatContext<T> {
  /** Zero-based iteration index. */
  readonly index: number;
  /** Total requested iteration count. */
  readonly count: number;
  /** State entering this iteration. */
  readonly previous: T;
}

export type RepeatStep<T> = (state: T, ctx: RepeatContext<T>) => T;

/** Run a deterministic feedback loop and return the final state. */
export function repeat<T>(initial: T, count: number, step: RepeatStep<T>): T {
  const n = Math.max(0, Math.floor(count));
  let state = initial;
  for (let index = 0; index < n; index++) {
    state = step(state, { index, count: n, previous: state });
  }
  return state;
}

/**
 * Run a feedback loop and keep every emitted state, including the initial
 * state at index 0. Useful for process screenshots/debugging.
 */
export function repeatTrace<T>(initial: T, count: number, step: RepeatStep<T>): T[] {
  const states: T[] = [initial];
  const final = repeat(initial, count, (state, ctx) => {
    const next = step(state, ctx);
    states.push(next);
    return next;
  });
  if (states[states.length - 1] !== final) states.push(final);
  return states;
}
