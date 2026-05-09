import { NextRequest, NextResponse } from "next/server";

type Body = {
  action:
    | "blueprint"
    | "intro"
    | "next_question"
    | "evaluate"
    | "generate_exam_questions"
    | "generate_coding_track"
    | "evaluate_code_submission"
    | "refine_transcript";
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

const getGeminiTimeoutMs = (action?: Body["action"]) => {
  switch (action) {
    case "generate_coding_track":
      return 60000;
    case "evaluate_code_submission":
      return 45000;
    case "generate_exam_questions":
      return 30000;
    default:
      return 18000;
  }
};

const parseApiKeys = (...sources: Array<string | undefined>) =>
  Array.from(
    new Set(
      sources
        .flatMap((source) => String(source || "").split(/[\r\n,]+/))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const callGemini = async (
  prompt: string,
  mimeType?: string,
  apiKeyOverride?: string,
  modelOverride?: string,
  timeoutMs = 18000,
) => {
  const keys = parseApiKeys(
    apiKeyOverride,
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
  );
  const model = modelOverride?.trim() || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!keys.length) throw new Error("GEMINI_API_KEY missing.");

  let lastError = "Unknown Gemini API error.";

  for (const key of keys) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: mimeType
            ? { temperature: 0.2, responseMimeType: mimeType }
            : { temperature: 0.4 },
        }),
      },
    );

    if (!response.ok) {
      lastError = `Gemini API error: HTTP ${response.status} - ${await response.text()}`;
      continue;
    }

    const json = await response.json();
    const out = extractFirstText(json);
    if (!out) {
      lastError = "Gemini returned empty text.";
      continue;
    }
    return out;
  }

  throw new Error(lastError);
};

const isGeminiTimeout = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" ||
    error.message.toLowerCase().includes("aborted") ||
    error.message.toLowerCase().includes("timeout"));

const callGeminiForAction = async (
  action: Body["action"],
  prompt: string,
  mimeType?: string,
  apiKeyOverride?: string,
  modelOverride?: string,
) => {
  try {
    return await callGemini(
      prompt,
      mimeType,
      apiKeyOverride,
      modelOverride,
      getGeminiTimeoutMs(action),
    );
  } catch (error) {
    if (isGeminiTimeout(error)) {
      throw new Error(
        action === "generate_coding_track"
          ? "Coding track generation took too long. Try again, reduce the topic scope, or switch to another Gemini key/model."
          : "The AI request took too long. Please try again.",
      );
    }
    throw error;
  }
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const projectContextBlock = (payload: Record<string, unknown>) => {
  const projectName = String(payload.projectName || "").trim();
  const projectDetails = String(payload.projectDetails || "").trim();
  const projectLinks = String(payload.projectLinks || "").trim();
  const isProjectInterview = Boolean(payload.isProjectInterview);

  if (!isProjectInterview && !projectName && !projectDetails && !projectLinks) return "";

  return [
    "Project interview context:",
    projectName ? `Project Name: ${projectName}` : "",
    projectDetails ? `Project Details:\n${projectDetails}` : "",
    projectLinks ? `Project Links:\n${projectLinks}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export async function POST(request: NextRequest) {
  try {
    const { action, payload } = (await request.json()) as Body;
    const apiKeyOverride = String(payload.apiKey || "").trim();
    const modelOverride = String(payload.model || "").trim();

    if (action === "intro") {
      try {
        const text = await callGeminiForAction(
          "intro",
          [
            "You are a professional interviewer.",
            `Write a concise welcome for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}.`,
            payload.isProjectInterview
              ? "This is a project-focused interview, so mention that the questions will be based on the candidate's uploaded project and their answers."
              : "This is a standard role interview.",
            "Keep it 3-4 sentences.",
            projectContextBlock(payload),
          ]
            .filter(Boolean)
            .join("\n"),
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
        const flow = await callGeminiForAction(
          "blueprint",
          [
            `Create compact interview question flow for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}, type ${payload.interviewType}, question count ${payload.questionCount}. Max 120 words.`,
            payload.isProjectInterview
              ? "Make the flow project-centric: start with project overview, then architecture, implementation choices, challenges, tradeoffs, testing, deployment, and ownership."
              : "",
            projectContextBlock(payload),
          ]
            .filter(Boolean)
            .join("\n"),
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        const followup = await callGeminiForAction(
          "blueprint",
          [
            `Define follow-up logic for role ${payload.roleName}, topics ${payload.topics}, difficulty ${payload.difficulty}. Max 120 words.`,
            payload.isProjectInterview
              ? "For project interviews, ask deeper follow-ups based on architecture, design rationale, debugging, performance, tradeoffs, and the candidate's exact previous answer."
              : "",
            projectContextBlock(payload),
          ]
            .filter(Boolean)
            .join("\n"),
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        const criteria = await callGeminiForAction(
          "blueprint",
          [
            `Define interview evaluation criteria for role ${payload.roleName}, topics ${payload.topics}, type ${payload.interviewType}. Max 120 words.`,
            payload.isProjectInterview
              ? "For project interviews, include ownership, architecture clarity, technical depth, tradeoff reasoning, debugging ability, testing, and communication."
              : "",
            projectContextBlock(payload),
          ]
            .filter(Boolean)
            .join("\n"),
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
        payload.isProjectInterview
          ? "- Make the question specific to the candidate's project, implementation decisions, bugs, tradeoffs, testing, architecture, deployment, or ownership."
          : "",
        previousQuestions.length
          ? `Previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
          : "Previously asked questions: none",
        "Context:",
        String(payload.context || ""),
      ].join("\n");
      try {
        const question = await callGeminiForAction(
          "next_question",
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
      const prompt = `Evaluate this interview and return STRICT JSON only with keys technical_knowledge, communication_clarity, answer_relevance, confidence, overall_score, strengths, weaknesses, suggestions, final_feedback, improvement_topics, improvement_subjects. Scores must be integers 0-100.

Rules:
- improvement_topics: comma-separated concrete interview topics from the discussed questions that need improvement
- improvement_subjects: comma-separated broader subject areas that need improvement
- Base the topic and subject improvement fields only on the actual interview questions and candidate answers
- Do not invent unrelated areas
- If this is a project interview, evaluate project understanding, architecture reasoning, implementation depth, tradeoff awareness, debugging, testing, and ownership based only on the provided conversation

${payload.conversation}`;
      try {
        const raw = await callGeminiForAction(
          "evaluate",
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
          improvement_topics: "Core interview topics discussed in this session",
          improvement_subjects: "Role fundamentals, communication",
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
Q\t<QUESTION_ID>\t<TOPIC>\t<QUESTION_TEXT>\t<OPTION1>\t<OPTION2>\t<OPTION3>\t<OPTION4>\t<CORRECT_OPTION_INDEX_0_TO_3>

Rules:
- Return exactly ${payload.count} questions
- No markdown, no explanation, no extra text
- Every question must include a specific topic label
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

    if (action === "generate_coding_track") {
      const prompt = `Return STRICT JSON only with keys title, roleName, topics, difficulty, durationMinutes, language, prompt, starterCode, functionName, sampleTests, evaluationCriteria, expectedSignals.

Rules:
- prompt must describe one interview-style coding problem with clear requirements, constraints, and expected function behavior
- starterCode must be realistic starter code for the selected language
- functionName must be the exact callable function students should complete
- sampleTests must contain 8 to 10 items, each with keys id, input, expected
- order sampleTests from simple to harder
- include at least one edge case and one larger or trickier case
- sampleTests must use runner-safe input formatting:
  - for one array/list/vector argument use JSON array strings like "[1,2,3]"
  - for one scalar argument use plain values like "5"
  - for multiple arguments use JSON object strings like "{\\"args\\":[[1,2,3,4],3]}"
  - for string arguments use valid JSON string values like "\\"hello\\""
  - for nested arrays use JSON arrays like "[[1,2],[3,4]]"
- expected must also use JSON-safe formatting:
  - numbers like "6"
  - arrays like "[24,12,8,6]"
  - strings like "\\"answer\\""
- evaluationCriteria must be a concise rubric for correctness, complexity, readability, and edge cases
- expectedSignals must describe what strong solutions should demonstrate
- No markdown fences

Context:
Role: ${payload.roleName}
Topics: ${payload.topics}
Difficulty: ${payload.difficulty}
Language: ${payload.language}
Duration Minutes: ${payload.durationMinutes}

Language-specific requirements:
- If language is C++, starterCode must use "#include <bits/stdc++.h>" and "using namespace std;"
- If language is C++, prefer competitive-programming friendly syntax and STL containers
- If language is C++, starterCode must follow this exact structural style:
  #include <bits/stdc++.h>
  using namespace std;
  
  class Solution {
  public:
      <return_type> functionName(<needed_parameters>) {
          
      }
  };
- If language is C++, choose the method signature based on the actual problem requirements
- Do not force vector<int>& nums, int k unless the problem really needs those parameters
- If language is C++, prefer a Solution-class member function instead of free functions by default
- If language is C++, sampleTests should be compatible with function-based execution in the runner`;
      const raw = await callGeminiForAction(
        "generate_coding_track",
        prompt,
        "application/json",
        apiKeyOverride,
        modelOverride,
      );
      return NextResponse.json({ ok: true, data: { raw } });
    }

    if (action === "evaluate_code_submission") {
      const prompt = `Evaluate this coding submission and return STRICT JSON only with keys score, strengths, weaknesses, suggestions, evaluationSummary.

Rules:
- score must be an integer from 0 to 100
- Focus on problem understanding, likely correctness, edge-case handling, code quality, and explanation quality
- If code appears incomplete, reflect that honestly
- Do not use markdown fences

Track:
Title: ${payload.title}
Role: ${payload.roleName}
Topics: ${payload.topics}
Difficulty: ${payload.difficulty}
Language: ${payload.language}
Prompt:
${payload.prompt}

Evaluation Criteria:
${payload.evaluationCriteria}

Expected Signals:
${payload.expectedSignals}

Candidate Explanation:
${payload.explanation}

Sample Test Summary:
${payload.testRunSummary || "No sample tests were run before submission."}

Candidate Code:
${payload.code}`;
      try {
        const raw = await callGeminiForAction(
          "evaluate_code_submission",
          prompt,
          "application/json",
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { raw } });
      } catch {
        const code = String(payload.code || "");
        const explanation = String(payload.explanation || "");
        const lengthScore = clamp(Math.floor(code.length / 20), 18, 55);
        const explanationScore = clamp(Math.floor(explanation.length / 10), 5, 20);
        const structureBonus =
          /(for|while|if|return|def |function |class |=>|public |private |const |let )/i.test(code) ? 12 : 0;
        const edgeCaseBonus = /(null|undefined|empty|edge|base case|boundary)/i.test(
          `${code}\n${explanation}`,
        )
          ? 8
          : 0;
        const score = clamp(lengthScore + explanationScore + structureBonus + edgeCaseBonus, 25, 82);
        const raw = JSON.stringify({
          score,
          strengths: "Submission shows a workable approach and enough signal for manual review.",
          weaknesses: "Fallback scoring was used, so runtime correctness and exact edge-case coverage are not verified.",
          suggestions: "Add brief complexity notes, mention edge cases, and test the solution against sample inputs.",
          evaluationSummary:
            "Fallback evaluation was used because the AI evaluator was unavailable. Treat this as rubric guidance rather than execution-backed grading.",
        });
        return NextResponse.json({ ok: true, data: { raw } });
      }
    }

    if (action === "refine_transcript") {
      const input = String(payload.text || "").trim();
      if (!input) return NextResponse.json({ ok: true, data: { text: "" } });

      const context = String(payload.context || "").trim();
      const prompt = [
        "You are correcting speech-to-text transcription errors.",
        "Return only corrected text.",
        "Hard rules:",
        "- Preserve original meaning exactly.",
        "- Do not summarize.",
        "- Do not add new facts.",
        "- Fix spelling, word choice, punctuation, and obvious homophone errors.",
        "- Keep technical terms accurate (example: candidate key, functional dependency, transitive dependency, BCNF, 3NF).",
        context ? `Context:\n${context}` : "Context: none",
        `Input:\n${input}`,
      ].join("\n");

      try {
        const text = await callGeminiForAction(
          "refine_transcript",
          prompt,
          undefined,
          apiKeyOverride,
          modelOverride,
        );
        return NextResponse.json({ ok: true, data: { text } });
      } catch {
        return NextResponse.json({ ok: true, data: { text: input } });
      }
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
