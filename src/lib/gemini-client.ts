export type GeminiAction =
  | "blueprint"
  | "intro"
  | "next_question"
  | "evaluate"
  | "generate_exam_questions";

export const callGemini = async <T>(action: GeminiAction, payload: Record<string, unknown>) => {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  const data = (await response.json()) as { ok: boolean; data?: T; error?: string };
  if (!data.ok || !data.data) {
    throw new Error(data.error || "Gemini request failed.");
  }
  return data.data;
};
