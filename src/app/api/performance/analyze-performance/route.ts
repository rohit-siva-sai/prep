import { NextRequest, NextResponse } from "next/server";

const getBackendBaseUrl = () => {
  const value =
    process.env.PERFORMANCE_API_URL ||
    process.env.NEXT_PUBLIC_PERFORMANCE_API_URL;
  if (!value) {
    throw new Error("PERFORMANCE_API_URL is not configured.");
  }
  return value.replace(/\/+$/, "");
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await fetch(`${getBackendBaseUrl()}/analyze-performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
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
            ? `Performance analysis service is unavailable. ${error.message}`
            : "Performance analysis service is unavailable.",
      },
      { status: 502 },
    );
  }
}
