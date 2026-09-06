import { NextResponse } from "next/server";
import { getLive } from "@/lib/stats";

export const revalidate = 30;

export async function GET() {
  const info = await getLive();
  return NextResponse.json(info, {
    headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
