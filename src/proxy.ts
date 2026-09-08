import { NextResponse } from "next/server";

/** Requests to gcdTracker are not an analytics source. Keep stored history untouched. */
export default function proxy() {
  return NextResponse.next();
}
