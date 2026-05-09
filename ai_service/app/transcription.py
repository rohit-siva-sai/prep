"""Speech-to-text helpers powered by Faster Whisper."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
import re
from tempfile import NamedTemporaryFile

from faster_whisper import WhisperModel


DEFAULT_MODEL_SIZE = os.getenv("TRANSCRIPTION_MODEL_SIZE", "medium.en")
DEFAULT_DEVICE = os.getenv("TRANSCRIPTION_DEVICE", "cpu")
DEFAULT_COMPUTE_TYPE = os.getenv("TRANSCRIPTION_COMPUTE_TYPE", "int8")

TECHNICAL_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"\btail wind css\b", "Tailwind CSS"),
    (r"\btailwind css\b", "Tailwind CSS"),
    (r"\bcomponent based css\b", "component-based CSS"),
    (r"\bnext js\b", "Next.js"),
    (r"\bnext jay ess\b", "Next.js"),
    (r"\breact js\b", "React.js"),
    (r"\btype script\b", "TypeScript"),
    (r"\bjava script\b", "JavaScript"),
    (r"\bnode js\b", "Node.js"),
    (r"\bfire base\b", "Firebase"),
    (r"\bfire store\b", "Firestore"),
    (r"\bver cell\b", "Vercel"),
    (r"\bgit hub\b", "GitHub"),
    (r"\bapi s\b", "APIs"),
    (r"\bapi\b", "API"),
    (r"\bui ux\b", "UI/UX"),
    (r"\bcss approach\b", "CSS approach"),
)


@lru_cache(maxsize=1)
def get_transcription_model() -> WhisperModel:
    """Loads and caches the whisper model for reuse across requests."""

    return WhisperModel(
        DEFAULT_MODEL_SIZE,
        device=DEFAULT_DEVICE,
        compute_type=DEFAULT_COMPUTE_TYPE,
    )


def _normalize_transcript(text: str) -> str:
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return ""

    for pattern, replacement in TECHNICAL_REPLACEMENTS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\bcss's\b", "CSS", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bapis\b", "APIs", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bui\b", "UI", cleaned)
    cleaned = re.sub(r"\bux\b", "UX", cleaned)

    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]

    return cleaned


def transcribe_audio_bytes(audio_bytes: bytes, suffix: str = ".wav", prompt: str = "") -> str:
    """Transcribes uploaded audio bytes into plain text."""

    if not audio_bytes:
        return ""

    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = Path(temp_file.name)

    try:
        model = get_transcription_model()
        segments, _ = model.transcribe(
            str(temp_path),
            language="en",
            beam_size=10,
            best_of=5,
            patience=1.5,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            initial_prompt=prompt[:1500] if prompt else None,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return _normalize_transcript(text)
    finally:
        temp_path.unlink(missing_ok=True)
