import type { RunReport, JobOutcome } from "./common";

export class PayloadTooLarge extends Error {}
/** Do not buffer arbitrarily large scheduler uploads before checking their size. */
export async function readPayload(req: Request, maxBytes = 2_000_000): Promise<string | undefined> {
  const length = req.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw new PayloadTooLarge();
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new PayloadTooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text || undefined;
  } finally { reader.releaseLock(); }
}

export function reportsOutcome(reports: RunReport[]): JobOutcome {
  if (!reports.length || reports.some((r) => r.outcome === "failed")) return "failed";
  if (reports.some((r) => r.outcome === "partial")) return "partial";
  if (reports.every((r) => r.outcome === "disabled")) return "disabled";
  return "success";
}
