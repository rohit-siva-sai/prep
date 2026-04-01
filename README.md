# AI Assessment Platform

This repo includes a Next.js assessment frontend and a Python FastAPI + TensorFlow service for a Student Performance Enhancement Prediction System.

## Frontend

Run the web app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The dashboard now includes separate `Test Predictor` and `Interview Predictor` buttons that open the new `Performance Enhancement AI` screen.

## Python Prediction Service

The Python service lives in `ai_service/`.

Install dependencies:

```bash
cd ai_service
pip install -r requirements.txt
```

The interview speech-to-text flow now uses the Python API with Faster Whisper instead of browser speech recognition. The first transcription can take a little longer because the model is loaded and cached on first use.

Train models manually if you want to refresh saved artifacts:

```bash
python train.py
```

Run the API locally:

```bash
python -m uvicorn app.main:app --reload
```

API base URL:
`http://127.0.0.1:8000`

The frontend expects the FastAPI service at `http://127.0.0.1:8000` by default. Override it with `NEXT_PUBLIC_PERFORMANCE_API_URL` if needed.

## API Endpoint

`POST /analyze-performance`

`POST /transcribe-audio`

Sample request:

```json
{
  "student_id": "demo_student",
  "student_name": "Demo Student",
  "analysis_mode": "combined",
  "test_data": [
    { "subject": "Foundations Assessment", "topic": "Arrays", "score": 4, "total_marks": 10, "date": "2026-03-20" },
    { "subject": "Cyber Operations Drill", "topic": "Security", "score": 5, "total_marks": 10, "date": "2026-03-21" }
  ],
  "interview_feedback": [
    { "text": "The candidate showed good technical understanding but communication was rushed." }
  ]
}
```

Sample response shape:

```json
{
  "weak_topics": ["Arrays", "Security"],
  "suggested_improvement_areas": ["Revise Arrays", "Improve communication clarity"],
  "communication_insights": ["Communication is understandable but needs sharper structure and brevity."],
  "overall_performance_score": 61.42
}
```

## Project Structure

```text
ai_service/
  app/
    main.py
    model.py
    preprocess.py
    schemas.py
    utils.py
  data/
  models/
  train.py
src/app/performance-enhancement/
```

## Notes

- The API is JSON-based and easy to test in Postman.
- Sample training and request payloads are included under `ai_service/data`.
- Topic-wise performance visualization is rendered in the frontend after prediction.
