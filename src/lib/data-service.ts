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

const mustDb = () => {
  if (!firebaseReady || !db) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values.");
  }
  return db;
};

const usersRef = () => collection(mustDb(), "users");
const testsRef = () => collection(mustDb(), "tests");
const attemptsRef = () => collection(mustDb(), "attempts");
const interviewsRef = () => collection(mustDb(), "interviews");
const sessionsRef = () => collection(mustDb(), "interviewSessions");
const resultsRef = () => collection(mustDb(), "interviewResults");

export const ensureSeedData = async () => {
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
    await Promise.all(
      defaultTests.map((test) => setDoc(doc(database, "tests", test.id), test)),
    );
  }
};

export const getUserByUsername = async (username: string) => {
  const snap = await getDoc(doc(mustDb(), "users", username.toLowerCase()));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
};

export const createUser = async (user: UserProfile) => {
  await setDoc(doc(mustDb(), "users", user.username.toLowerCase()), user);
};

export const listTests = async () => {
  const snap = await getDocs(query(testsRef(), orderBy("name")));
  return snap.docs
    .map((d) => d.data() as ExamTest & { archived?: boolean })
    .filter((t) => !t.archived)
    .map((t) => t as ExamTest);
};

export const getTest = async (id: string) => {
  const snap = await getDoc(doc(mustDb(), "tests", id));
  if (!snap.exists()) return null;
  const data = snap.data() as ExamTest & { archived?: boolean };
  return data.archived ? null : (data as ExamTest);
};

export const saveTest = async (test: ExamTest) => {
  await setDoc(doc(mustDb(), "tests", test.id), test);
};

export const deleteTest = async (testId: string) => {
  const ref = doc(mustDb(), "tests", testId);
  try {
    await deleteDoc(ref);
  } catch {
    // Fallback for rules that deny hard delete: archive it so it disappears from active lists.
    await setDoc(ref, { archived: true, archivedAt: Date.now() }, { merge: true });
  }
};

export const addAttempt = async (attempt: Omit<ExamAttempt, "id">) => {
  const ref = await addDoc(attemptsRef(), attempt);
  return ref.id;
};

export const getAttempt = async (attemptId: string) => {
  const snap = await getDoc(doc(mustDb(), "attempts", attemptId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ExamAttempt, "id">) } as ExamAttempt;
};

export const listAttemptsByUser = async (username: string) => {
  const snap = await getDocs(query(attemptsRef(), orderBy("endTs", "desc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, "id">) }) as ExamAttempt)
    .filter((a) => a.username === username);
};

export const listUsers = async () => {
  const snap = await getDocs(query(usersRef(), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => d.data() as UserProfile);
};

export const listInterviews = async () => {
  const snap = await getDocs(query(interviewsRef(), orderBy("createdAt", "desc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Interview, "id"> & { archived?: boolean }) }))
    .filter((i) => !i.archived)
    .map((i) => i as Interview);
};

export const getInterview = async (id: string) => {
  const snap = await getDoc(doc(mustDb(), "interviews", id));
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<Interview, "id"> & { archived?: boolean };
  if (data.archived) return null;
  return { id: snap.id, ...data } as Interview;
};

export const createInterview = async (interview: Omit<Interview, "id" | "createdAt">) => {
  const ref = await addDoc(interviewsRef(), {
    ...interview,
    createdAt: Date.now(),
  });
  return ref.id;
};

export const deleteInterview = async (interviewId: string) => {
  const ref = doc(mustDb(), "interviews", interviewId);
  try {
    await deleteDoc(ref);
  } catch {
    // Fallback for rules that deny hard delete: archive it so it disappears from active lists.
    await setDoc(ref, { archived: true, archivedAt: Date.now() }, { merge: true });
  }
};

export const listInterviewSessionsByUser = async (username: string) => {
  const snap = await getDocs(query(sessionsRef(), orderBy("startTime", "desc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<InterviewSession, "id">) }) as InterviewSession)
    .filter((s) => s.studentUsername === username);
};

export const createInterviewSession = async (
  payload: Omit<InterviewSession, "id" | "startTime" | "messages" | "status" | "currentQuestionNo">,
  intro: string,
  firstQuestion: string,
) => {
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
};

export const getInterviewSession = async (sessionId: string) => {
  const snap = await getDoc(doc(mustDb(), "interviewSessions", sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<InterviewSession, "id">) } as InterviewSession;
};

export const processInterviewAnswer = async (
  sessionId: string,
  answer: string,
  nextQuestion: string,
  done: boolean,
) => {
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
};

export const completeInterviewSession = async (sessionId: string) => {
  await updateDoc(doc(mustDb(), "interviewSessions", sessionId), {
    status: "COMPLETED",
    endTime: Date.now(),
  });
};

export const saveInterviewResult = async (result: InterviewResult) => {
  await setDoc(doc(mustDb(), "interviewResults", result.sessionId), result);
};

export const getInterviewResult = async (sessionId: string) => {
  const snap = await getDoc(doc(mustDb(), "interviewResults", sessionId));
  return snap.exists() ? (snap.data() as InterviewResult) : null;
};

export const listInterviewResultsByUser = async (username: string) => {
  const sessions = await listInterviewSessionsByUser(username);
  const all = await Promise.all(sessions.map((s) => getInterviewResult(s.id!)));
  return all.filter(Boolean) as InterviewResult[];
};

export const listAllInterviewSessions = async () => {
  const snap = await getDocs(query(sessionsRef(), orderBy("startTime", "desc")));
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<InterviewSession, "id">) }) as InterviewSession,
  );
};

export const listAllInterviewResults = async () => {
  const snap = await getDocs(query(resultsRef(), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data() as InterviewResult);
};
