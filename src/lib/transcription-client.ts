"use client";

const API_URL = "/api/transcribe";

export const transcribeAudio = async (audioBlob: Blob) => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "interview-answer.wav");

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Speech API is unreachable. Configure PERFORMANCE_API_URL for the hosted transcription service.",
      );
    }
    throw error;
  }

  const payload = (await response.json().catch(() => null)) as { detail?: string; text?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.detail || "Failed to transcribe audio.");
  }

  return payload?.text?.trim() || "";
};
