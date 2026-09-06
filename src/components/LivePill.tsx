"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveInfo } from "@/lib/live-types";
import { relTime } from "@/lib/format";

type State = "loading" | "live" | "offline";

export function LivePill() {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let ctl: AbortController | null = null;
    const load = async () => {
      ctl?.abort();
      ctl = new AbortController();
      try {
        const res = await fetch("/api/live", { signal: ctl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LiveInfo;
        setInfo(data);
        setState(data.db ? "live" : "offline");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("offline");
      }
    };
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      clearInterval(id);
      ctl?.abort();
    };
  }, []);

  const text =
    state === "loading"
      ? "connecting…"
      : state === "offline"
        ? "sensor offline"
        : info?.lastAiVisit
          ? `sensor live · last AI visit ${relTime(info.lastAiVisit)}`
          : "sensor live · no AI visits yet";

  return (
    <Link href="/visitors" className="pill" title="Live sensor status">
      <span className="dot" data-state={state} aria-hidden="true" />
      <span className="pill-text">{text}</span>
    </Link>
  );
}
