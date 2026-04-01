"""Speech-to-text helpers powered by Faster Whisper."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

from faster_whisper import WhisperModel


DEFAULT_MODEL_SIZE = os.getenv("TRANSCRIPTION_MODEL_SIZE", "medium.en")
DEFAULT_DEVICE = os.getenv("TRANSCRIPTION_DEVICE", "cpu")
DEFAULT_COMPUTE_TYPE = os.getenv("TRANSCRIPTION_COMPUTE_TYPE", "int8")


@lru_cache(maxsize=1)
def get_transcription_model() -> WhisperModel:
    """Loads and caches the whisper model for reuse across requests."""

    return WhisperModel(
        DEFAULT_MODEL_SIZE,
        device=DEFAULT_DEVICE,
        compute_type=DEFAULT_COMPUTE_TYPE,
    )


def transcribe_audio_bytes(audio_bytes: bytes, suffix: str = ".wav") -> str:
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
            beam_size=8,
            patience=1.2,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text
    finally:
        temp_path.unlink(missing_ok=True)
