# Coding Flow Explanation

## What this coding module does

This coding module lets an admin create coding tracks, lets a student solve them in the browser, runs sample test cases on the code, and then gives a final evaluation.

It works in 4 main parts:

1. Coding track generation
2. Coding workspace and sample test execution
3. Final AI evaluation
4. Saving and showing the result

---

## 1. Coding track generation

### Where it starts

The admin uses the Coding Track Studio page:

- `src/app/admin/coding/page.tsx`

### What the admin enters

The admin can enter:

- role name
- topic list
- difficulty
- language
- duration
- optional Gemini API key

### What happens next

When the admin clicks **Generate Coding Track**:

1. The frontend sends a request to the Gemini API route.
2. The route uses the action `generate_coding_track`.
3. Gemini returns JSON for the coding track.
4. That JSON is loaded back into the admin form.
5. The admin can review it and save it.

### What the generated coding track contains

A coding track stores:

- title
- role name
- topics
- difficulty
- duration
- language
- problem statement
- starter code
- function name
- sample tests
- evaluation criteria
- expected strong-solution signals

### Important rule for sample tests

To reduce runner errors, sample tests are generated in a safe format:

- one array argument: `[1,2,3]`
- one number argument: `5`
- multiple arguments: `{"args":[[1,2,3],3]}`
- one string argument: `"hello"`

This logic is guided from:

- `src/app/api/gemini/route.ts`

---

## 2. Saving the coding track

When the admin clicks **Save Coding Track**:

1. The form checks that required fields are present.
2. The sample tests are parsed and normalized.
3. The track is saved using the data service.

### Where it is saved

The app saves coding tracks through:

- `src/lib/data-service.ts`

This service supports:

- Firebase, if Firebase is available
- local storage, as fallback

So the app can still work even if Firebase is not active.

---

## 3. Student coding workspace

### Where the student solves the problem

The student opens:

- `src/app/coding/[trackId]/page.tsx`

### What the page shows

The coding workspace shows:

- coding problem
- function name to complete
- sample tests
- Monaco code editor
- explanation box
- optional evaluation API key box

### Why Monaco is used

Monaco is the browser editor used in VS Code-like interfaces.

It is useful here because it gives:

- code editing experience
- syntax highlighting
- language support
- cleaner coding UI

---

## 4. Running sample test cases

### What happens when the student clicks Run Sample Tests

1. The page collects:
   - language
   - function name
   - student code
   - sample tests
2. It sends them to:
   - `/api/submit`
3. That API calls the execution engine.
4. The execution engine writes temporary files.
5. It compiles or runs the code.
6. It executes the sample tests.
7. It returns:
   - output
   - errors
   - execution time
   - pass/fail result for each test

### API route used

- `src/app/api/submit/route.ts`

### Execution engine used

- `src/lib/server/code-submit.ts`

---

## 5. How test case execution works internally

### Step A: input reaches the runner

The runner receives:

- language
- function name
- code
- tests

Each test has:

- id
- input
- expected

### Step B: input is normalized

The runner tries to convert test input into usable arguments.

Examples:

- `[1,2,3]` becomes one array argument
- `5` becomes one number argument
- `{"args":[[1,2,3],3]}` becomes two arguments
- `"hello"` becomes one string argument

This normalization is important because different questions need different argument types.

### Step C: language-specific harness is built

The system adds extra harness code around the student code.

That harness:

- finds the target function
- loops through the sample tests
- calls the function with parsed arguments
- compares actual result with expected result
- creates a JSON result payload

### Step D: execution by language

#### Python

- writes a `.py` file
- runs it with `python`

#### JavaScript

- writes a `.mjs` file
- runs it with `node`

#### C

- writes a `.c` file
- compiles with `gcc`
- runs the compiled executable

#### C++

- writes a `.cpp` file
- compiles with `g++`
- runs the compiled executable

### C++ runner details

The C++ runner adds support such as:

- `#include <bits/stdc++.h>`
- `using namespace std;`
- `ll` and `llong` aliases
- `gnu++17` compilation mode

It also supports common coding-platform styles like:

- free function style
- `class Solution` style

### Safety and control inside execution

The runner also has some basic control features:

- temporary folder per run
- timeout handling
- error capture
- compile error reporting
- runtime error reporting
- final cleanup of temp files

---

## 6. What the student sees after running sample tests

The workspace shows:

- how many tests passed
- expected output
- actual output
- per-test error, if any
- execution output
- execution errors
- execution time in milliseconds

This gives the student a quick check before final submission.

---

## 7. Final submission and AI evaluation

### What happens when the student clicks Submit For Evaluation

1. The student code is collected.
2. The explanation text is collected.
3. A summary of the sample test results is created.
4. All of that is sent to the Gemini route with:
   - `evaluate_code_submission`
5. Gemini returns evaluation JSON.
6. The app parses the score and feedback.
7. The final attempt is saved.
8. The user is redirected to the coding result page.

### What the AI evaluates

The AI is asked to judge:

- problem understanding
- likely correctness
- edge case handling
- code quality
- explanation quality

### What the AI returns

The evaluation stores:

- score
- strengths
- weaknesses
- suggestions
- summary

This logic is in:

- `src/app/api/gemini/route.ts`

---

## 8. Difference between sample test execution and final evaluation

This is very important.

### Sample test execution

This is execution-based.

It checks:

- whether the code runs
- whether sample tests pass
- compile errors
- runtime errors
- output mismatch

### Final AI evaluation

This is rubric-based.

It checks:

- code quality
- explanation quality
- problem understanding
- likely completeness

So the final score is not only based on sample tests.

It also depends on the quality of the solution and explanation.

---

## 9. Saving the final coding attempt

After evaluation, the app saves a coding attempt with fields like:

- track id
- student info
- code
- explanation
- score
- strengths
- weaknesses
- suggestions
- evaluation summary
- sample test summary
- sample test results
- number of passed tests
- total tests
- timestamps

This is saved through:

- `src/lib/data-service.ts`

The structure is defined in:

- `src/types/models.ts`

---

## 10. Coding result page

### Where the result is shown

- `src/app/coding/result/[attemptId]/page.tsx`

### What the result page displays

The result page shows:

- score
- passed sample tests
- difficulty
- language
- summary
- strengths
- weaknesses
- suggestions
- sample test run summary
- executed sample test details
- submitted code

The feedback is shown point-wise so it is easier to read.

---

## 11. API key fallback system

The Gemini route supports:

- one API key
- multiple API keys
- optional key entered in UI
- server-side fallback keys

If one key fails, the route can try the next key.

This helps avoid failures when one key reaches limit or quota.

---

## 12. Beginner-friendly full flow summary

Here is the full coding flow in simple order:

1. Admin opens Coding Track Studio.
2. Admin enters role, topics, difficulty, language, and duration.
3. Gemini generates a coding problem with starter code and sample tests.
4. Admin reviews and saves the coding track.
5. Student opens the coding track.
6. Student writes code in Monaco editor.
7. Student runs sample tests.
8. The backend compiles or runs the code.
9. The backend compares actual output with expected output.
10. The app shows test results, errors, and execution time.
11. Student submits code with explanation.
12. Gemini performs final rubric-based evaluation.
13. The app saves the attempt.
14. The result page shows short point-wise feedback.

---

## 13. Important practical note

The current system supports real sample-test execution for:

- Python
- JavaScript
- C
- C++

The final AI evaluation is useful, but it is still different from a full online judge with hidden test cases.

So the current design is best described as:

- execution-backed sample testing
- AI-backed final review

---

## 14. Main files involved

- `src/app/admin/coding/page.tsx`
- `src/app/coding/[trackId]/page.tsx`
- `src/app/coding/result/[attemptId]/page.tsx`
- `src/app/api/gemini/route.ts`
- `src/app/api/submit/route.ts`
- `src/lib/server/code-submit.ts`
- `src/lib/data-service.ts`
- `src/types/models.ts`
