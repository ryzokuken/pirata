export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

export function nextFloat(state: RngState): { value: number; state: RngState } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

export function nextInt(state: RngState, maxExclusive: number): { value: number; state: RngState } {
  const r = nextFloat(state);
  return { value: Math.floor(r.value * maxExclusive), state: r.state };
}
