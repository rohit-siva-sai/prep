import { NextRequest, NextResponse } from "next/server";

type Body = {
  action:
    | "blueprint"
    | "intro"
    | "next_question"
    | "evaluate"
    | "generate_exam_questions";
  payload: Record<string, unknown>;
};

const fallback = {
  blueprint: {
    flow: "Start with warm-up, move to core role-specific questions, then close with reflection.",
    followup: "If vague, ask for examples. If strong, ask deeper why/how follow-up.",
    criteria: "Evaluate technical depth, clarity, relevance, and confidence.",
  },
  intro: "Welcome to your interview. Please answer clearly and use practical examples.",
};

const extractFirstText = (json: unknown) => {
  const text = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts?.[0]?.text;
  return (text || "").trim();
};

const callGemini = async (
  prompt: string,
  mimeType?: string,
  apiKeyOverride?: string,
  modelOverride?: string,
) => {
  const key = apiKeyOverride?.trim() || process.env.GEMINI_API_KEY;
  const model = modelOverride?.trim() || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!key) throw new Error("GEMINI_API_KEY missing.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(18000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: mimeType
          ? { temperature: 0.2, responseMimeType: mimeType }
          : { temperature: 0.4 },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: HTTP ${response.status} - ${text}`);
  }

  const json = await response.json();
  const out = extractFirstText(json);
  if (!out) throw new Error("Gemini returned empty text.");
  return out;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function POST(request: NextRequest) {
  try {
    const { action, payload } = (await request.json()) as Body;
    const apiKeyOverride = String(payload.apiKey || "").trim();
    const modelOverride = String(payload.model || "").trim();

    if (action === "intro") {
      try {
        const text = await callGemini(
          `You are a professional interviewer. Write a concise welcome for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}. Keep it 3-4 sentences.`,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { intro: text } });
      } catch {
        return NextResponse.json({ ok: true, data: { intro: fallback.intro } });
      }
    }

    if (action === "blueprint") {
      try {
        const flow = await callGemini(
          `Create compact interview question flow for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}, type ${payload.interviewType}, question count ${payload.questionCount}. Max 120 words.`,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        const followup = await callGemini(
          `Define follow-up logic for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}. Max 120 words.`,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        const criteria = await callGemini(
          `Define interview evaluation criteria for role ${payload.roleName}, topics ${payload.topics}, type ${payload.interviewType}. Max 120 words.`,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { flow, followup, criteria } });
      } catch {
        return NextResponse.json({ ok: true, data: fallback.blueprint });
      }
    }

    if (action === "next_question") {
      const previousQuestions = Array.isArray(payload.previousQuestions)
        ? payload.previousQuestions
            .map((q) => String(q || "").trim())
            .filter(Boolean)
            .slice(-12)
        : [];
      const prompt = [
        "You are continuing an interview.",
        "Ask exactly one next question only.",
        `Question number ${(payload.currentQuestionNo as number) + 1} of ${payload.totalQuestions}.`,
        "Hard rules:",
        "- Do not repeat or rephrase any previously asked question.",
        "- If a topic was already answered, move to the next topic.",
        "- Keep the question concise and specific.",
        previousQuestions.length
          ? `Previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
          : "Previously asked questions: none",
        "Context:",
        String(payload.context || ""),
      ].join("\n");
      try {
        const question = await callGemini(
          prompt,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { question } });
      } catch {
        return NextResponse.json({
          ok: true,
          data: { question: "Please explain your approach in detail with one practical example." },
        });
      }
    }

    if (action === "evaluate") {
      const prompt = `Evaluate this interview and return STRICT JSON only with keys technical_knowledge, communication_clarity, answer_relevance, confidence, overall_score, strengths, weaknesses, suggestions, final_feedback. Scores must be integers 0-100.\n\n${payload.conversation}`;
      try {
        const raw = await callGemini(
          prompt,
          "application/json",
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { raw } });
      } catch {
        const text = String(payload.conversation || "");
        const chars = text.length;
        const technical = clamp(45 + Math.min(35, Math.floor(chars / 60)), 35, 85);
        const communication = clamp(40 + Math.min(35, Math.floor(chars / 80)), 35, 85);
        const relevance = clamp(50 + Math.min(25, Math.floor(chars / 120)), 35, 85);
        const confidence = clamp(42 + Math.min(30, Math.floor(chars / 100)), 35, 85);
        const overall = Math.round((technical + communication + relevance + confidence) / 4);
        const raw = JSON.stringify({
          technical_knowledge: technical,
          communication_clarity: communication,
          answer_relevance: relevance,
          confidence,
          overall_score: overall,
          strengths: "Consistent participation, baseline understanding",
          weaknesses: "Needs deeper technical detail, better examples",
          suggestions: "Practice structured answers and revise fundamentals",
          final_feedback: "Fallback evaluation was used due to AI quota/unavailability.",
        });
        return NextResponse.json({ ok: true, data: { raw } });
      }
    }

    if (action === "generate_exam_questions") {
      const prompt = `Create a multiple-choice exam strictly in this format only:
TEST_ID: ${payload.testId}
TEST_NAME: ${payload.testName}
TAGLINE: ${payload.tagline}
DURATION_MIN: ${payload.durationMin}
PASS_PERCENT: ${payload.passPercent}
Q\t<QUESTION_ID>\t<QUESTION_TEXT>\t<OPTION1>\t<OPTION2>\t<OPTION3>\t<OPTION4>\t<CORRECT_OPTION_INDEX_0_TO_3>

Rules:
- Return exactly ${payload.count} questions
- No markdown, no explanation, no extra text
- Correct option index must be 0..3

Topic: ${payload.topic}
Level: ${payload.level}`;
      const text = await callGemini(
        prompt,
        undefined,
        apiKeyOverride,
        modelOverride,
      );
      return NextResponse.json({ ok: true, data: { text } });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
