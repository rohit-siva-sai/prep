import { NextRequest, NextResponse } from "next/server";

const getBackendBaseUrl = () => {
  const value =
    process.env.PERFORMANCE_API_URL ||
    process.env.NEXT_PUBLIC_PERFORMANCE_API_URL ||
    "http://127.0.0.1:8000";
  return value.replace(/\/+$/, "");
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const response = await fetch(`${getBackendBaseUrl()}/transcribe-audio`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? `Python transcription service is unreachable. ${error.message}`
            : "Python transcription service is unreachable.",
      },
      { status: 502 },
    );
  }
}
