# AI Assessment Platform

This repo includes a Next.js assessment frontend with Gemini-powered admin and interview flows, plus hosted performance-analysis and transcription integrations.

## Frontend

Run the web app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The dashboard includes separate `Test Predictor` and `Interview Predictor` buttons that open the `Performance Enhancement AI` screens.

## Hosted Performance Service

The predictor and speech transcription flows now require a hosted backend service URL.

Set this on the Next.js deployment:

```bash
PERFORMANCE_API_URL=https://your-hosted-service.example.com
```

The app no longer falls back to a localhost `ai_service` backend.

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
src/app/performance-enhancement/
src/app/api/performance/
src/app/api/transcribe/
src/app/api/gemini/
```

## Notes

- The performance API is proxied through Next.js routes.
- Gemini-related app features continue to use the built-in `/api/gemini` route.
- Topic-wise performance visualization is rendered in the frontend after prediction.
