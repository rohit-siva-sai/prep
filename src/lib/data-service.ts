"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ADMIN_PASSWORD_HASH, ADMIN_USERNAME, defaultTests } from "@/lib/default-data";
import { db, firebaseReady } from "@/lib/firebase";
import {
  ExamAttempt,
  ExamTest,
  Interview,
  InterviewMessage,
  InterviewResult,
  InterviewSession,
  UserProfile,
} from "@/types/models";

type MaybeArchivedTest = ExamTest & { archived?: boolean; archivedAt?: number };
type MaybeArchivedInterview = Omit<Interview, "id"> & { archived?: boolean; archivedAt?: number };
type LocalDb = {
  users: Record<string, UserProfile>;
  tests: Record<string, MaybeArchivedTest>;
  attempts: Record<string, Omit<ExamAttempt, "id">>;
  interviews: Record<string, MaybeArchivedInterview>;
  interviewSessions: Record<string, Omit<InterviewSession, "id">>;
  interviewResults: Record<string, InterviewResult>;
  counters: {
    attempts: number;
    interviews: number;
    interviewSessions: number;
  };
};

const LOCAL_DB_KEY = "exam-grid-local-db-v1";
const canUseLocalStorage = () => typeof window !== "undefined";
const shouldUseFirebase = () => Boolean(firebaseReady && db);

const mustDb = () => {
  if (!db || !firebaseReady) throw new Error("Firebase is unavailable.");
  return db;
};

const emptyLocalDb = (): LocalDb => ({
  users: {},
  tests: {},
  attempts: {},
  interviews: {},
  interviewSessions: {},
  interviewResults: {},
  counters: {
    attempts: 0,
    interviews: 0,
    interviewSessions: 0,
  },
});

const readLocalDb = (): LocalDb => {
  if (!canUseLocalStorage()) return emptyLocalDb();
  const raw = window.localStorage.getItem(LOCAL_DB_KEY);
  if (!raw) return emptyLocalDb();
  try {
    return { ...emptyLocalDb(), ...(JSON.parse(raw) as Partial<LocalDb>) };
  } catch {
    return emptyLocalDb();
  }
};

const writeLocalDb = (value: LocalDb) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(value));
};

const withLocalDb = async <T>(fn: (state: LocalDb) => T | Promise<T>) => {
  const state = readLocalDb();
  const result = await fn(state);
  writeLocalDb(state);
  return result;
};

const nextLocalId = (state: LocalDb, scope: keyof LocalDb["counters"], prefix: string) => {
  state.counters[scope] += 1;
  return `${prefix}_${Date.now()}_${state.counters[scope]}`;
};

const usersRef = () => collection(mustDb(), "users");
const testsRef = () => collection(mustDb(), "tests");
const attemptsRef = () => collection(mustDb(), "attempts");
const interviewsRef = () => collection(mustDb(), "interviews");
const sessionsRef = () => collection(mustDb(), "interviewSessions");
const resultsRef = () => collection(mustDb(), "interviewResults");

export const ensureSeedData = async () => {
  if (shouldUseFirebase()) {
    const database = mustDb();
    const adminSnap = await getDoc(doc(database, "users", ADMIN_USERNAME));
    if (!adminSnap.exists()) {
      const adminUser: UserProfile = {
        username: ADMIN_USERNAME,
        fullName: "System Admin",
        passwordHash: ADMIN_PASSWORD_HASH,
        role: "admin",
        createdAt: Date.now(),
      };
      await setDoc(doc(database, "users", ADMIN_USERNAME), adminUser);
    }

    const tests = await getDocs(testsRef());
    if (tests.empty) {
      await Promise.all(defaultTests.map((test) => setDoc(doc(database, "tests", test.id), test)));
    }
    return;
  }

  await withLocalDb((state) => {
    if (!state.users[ADMIN_USERNAME]) {
      state.users[ADMIN_USERNAME] = {
        username: ADMIN_USERNAME,
        fullName: "System Admin",
        passwordHash: ADMIN_PASSWORD_HASH,
        role: "admin",
        createdAt: Date.now(),
      };
    }
    if (!Object.keys(state.tests).length) {
      for (const test of defaultTests) state.tests[test.id] = test;
    }
  });
};

export const getUserByUsername = async (username: string) => {
  const key = username.toLowerCase();
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "users", key));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  }
  const state = readLocalDb();
  return state.users[key] ?? null;
};

export const createUser = async (user: UserProfile) => {
  const key = user.username.toLowerCase();
  if (shouldUseFirebase()) {
    await setDoc(doc(mustDb(), "users", key), user);
    return;
  }
  await withLocalDb((state) => {
    state.users[key] = { ...user, username: key };
  });
};

export const listTests = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(testsRef(), orderBy("name")));
    return snap.docs
      .map((d) => d.data() as ExamTest & { archived?: boolean })
      .filter((t) => !t.archived)
      .map((t) => t as ExamTest);
  }
  const state = readLocalDb();
  return Object.values(state.tests)
    .filter((t) => !t.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ ...t }));
};

export const getTest = async (id: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "tests", id));
    if (!snap.exists()) return null;
    const data = snap.data() as ExamTest & { archived?: boolean };
    return data.archived ? null : (data as ExamTest);
  }
  const data = readLocalDb().tests[id];
  return !data || data.archived ? null : { ...data };
};

export const saveTest = async (test: ExamTest) => {
  if (shouldUseFirebase()) {
    await setDoc(doc(mustDb(), "tests", test.id), test);
    return;
  }
  await withLocalDb((state) => {
    state.tests[test.id] = { ...test };
  });
};

export const deleteTest = async (testId: string) => {
  if (shouldUseFirebase()) {
    const ref = doc(mustDb(), "tests", testId);
    try {
      await deleteDoc(ref);
    } catch {
      // Fallback for rules that deny hard delete: archive it so it disappears from active lists.
      await setDoc(ref, { archived: true, archivedAt: Date.now() }, { merge: true });
    }
    return;
  }
  await withLocalDb((state) => {
    delete state.tests[testId];
  });
};

export const addAttempt = async (attempt: Omit<ExamAttempt, "id">) => {
  if (shouldUseFirebase()) {
    const ref = await addDoc(attemptsRef(), attempt);
    return ref.id;
  }
  return withLocalDb((state) => {
    const id = nextLocalId(state, "attempts", "attempt");
    state.attempts[id] = attempt;
    return id;
  });
};

export const getAttempt = async (attemptId: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "attempts", attemptId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<ExamAttempt, "id">) } as ExamAttempt;
  }
  const raw = readLocalDb().attempts[attemptId];
  return raw ? ({ id: attemptId, ...raw } as ExamAttempt) : null;
};

export const listAttemptsByUser = async (username: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(attemptsRef(), orderBy("endTs", "desc")));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, "id">) }) as ExamAttempt)
      .filter((a) => a.username === username);
  }
  return Object.entries(readLocalDb().attempts)
    .map(([id, data]) => ({ id, ...data }) as ExamAttempt)
    .filter((a) => a.username === username)
    .sort((a, b) => b.endTs - a.endTs);
};

export const listAllAttempts = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(attemptsRef(), orderBy("endTs", "desc")));
    return snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, "id">) }) as ExamAttempt,
    );
  }
  return Object.entries(readLocalDb().attempts)
    .map(([id, data]) => ({ id, ...data }) as ExamAttempt)
    .sort((a, b) => b.endTs - a.endTs);
};

export const listUsers = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(usersRef(), orderBy("createdAt", "asc")));
    return snap.docs.map((d) => d.data() as UserProfile);
  }
  return Object.values(readLocalDb().users).sort((a, b) => a.createdAt - b.createdAt);
};

export const listInterviews = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(interviewsRef(), orderBy("createdAt", "desc")));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Interview, "id"> & { archived?: boolean }) }))
      .filter((i) => !i.archived)
      .map((i) => i as Interview);
  }
  return Object.entries(readLocalDb().interviews)
    .map(([id, data]) => ({ id, ...data }))
    .filter((i) => !i.archived)
    .sort((a, b) => b.createdAt - a.createdAt) as Interview[];
};

export const getInterview = async (id: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "interviews", id));
    if (!snap.exists()) return null;
    const data = snap.data() as Omit<Interview, "id"> & { archived?: boolean };
    if (data.archived) return null;
    return { id: snap.id, ...data } as Interview;
  }
  const data = readLocalDb().interviews[id];
  return !data || data.archived ? null : ({ id, ...data } as Interview);
};

export const createInterview = async (interview: Omit<Interview, "id" | "createdAt">) => {
  if (shouldUseFirebase()) {
    const ref = await addDoc(interviewsRef(), {
      ...interview,
      createdAt: Date.now(),
    });
    return ref.id;
  }
  return withLocalDb((state) => {
    const id = nextLocalId(state, "interviews", "interview");
    state.interviews[id] = { ...interview, createdAt: Date.now() };
    return id;
  });
};

export const deleteInterview = async (interviewId: string) => {
  if (shouldUseFirebase()) {
    const ref = doc(mustDb(), "interviews", interviewId);
    try {
      await deleteDoc(ref);
    } catch {
      // Fallback for rules that deny hard delete: archive it so it disappears from active lists.
      await setDoc(ref, { archived: true, archivedAt: Date.now() }, { merge: true });
    }
    return;
  }
  await withLocalDb((state) => {
    delete state.interviews[interviewId];
  });
};

export const listInterviewSessionsByUser = async (username: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(sessionsRef(), orderBy("startTime", "desc")));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<InterviewSession, "id">) }) as InterviewSession)
      .filter((s) => s.studentUsername === username);
  }
  return Object.entries(readLocalDb().interviewSessions)
    .map(([id, data]) => ({ id, ...data }) as InterviewSession)
    .filter((s) => s.studentUsername === username)
    .sort((a, b) => b.startTime - a.startTime);
};

export const createInterviewSession = async (
  payload: Omit<InterviewSession, "id" | "startTime" | "messages" | "status" | "currentQuestionNo">,
  intro: string,
  firstQuestion: string,
) => {
  if (shouldUseFirebase()) {
    const ref = await addDoc(sessionsRef(), {
      ...payload,
      status: "ACTIVE",
      startTime: Date.now(),
      currentQuestionNo: 1,
      messages: [
        { sender: "AI", messageType: "INTRO", messageText: intro, createdAt: Date.now() },
        { sender: "AI", messageType: "QUESTION", messageText: firstQuestion, createdAt: Date.now() },
      ] as InterviewMessage[],
    });
    return ref.id;
  }
  return withLocalDb((state) => {
    const id = nextLocalId(state, "interviewSessions", "session");
    const now = Date.now();
    state.interviewSessions[id] = {
      ...payload,
      status: "ACTIVE",
      startTime: now,
      currentQuestionNo: 1,
      messages: [
        { sender: "AI", messageType: "INTRO", messageText: intro, createdAt: now },
        { sender: "AI", messageType: "QUESTION", messageText: firstQuestion, createdAt: now },
      ],
    };
    return id;
  });
};

export const getInterviewSession = async (sessionId: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "interviewSessions", sessionId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<InterviewSession, "id">) } as InterviewSession;
  }
  const raw = readLocalDb().interviewSessions[sessionId];
  return raw ? ({ id: sessionId, ...raw } as InterviewSession) : null;
};

export const processInterviewAnswer = async (
  sessionId: string,
  answer: string,
  nextQuestion: string,
  done: boolean,
) => {
  if (shouldUseFirebase()) {
    const ref = doc(mustDb(), "interviewSessions", sessionId);
    await runTransaction(mustDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Session not found.");
      const data = snap.data() as InterviewSession;
      const messages = data.messages ?? [];
      const now = Date.now();
      const updated: InterviewMessage[] = [
        ...messages,
        { sender: "STUDENT", messageType: "ANSWER", messageText: answer, createdAt: now },
        {
          sender: "AI",
          messageType: done ? "CLOSE" : "QUESTION",
          messageText: nextQuestion,
          createdAt: now,
        },
      ];

      tx.update(ref, {
        messages: updated,
        currentQuestionNo: done ? data.currentQuestionNo : data.currentQuestionNo + 1,
        status: done ? "PENDING_EVALUATION" : data.status,
      });
    });
    return;
  }

  await withLocalDb((state) => {
    const data = state.interviewSessions[sessionId];
    if (!data) throw new Error("Session not found.");
    const now = Date.now();
    data.messages = [
      ...(data.messages ?? []),
      { sender: "STUDENT", messageType: "ANSWER", messageText: answer, createdAt: now },
      {
        sender: "AI",
        messageType: done ? "CLOSE" : "QUESTION",
        messageText: nextQuestion,
        createdAt: now,
      },
    ];
    data.currentQuestionNo = done ? data.currentQuestionNo : data.currentQuestionNo + 1;
    if (done) data.status = "PENDING_EVALUATION";
  });
};

export const completeInterviewSession = async (sessionId: string) => {
  if (shouldUseFirebase()) {
    await updateDoc(doc(mustDb(), "interviewSessions", sessionId), {
      status: "COMPLETED",
      endTime: Date.now(),
    });
    return;
  }
  await withLocalDb((state) => {
    const session = state.interviewSessions[sessionId];
    if (!session) return;
    session.status = "COMPLETED";
    session.endTime = Date.now();
  });
};

export const saveInterviewResult = async (result: InterviewResult) => {
  if (shouldUseFirebase()) {
    await setDoc(doc(mustDb(), "interviewResults", result.sessionId), result);
    return;
  }
  await withLocalDb((state) => {
    state.interviewResults[result.sessionId] = result;
  });
};

export const getInterviewResult = async (sessionId: string) => {
  if (shouldUseFirebase()) {
    const snap = await getDoc(doc(mustDb(), "interviewResults", sessionId));
    return snap.exists() ? (snap.data() as InterviewResult) : null;
  }
  return readLocalDb().interviewResults[sessionId] ?? null;
};

export const listInterviewResultsByUser = async (username: string) => {
  const sessions = await listInterviewSessionsByUser(username);
  const all = await Promise.all(sessions.map((s) => getInterviewResult(s.id!)));
  return all.filter(Boolean) as InterviewResult[];
};

export const listAllInterviewSessions = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(sessionsRef(), orderBy("startTime", "desc")));
    return snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<InterviewSession, "id">) }) as InterviewSession,
    );
  }
  return Object.entries(readLocalDb().interviewSessions)
    .map(([id, data]) => ({ id, ...data }) as InterviewSession)
    .sort((a, b) => b.startTime - a.startTime);
};

export const listAllInterviewResults = async () => {
  if (shouldUseFirebase()) {
    const snap = await getDocs(query(resultsRef(), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => d.data() as InterviewResult);
  }
  return Object.values(readLocalDb().interviewResults).sort((a, b) => b.createdAt - a.createdAt);
};
