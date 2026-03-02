"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { TopNav } from "@/components/layout/top-nav";
import { useAuth } from "@/contexts/auth-context";
import { FiTrash2 } from "react-icons/fi";
import { deleteTest, listTests, saveTest } from "@/lib/data-service";
import { confirmToast, notify } from "@/lib/toast";
import { ExamTest, Question } from "@/types/models";

const parseAiPayload = (payload: string) => {
  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const test: Partial<ExamTest> = {};
  const questions: Question[] = [];

  for (const line of lines) {
    if (line.startsWith("TEST_ID:")) test.id = line.replace("TEST_ID:", "").trim().toUpperCase();
    else if (line.startsWith("TEST_NAME:")) test.name = line.replace("TEST_NAME:", "").trim();
    else if (line.startsWith("TAGLINE:")) test.tagline = line.replace("TAGLINE:", "").trim();
    else if (line.startsWith("DURATION_MIN:")) test.durationSec = Number(line.replace("DURATION_MIN:", "").trim()) * 60;
    else if (line.startsWith("PASS_PERCENT:")) test.passPercent = Number(line.replace("PASS_PERCENT:", "").trim());
    else if (line.startsWith("Q\t")) {
      const p = line.split("\t");
      if (p.length >= 8) {
        questions.push({
          id: p[1].trim().toUpperCase(),
          text: p[2].trim(),
          options: [p[3].trim(), p[4].trim(), p[5].trim(), p[6].trim()],
          answer: Number(p[7]),
        });
      }
    }
  }

  if (!test.id || !test.name || !test.durationSec || !test.passPercent || questions.length === 0) {
    throw new Error("Invalid payload format.");
  }

  return {
    id: test.id,
    name: test.name,
    tagline: test.tagline || "AI-generated test",
    durationSec: test.durationSec,
    passPercent: test.passPercent,
    questions,
  } as ExamTest;
};

const isGeminiKeyError = (message: string) =>
  /api key|invalid key|expired|permission|unauthorized|http 401|http 403|api_key/i.test(
    message,
  );

const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Expert"];
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];
const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const PASS_PERCENT_OPTIONS = [40, 50, 55, 60, 65, 70, 75, 80, 90];

export default function AdminExamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tests, setTests] = useState<ExamTest[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [newTest, setNewTest] = useState({
    id: "",
    name: "",
    tagline: "",
    durationMin: 20,
    passPercent: 60,
  });
  const [addQ, setAddQ] = useState({
    testId: "",
    qid: "",
    qtext: "",
    o1: "",
    o2: "",
    o3: "",
    o4: "",
    answer: 0,
  });
  const [removeQ, setRemoveQ] = useState({ testId: "", qid: "" });

  const [aiPayload, setAiPayload] = useState("");
  const [replaceImport, setReplaceImport] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [promptTagline, setPromptTagline] = useState("");
  const [count, setCount] = useState<number>(10);

  const [direct, setDirect] = useState({
    geminiApiKey: "",
    topic: "",
    level: "",
    count: 10,
    testId: "",
    testName: "",
    tagline: "",
    durationMin: 20,
    passPercent: 60,
    replaceExisting: false,
  });

  const [showKeyPopup, setShowKeyPopup] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingTestId, setDeletingTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [loading, user, router]);

  const refresh = async () => setTests(await listTests());

  useEffect(() => {
    if (user?.role === "admin") refresh();
  }, [user]);

  useEffect(() => {
    if (!msg) return;
    notify.success(msg);
    setMsg("");
  }, [msg]);

  useEffect(() => {
    if (!err) return;
    notify.error(err);
    setErr("");
  }, [err]);

  const testsById = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);

  const createTest = async (event: FormEvent) => {
    event.preventDefault();
    setErr("");
    setMsg("");
    try {
      const test: ExamTest = {
        id: newTest.id.trim().toUpperCase(),
        name: newTest.name.trim(),
        tagline: newTest.tagline.trim(),
        durationSec: Number(newTest.durationMin) * 60,
        passPercent: Number(newTest.passPercent),
        questions: [],
      };
      if (
        !test.id ||
        !test.name ||
        test.durationSec <= 0 ||
        test.passPercent <= 0 ||
        test.passPercent > 100
      ) {
        throw new Error("Invalid test details.");
      }
      await saveTest(test);
      setMsg(`Test created: ${test.id}`);
      setNewTest({ id: "", name: "", tagline: "", durationMin: 20, passPercent: 60 });
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create test.");
    }
  };

  const onDeleteTest = async (event: FormEvent) => {
    event.preventDefault();
    const id = newTest.id.trim().toUpperCase();
    if (!id) return;
    try {
      await deleteTest(id);
      setMsg(`Test removed: ${id}`);
      setErr("");
      refresh();
    } catch {
      setErr("Failed to delete test.");
    }
  };

  const onDeleteTestQuick = async (id: string) => {
    if (deletingTestId) return;
    const confirmed = await confirmToast(
      `Delete test ${id}?`,
      "This removes the test configuration from the exam list.",
    );
    if (!confirmed) return;
    setDeletingTestId(id);
    setMsg("");
    setErr("");
    try {
      await deleteTest(id);
      setMsg(`Test removed: ${id}`);
      await refresh();
    } catch {
      setErr("Failed to delete test.");
    } finally {
      setDeletingTestId(null);
    }
  };

  const onAddQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const test = testsById.get(addQ.testId.trim().toUpperCase());
    if (!test) return setErr("Target test not found.");

    const question: Question = {
      id: addQ.qid.trim().toUpperCase(),
      text: addQ.qtext.trim(),
      options: [addQ.o1.trim(), addQ.o2.trim(), addQ.o3.trim(), addQ.o4.trim()],
      answer: Number(addQ.answer),
    };

    if (
      !question.id ||
      !question.text ||
      question.options.some((o) => !o) ||
      question.answer < 0 ||
      question.answer > 3
    ) {
      return setErr("Invalid question payload.");
    }

    await saveTest({ ...test, questions: [...test.questions, question] });
    setMsg(`Question added to ${test.id}`);
    setErr("");
    setAddQ({ testId: "", qid: "", qtext: "", o1: "", o2: "", o3: "", o4: "", answer: 0 });
    refresh();
  };

  const onDeleteQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const test = testsById.get(removeQ.testId.trim().toUpperCase());
    if (!test) return setErr("Target test not found.");
    const qid = removeQ.qid.trim().toUpperCase();
    await saveTest({ ...test, questions: test.questions.filter((q) => q.id !== qid) });
    setMsg(`Question removed: ${qid}`);
    setErr("");
    setRemoveQ({ testId: "", qid: "" });
    refresh();
  };

  const generatePrompt = () => {
    const testId = topic.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "AITEST";
    setAiPrompt(
      [
        "Create a multiple-choice exam strictly in the format below.",
        "No markdown, no explanation, no extra text.",
        `Topic: ${topic}`,
        `Level: ${level}`,
        `Question count: ${count}`,
        "",
        `TEST_ID: ${testId}`,
        "TEST_NAME: <name>",
        `TAGLINE: ${promptTagline || "<short tagline>"}`,
        "DURATION_MIN: <integer>",
        "PASS_PERCENT: <number 1-100>",
        "Q\t<QUESTION_ID>\t<QUESTION_TEXT>\t<OPTION1>\t<OPTION2>\t<OPTION3>\t<OPTION4>\t<CORRECT_OPTION_INDEX_0_TO_3>",
      ].join("\n"),
    );
  };

  const postGemini = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_exam_questions", payload }),
    });
    const data = (await response.json()) as {
      ok: boolean;
      data?: { text?: string };
      error?: string;
    };
    if (!data.ok || !data.data?.text) {
      throw new Error(data.error || "AI generation failed.");
    }
    return data.data.text;
  };

  const importParsedTest = async (parsed: ExamTest, replaceExisting: boolean) => {
    if (testsById.has(parsed.id) && !replaceExisting) {
      throw new Error(`Test ID already exists: ${parsed.id}. Enable Replace if exists.`);
    }
    await saveTest(parsed);
    await refresh();
    setMsg(`AI test imported: ${parsed.id}`);
    setErr("");
  };

  const directGenerateImport = async (event: FormEvent) => {
    event.preventDefault();
    setMsg("");
    setErr("");
    setIsGenerating(true);
    try {
      const text = await postGemini({
        topic: direct.topic,
        level: direct.level,
        count: Number(direct.count || 10),
        testId: direct.testId.trim().toUpperCase(),
        testName: direct.testName,
        tagline: direct.tagline,
        durationMin: Number(direct.durationMin || 20),
        passPercent: Number(direct.passPercent || 60),
        apiKey: direct.geminiApiKey.trim(),
      });
      const parsed = parseAiPayload(text);
      await importParsedTest(parsed, direct.replaceExisting);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate/import AI test.";
      setErr(message);
      if (isGeminiKeyError(message)) {
        setKeyInput(direct.geminiApiKey);
        setShowKeyPopup(true);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const importAi = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const parsed = parseAiPayload(aiPayload);
      await importParsedTest(parsed, replaceImport);
      setAiPayload("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to import AI test.");
    }
  };

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            { href: "/admin/interviews", label: "Interview Admin" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Administrator"
          title="Test Control Panel"
        />

        <Panel className="mt-6 border-cyan-300/25 bg-cyan-500/10">
          <h2 className="font-display text-2xl">AI Test Generator (ChatGPT)</h2>
          <p className="text-sm text-slate-300 mt-1">
            Uses default server Gemini key by default. Add override key only if default key expires.
          </p>

          <form className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-4 grid gap-3" onSubmit={directGenerateImport}>
            <h3 className="font-display text-lg text-emerald-200">Direct Generate and Import</h3>
            <input
              className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2"
              placeholder="Gemini API key (optional override)"
              type="password"
              value={direct.geminiApiKey}
              onChange={(e) => setDirect((p) => ({ ...p, geminiApiKey: e.target.value }))}
            />
            <div className="grid md:grid-cols-3 gap-3">
              <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Topic" value={direct.topic} onChange={(e) => setDirect((p) => ({ ...p, topic: e.target.value }))} required />
              <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={direct.level} onChange={(e) => setDirect((p) => ({ ...p, level: e.target.value }))} required>
                <option value="" disabled>Select Level</option>
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={direct.count} onChange={(e) => setDirect((p) => ({ ...p, count: Number(e.target.value) }))} required>
                {QUESTION_COUNT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Test ID" value={direct.testId} onChange={(e) => setDirect((p) => ({ ...p, testId: e.target.value.toUpperCase() }))} required />
              <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Test Name" value={direct.testName} onChange={(e) => setDirect((p) => ({ ...p, testName: e.target.value }))} required />
              <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Tagline" value={direct.tagline} onChange={(e) => setDirect((p) => ({ ...p, tagline: e.target.value }))} />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={direct.durationMin} onChange={(e) => setDirect((p) => ({ ...p, durationMin: Number(e.target.value) }))} required>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={direct.passPercent} onChange={(e) => setDirect((p) => ({ ...p, passPercent: Number(e.target.value) }))} required>
                {PASS_PERCENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-slate-200 rounded-lg border border-white/20 px-3 py-2">
                <input className="accent-cyan-400" type="checkbox" checked={direct.replaceExisting} onChange={(e) => setDirect((p) => ({ ...p, replaceExisting: e.target.checked }))} />
                Replace if ID exists
              </label>
            </div>
            <button className="rounded-xl py-2 bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-900 font-semibold disabled:opacity-70" disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate with API and Import"}
            </button>
            {isGenerating ? (
              <div className="flex items-center gap-3 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2">
                <span className="h-6 w-6 rounded-full border-2 border-cyan-200/30 border-t-cyan-300 animate-spin" />
                <div className="h-6 w-6 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#34d399,#22d3ee)] opacity-80 animate-spin" />
                <p className="text-sm text-cyan-100">AI is generating and importing your test...</p>
              </div>
            ) : null}
            <p className="text-xs text-slate-300">Security: key is used for this request only and not stored in tests/users.</p>
          </form>

          <div className="grid md:grid-cols-5 gap-3 mt-4">
            <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Select Level</option>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" placeholder="Tagline" value={promptTagline} onChange={(e) => setPromptTagline(e.target.value)} />
            <select className="rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {QUESTION_COUNT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button className="rounded-xl py-2 bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-900 font-semibold" onClick={generatePrompt} type="button">Generate ChatGPT Prompt</button>
          </div>

          <textarea className="mt-3 w-full min-h-40 rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2 text-sm" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Prompt for ChatGPT will appear here..." />
          <div className="flex gap-3 mt-2">
            <button className="rounded-lg px-3 py-2 border border-cyan-300/40 text-cyan-200 hover:bg-cyan-500/20" type="button" onClick={() => navigator.clipboard.writeText(aiPrompt)}>Copy Prompt</button>
            <a className="rounded-lg px-3 py-2 border border-emerald-300/40 text-emerald-200 hover:bg-emerald-500/20" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT</a>
          </div>

          <form className="mt-5 grid gap-3" onSubmit={importAi}>
            <label className="text-sm text-slate-300">Paste ChatGPT output in required format:</label>
            <textarea className="w-full min-h-64 rounded-lg bg-slate-900/70 border border-white/20 px-3 py-2 font-mono text-xs" value={aiPayload} onChange={(e) => setAiPayload(e.target.value)} placeholder="TEST_ID: DS01\nTEST_NAME: Data Structures Core\nTAGLINE: Arrays, stacks, queues and trees\nDURATION_MIN: 20\nPASS_PERCENT: 60\nQ	DSQ1	What is amortized complexity of dynamic array append?	O(n)	O(1) average	O(log n)	O(n log n)	1" required />
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input className="accent-cyan-400" type="checkbox" checked={replaceImport} onChange={(e) => setReplaceImport(e.target.checked)} />
              Replace existing test if TEST_ID already exists
            </label>
            <button className="rounded-xl py-2 bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-900 font-semibold">Import AI Test</button>
          </form>
        </Panel>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel>
            <h2 className="font-display text-xl">Create Test</h2>
            <form className="mt-3 grid gap-3" onSubmit={createTest}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Test ID" value={newTest.id} onChange={(e) => setNewTest((p) => ({ ...p, id: e.target.value }))} required />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Test Name" value={newTest.name} onChange={(e) => setNewTest((p) => ({ ...p, name: e.target.value }))} required />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Tagline" value={newTest.tagline} onChange={(e) => setNewTest((p) => ({ ...p, tagline: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" value={newTest.durationMin} onChange={(e) => setNewTest((p) => ({ ...p, durationMin: Number(e.target.value) }))}>
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" value={newTest.passPercent} onChange={(e) => setNewTest((p) => ({ ...p, passPercent: Number(e.target.value) }))}>
                  {PASS_PERCENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900">Create Test</button>
            </form>
          </Panel>

          <Panel>
            <h2 className="font-display text-xl">Delete Test</h2>
            <form className="mt-3 grid gap-3" onSubmit={onDeleteTest}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Test ID" value={newTest.id} onChange={(e) => setNewTest((p) => ({ ...p, id: e.target.value }))} required />
              <button className="rounded-xl bg-red-500/90 py-2 font-semibold hover:bg-red-500">Delete Test</button>
            </form>
          </Panel>

          <Panel className="lg:col-span-2">
            <h2 className="font-display text-xl">Add Question</h2>
            <form className="mt-3 grid gap-3" onSubmit={onAddQuestion}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Target Test ID" value={addQ.testId} onChange={(e) => setAddQ((p) => ({ ...p, testId: e.target.value }))} required />
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Question ID" value={addQ.qid} onChange={(e) => setAddQ((p) => ({ ...p, qid: e.target.value }))} required />
              </div>
              <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Question text" value={addQ.qtext} onChange={(e) => setAddQ((p) => ({ ...p, qtext: e.target.value }))} required />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Option 1" value={addQ.o1} onChange={(e) => setAddQ((p) => ({ ...p, o1: e.target.value }))} required />
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Option 2" value={addQ.o2} onChange={(e) => setAddQ((p) => ({ ...p, o2: e.target.value }))} required />
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Option 3" value={addQ.o3} onChange={(e) => setAddQ((p) => ({ ...p, o3: e.target.value }))} required />
                <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Option 4" value={addQ.o4} onChange={(e) => setAddQ((p) => ({ ...p, o4: e.target.value }))} required />
              </div>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" max={3} min={0} type="number" value={addQ.answer} onChange={(e) => setAddQ((p) => ({ ...p, answer: Number(e.target.value) }))} />
              <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900">Add Question</button>
            </form>
          </Panel>

          <Panel className="lg:col-span-2">
            <h2 className="font-display text-xl">Delete Question</h2>
            <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={onDeleteQuestion}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Target Test ID" value={removeQ.testId} onChange={(e) => setRemoveQ((p) => ({ ...p, testId: e.target.value }))} required />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Question ID" value={removeQ.qid} onChange={(e) => setRemoveQ((p) => ({ ...p, qid: e.target.value }))} required />
              <button className="rounded-xl bg-red-500/90 py-2 font-semibold hover:bg-red-500">Delete Question</button>
            </form>
          </Panel>
        </div>

        <Panel className="mt-6 overflow-x-auto">
          <h2 className="font-display text-xl">Current Tests</h2>
          <table className="mt-3 min-w-[760px] w-full text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300">
              <tr>
                <th className="py-2">ID</th>
                <th className="py-2">Name</th>
                <th className="py-2">Duration</th>
                <th className="py-2">Pass %</th>
                <th className="py-2">Questions</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr className="border-t border-white/10" key={test.id}>
                  <td className="py-2 font-mono text-xs">{test.id}</td>
                  <td className="py-2">{test.name}</td>
                  <td className="py-2">{Math.floor(test.durationSec / 60)} min</td>
                  <td className="py-2">{test.passPercent}</td>
                  <td className="py-2">{test.questions.length}</td>
                  <td className="py-2">
                    <button
                      aria-label="Delete test"
                      className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-lg text-white hover:bg-red-500 disabled:opacity-60"
                      disabled={Boolean(deletingTestId)}
                      onClick={() => onDeleteTestQuick(test.id)}
                      type="button"
                    >
                      {deletingTestId === test.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <FiTrash2 />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-400">
            Default admin credentials: <span className="font-mono">admin / admin123</span>
          </p>
        </Panel>
      </div>

      {showKeyPopup ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-300/30 bg-slate-900 p-5">
            <h3 className="font-display text-2xl">Gemini Key Required</h3>
            <p className="mt-2 text-sm text-slate-300">
              Default server key may be expired or rate-limited. Add an override Gemini key and retry.
            </p>
            <input
              className="mt-4 w-full rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2"
              placeholder="Enter Gemini API key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button className="rounded-lg border border-white/20 px-3 py-2" type="button" onClick={() => setShowKeyPopup(false)}>
                Close
              </button>
              <button
                className="rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 px-3 py-2 text-slate-900 font-semibold"
                type="button"
                onClick={() => {
                  setDirect((p) => ({ ...p, geminiApiKey: keyInput }));
                  setShowKeyPopup(false);
                  setMsg("Override Gemini key added. Click Generate with API and Import again.");
                  setErr("");
                }}
              >
                Use This Key
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
