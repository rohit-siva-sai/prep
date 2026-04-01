import { NextRequest, NextResponse } from "next/server";
import { CodeSubmitBody, runCodeSubmission } from "@/lib/server/code-submit";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CodeSubmitBody;
    const data = await runCodeSubmission(body);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected execution error." },
      { status: 400 },
    );
  }
}
