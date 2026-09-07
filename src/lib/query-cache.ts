import { unstable_cache } from "next/cache";
/** Shared data caching; thrown failures cannot replace a successful cached snapshot. */
export function cacheSummary<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string): (...args: A) => Promise<R> {
  return process.env.NODE_ENV === "test" ? fn : unstable_cache(fn, ["qa-v2", key], { revalidate: 300 });
}
