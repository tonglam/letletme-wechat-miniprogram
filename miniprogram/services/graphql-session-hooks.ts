/** Breaks auth ↔ graphql import cycle: graphql registers wipes, auth invokes them. */

let clearMemory: (() => void) | undefined;
let clearInFlight: (() => void) | undefined;

export function registerGraphQLMemoryClear(fn: () => void): void {
  clearMemory = fn;
}

export function registerGraphQLInFlightClear(fn: () => void): void {
  clearInFlight = fn;
}

export function clearGraphQLMemoryCache(): void {
  clearMemory?.();
  clearInFlight?.();
}
