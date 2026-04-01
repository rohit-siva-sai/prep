"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import {
  completeInterviewSession,
  getInterview,
  getInterviewSession,
  processInterviewAnswer,
  saveInterviewResult,
} from "@/lib/data-service";
import { callGemini } from "@/lib/gemini-client";
import { notify } from "@/lib/toast";
import { transcribeAudio } from "@/lib/transcription-client";
import { InterviewSession } from "@/types/models";

const normalizeQuestionText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isNearDuplicateQuestion = (candidate: string, previousQuestions: string[]) => {
  const current = normalizeQuestionText(candidate);
  if (!current) return false;
  const currentWords = new Set(current.split(" ").filter(Boolean));
  if (!currentWords.size) return false;

  return previousQuestions.some((q) => {
    const prev = normalizeQuestionText(q);
    if (!prev) return false;
    if (prev === current) return true;

    const prevWords = new Set(prev.split(" ").filter(Boolean));
    if (!prevWords.size) return false;

    let overlap = 0;
    for (const word of currentWords) {
      if (prevWords.has(word)) overlap += 1;
    }
    return overlap / Math.max(currentWords.size, prevWords.size) >= 0.72;
  });
};

const parseTopics = (topicsRaw: string) =>
  topicsRaw
    .split(/[,|/]/g)
    .map((t) => t.trim())
    .filter(Boolean);

const pickTargetTopic = (topics: string[], previousQuestions: string[], currentQuestionNo: number) => {
  if (!topics.length) return "";
  const normalizedHistory = previousQuestions.map(normalizeQuestionText);
  const remaining = topics.filter((topic) => {
    const topicWords = normalizeQuestionText(topic);
    if (!topicWords) return true;
    return !normalizedHistory.some((q) => q.includes(topicWords));
  });
  if (remaining.length > 0) return remaining[0];
  return topics[currentQuestionNo % topics.length] || topics[0];
};

const parseJsonField = (raw: string, key: string, fallback: string | number) => {
  const textMatch = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  if (textMatch) return textMatch[1];
  const numMatch = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
  if (numMatch) return Number(numMatch[1]);
  return fallback;
};

const VOICE_PREF_KEYS = {
  enabled: "interview.voice.enabled",
  voiceUri: "interview.voice.uri",
  rate: "interview.voice.rate",
  pitch: "interview.voice.pitch",
} as const;

const buildTranscriptContext = (session: InterviewSession | null) => {
  if (!session) return "";

  const lastAiQuestion =
    [...session.messages]
      .reverse()
      .find((message) => message.sender === "AI" && message.messageType === "QUESTION")
      ?.messageText || "";

  return [
    `Interview title: ${session.interviewTitle}`,
    `Role: ${session.roleName}`,
    `Topics: ${session.topics}`,
    lastAiQuestion ? `Current question: ${lastAiQuestion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export default function InterviewChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [timerReady, setTimerReady] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [speakOutput, setSpeakOutput] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [voiceRate, setVoiceRate] = useState(0.9);
  const [voicePitch, setVoicePitch] = useState(0.95);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const evaluatingRef = useRef(false);
  const lastSpokenAtRef = useRef<number>(0);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const stopRecordingRef = useRef<(shouldTranscribe: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const refresh = async () => {
    const data = await getInterviewSession(sessionId);
    if (!data || (user && data.studentUsername !== user.username)) {
      router.replace("/interviews");
      return;
    }
    setSession(data);
  };

  useEffect(() => {
    if (!sessionId || !user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user]);

  useEffect(() => {
    if (!session) return;
    setTimerReady(false);
    const tick = () => {
      const end = session.startTime + session.durationMinutes * 60 * 1000;
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(left);
      setTimerReady(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    return () => {
      void stopRecordingRef.current(false);
    };
  }, []);

  useEffect(() => {
    if (busy || isEvaluating || session?.status !== "ACTIVE") {
      if (micListening) void stopRecordingRef.current(false);
      return;
    }
  }, [busy, isEvaluating, micListening, session?.status]);

  useEffect(() => {
    const storedEnabled = window.localStorage.getItem(VOICE_PREF_KEYS.enabled);
    const storedUri = window.localStorage.getItem(VOICE_PREF_KEYS.voiceUri);
    const storedRate = window.localStorage.getItem(VOICE_PREF_KEYS.rate);
    const storedPitch = window.localStorage.getItem(VOICE_PREF_KEYS.pitch);

    if (storedEnabled !== null) setSpeakOutput(storedEnabled === "true");
    if (storedUri) setSelectedVoiceURI(storedUri);
    if (storedRate) {
      const parsedRate = Number(storedRate);
      if (!Number.isNaN(parsedRate)) setVoiceRate(parsedRate);
    }
    if (storedPitch) {
      const parsedPitch = Number(storedPitch);
      if (!Number.isNaN(parsedPitch)) setVoicePitch(parsedPitch);
    }

    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const english = all.filter((v) => /^en[-_]/i.test(v.lang));
      const finalVoices = english.length ? english : all;
      setVoices(finalVoices);
      if (!storedUri && finalVoices.length > 0) {
        setSelectedVoiceURI(finalVoices[0].voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!session || !speakOutput) return;
    const aiMessages = session.messages.filter((m) => m.sender === "AI");
    const latest = aiMessages[aiMessages.length - 1];
    if (!latest) return;
    if (latest.createdAt <= lastSpokenAtRef.current) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latest.messageText);
      utterance.rate = voiceRate;
      utterance.pitch = voicePitch;
      utterance.lang = "en-US";
      const picked = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (picked) utterance.voice = picked;
      window.speechSynthesis.speak(utterance);
      lastSpokenAtRef.current = latest.createdAt;
    }
  }, [session, selectedVoiceURI, speakOutput, voicePitch, voiceRate, voices]);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [session?.messages, answer, busy]);

  useEffect(() => {
    if (!error) return;
    notify.error(error);
  }, [error]);

  const locked = session?.status !== "ACTIVE";
  const micSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const releaseRecorderResources = async () => {
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const stopRecording = async (shouldTranscribe: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    setMicListening(false);

    const chunks = [...recordedChunksRef.current];
    recordedChunksRef.current = [];
    await releaseRecorderResources();

    if (!shouldTranscribe || chunks.length === 0) return;

    setIsTranscribing(true);
    setError("");
    try {
      const audioBlob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const rawTranscript = await transcribeAudio(audioBlob);
      if (!rawTranscript) {
        setError("No speech detected. Please try again.");
        return;
      }
      const refinedTranscript = geminiApiKey.trim()
        ? (
            await callGemini<{ text: string }>("refine_transcript", {
              text: rawTranscript,
              context: buildTranscriptContext(session),
              apiKey: geminiApiKey.trim(),
            }).catch(() => ({ text: rawTranscript }))
          ).text.trim()
        : rawTranscript;
      const nextAnswer = [answerRef.current.trim(), refinedTranscript || rawTranscript].filter(Boolean).join(" ");
      answerRef.current = nextAnswer;
      setAnswer(nextAnswer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  };
  stopRecordingRef.current = stopRecording;

  const startRecording = async () => {
    if (!micSupported) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    setError("");
    recordedChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType =
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
          .find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Microphone recording failed. Please try again.");
      };

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicListening(true);
    } catch (e) {
      await releaseRecorderResources();
      setMicListening(false);
      setError(e instanceof Error ? e.message : "Microphone permission is blocked. Allow mic access and try again.");
    }
  };

  const doEvaluate = async () => {
    if (!session) return;
    if (evaluatingRef.current) return;
    evaluatingRef.current = true;
    setIsEvaluating(true);
    const conversation = session.messages.map((m) => `${m.sender}: ${m.messageText}`).join("\n");
    try {
      const evalResp = await callGemini<{ raw: string }>("evaluate", {
        conversation: [
          `Role: ${session.roleName}`,
          `Topics: ${session.topics}`,
          `Evaluation Criteria: ${session.evaluationCriteria}`,
          "Conversation:",
          conversation,
        ].join("\n"),
        apiKey: geminiApiKey.trim(),
      });
      const raw = evalResp.raw;

      await saveInterviewResult({
        sessionId: session.id!,
        technical: Number(parseJsonField(raw, "technical_knowledge", 60)),
        communication: Number(parseJsonField(raw, "communication_clarity", 60)),
        relevance: Number(parseJsonField(raw, "answer_relevance", 60)),
        confidence: Number(parseJsonField(raw, "confidence", 60)),
        overall: Number(parseJsonField(raw, "overall_score", 60)),
        strengths: String(parseJsonField(raw, "strengths", "Problem solving, fundamentals")),
        weaknesses: String(parseJsonField(raw, "weaknesses", "Depth and clarity can improve")),
        suggestions: String(parseJsonField(raw, "suggestions", "Practice structured responses")),
        feedback: String(parseJsonField(raw, "final_feedback", "Good attempt. Continue practice.")),
        improvementTopics: String(
          parseJsonField(raw, "improvement_topics", "Topics from this interview need deeper practice"),
        ),
        improvementSubjects: String(
          parseJsonField(raw, "improvement_subjects", "Core subject understanding, communication"),
        ),
        createdAt: Date.now(),
      });

      await completeInterviewSession(session.id!);
      router.push(`/interviews/result/${session.id}`);
    } catch (e) {
      evaluatingRef.current = false;
      setIsEvaluating(false);
      setError(e instanceof Error ? e.message : "Failed to evaluate interview.");
    }
  };

  useEffect(() => {
    if (!session || remaining !== 0 || locked) return;
    if (!timerReady) return;
    doEvaluate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, session, locked, timerReady]);

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;

    if (micListening) {
      await stopRecording(true);
    }

    const text = answerRef.current.trim();
    if (!text) return;

    setBusy(true);
    setError("");
    answerRef.current = "";
    setAnswer("");

    try {
      const currentQ = session.currentQuestionNo;
      const totalQ = session.totalQuestions;
      const done = currentQ >= totalQ;
      const askedQuestions = session.messages
        .filter((m) => m.sender === "AI" && m.messageType === "QUESTION")
        .map((m) => m.messageText);

      let next = "Thanks. We have completed all questions. Click Finish & Evaluate to view your report.";
      if (!done) {
        const interview = await getInterview(session.interviewId);
        if (!interview) throw new Error("Interview configuration not found.");
        const topics = parseTopics(session.topics);
        const targetTopic = pickTargetTopic(topics, askedQuestions, currentQ);

        if (interview.customQuestions.length > 0) {
          const upcoming = interview.customQuestions.slice(currentQ);
          next =
            upcoming.find((q) => !isNearDuplicateQuestion(q, askedQuestions)) ||
            interview.customQuestions[currentQ] ||
            "Please explain your approach in detail with one practical example.";
        } else {
          const context = [
            `Interview: ${session.interviewTitle}`,
            `Role: ${session.roleName}`,
            `Topics: ${session.topics}`,
            `Target Topic For This Question: ${targetTopic || session.roleName}`,
            `Difficulty: ${session.difficulty}`,
            `Question Flow: ${interview.questionFlow}`,
            `Follow-up Logic: ${interview.followupLogic}`,
            "Rule: Ask one fresh question and move to a new topic if the previous answer was already provided.",
            "Do not repeat or rephrase any earlier question.",
            "Conversation:",
            ...session.messages.map((m) => `${m.sender}: ${m.messageText}`),
            `STUDENT: ${text}`,
          ].join("\n");

          const firstTry = (
            await callGemini<{ question: string }>("next_question", {
              context,
              currentQuestionNo: currentQ,
              totalQuestions: totalQ,
              previousQuestions: askedQuestions,
              apiKey: geminiApiKey.trim(),
            })
          ).question;

          if (isNearDuplicateQuestion(firstTry, askedQuestions)) {
            const retryContext = [
              context,
              "Retry rule: The prior generated question repeated an already covered topic.",
              `You must ask a distinctly new question on: ${targetTopic || session.roleName}.`,
            ].join("\n");
            const retried = (
              await callGemini<{ question: string }>("next_question", {
                context: retryContext,
                currentQuestionNo: currentQ,
                totalQuestions: totalQ,
                previousQuestions: askedQuestions,
                apiKey: geminiApiKey.trim(),
              })
            ).question;

            next = isNearDuplicateQuestion(retried, askedQuestions)
              ? `Let's move to ${targetTopic || "the next topic"}. Can you explain your approach with one concrete example?`
              : retried;
          } else {
            next = firstTry;
          }
        }
      }

      await processInterviewAnswer(session.id!, text, next, done);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process answer.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    if (micListening) {
      await stopRecording(true);
      return;
    }
    await startRecording();
  };

  if (!session || !user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-6xl">
        <TopNav
          actions={[{ href: "/interviews", label: "Back" }]}
          subtitle={`${session.roleName} - ${session.difficulty} - ${session.interviewType}`}
          title={session.interviewTitle}
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel>
            <div className="h-[60vh] space-y-3 overflow-y-auto pr-2" id="chatBox" ref={chatBoxRef}>
              {session.messages.map((m, idx) => {
                const isStudent = m.sender === "STUDENT";
                return (
                  <div
                    className={isStudent ? "text-right" : "text-left"}
                    key={`${idx}-${m.createdAt}`}
                  >
                    <div
                      className={`inline-block max-w-[85%] rounded-xl border px-3 py-2 ${isStudent ? "border-cyan-300/30 bg-cyan-500/20" : "border-emerald-300/30 bg-emerald-500/20"}`}
                    >
                      <p
                        className={`text-[10px] uppercase tracking-[0.2em] ${isStudent ? "text-cyan-200" : "text-emerald-200"}`}
                      >
                        {isStudent ? "You" : "Interviewer"}
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{m.messageText}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {!locked ? (
              <form className="mt-4" onSubmit={onSend}>
                <div className="flex gap-2">
                  <textarea
                    className="min-h-[88px] flex-1 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 outline-none focus:border-cyan-300"
                    disabled={busy || isEvaluating || isTranscribing}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    required
                    value={answer}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      className={`rounded-xl border px-3 py-2 ${micListening ? "border-cyan-300 bg-cyan-500/20 text-cyan-100" : "border-cyan-300/40 text-cyan-200 hover:bg-cyan-400/15"}`}
                      disabled={busy || isEvaluating || isTranscribing}
                      onClick={toggleMic}
                      type="button"
                    >
                      {isTranscribing ? "Transcribing..." : micListening ? "Recording..." : "Mic"}
                    </button>
                    <button
                      className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 font-semibold text-slate-900 disabled:opacity-70"
                      disabled={busy || isEvaluating || isTranscribing}
                    >
                      {busy ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
                {micSupported ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Press Mic to record, then press it again to transcribe your answer with the Python Whisper service.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-300">
                    This browser does not support microphone recording. You can still type your answer.
                  </p>
                )}
                {busy ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-cyan-200">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
                    Interviewer is thinking...
                  </div>
                ) : isTranscribing ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-cyan-200">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
                    Converting speech to text...
                  </div>
                ) : null}
              </form>
            ) : null}
          </Panel>

          <Panel className="h-fit lg:sticky lg:top-6">
            <h2 className="font-display text-xl">Interview Status</h2>
            <p className="mt-2 text-sm text-slate-300">Progress</p>
            <div className="mt-1 h-2 w-full rounded bg-slate-800">
              <div
                className="h-2 rounded bg-gradient-to-r from-cyan-400 to-emerald-400"
                style={{
                  width: `${Math.min(100, Math.round((session.currentQuestionNo / session.totalQuestions) * 100))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm">
              {session.currentQuestionNo} / {session.totalQuestions} questions
            </p>
            <p className="mt-4 text-sm text-slate-300">Time Left</p>
            <p className="font-display text-3xl text-cyan-300">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </p>

            <label className="mt-5 block text-xs uppercase tracking-[0.2em] text-indigo-200">
              Gemini Key Override
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2"
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Optional API key"
              type="password"
              value={geminiApiKey}
            />

            <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
              <input
                checked={speakOutput}
                className="accent-emerald-400"
                onChange={(e) => setSpeakOutput(e.target.checked)}
                type="checkbox"
              />
              Interviewer voice output
            </label>

            {locked ? (
              <button
                className="mt-4 w-full rounded-xl bg-emerald-500/80 py-2 hover:bg-emerald-500 disabled:opacity-70"
                disabled={isEvaluating}
                onClick={doEvaluate}
                type="button"
              >
                {isEvaluating ? "Evaluating..." : "Finish and Evaluate"}
              </button>
            ) : null}
          </Panel>
        </div>
      </div>

      {isEvaluating ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/30 bg-slate-900 p-6 text-center">
            <div className="mx-auto flex w-fit items-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
              <span className="h-6 w-6 animate-spin rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#34d399,#22d3ee)] opacity-80" />
            </div>
            <p className="mt-4 font-display text-xl text-cyan-100">Evaluating Interview...</p>
            <p className="mt-2 text-sm text-slate-300">Generating your feedback report. Please wait.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
