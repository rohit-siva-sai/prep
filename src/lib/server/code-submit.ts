import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export type CodeSubmitBody = {
  language: string;
  functionName: string;
  code: string;
  tests: Array<{ id: string; input: string; expected: string }>;
};

export type CodeSubmitResult = {
  output: string;
  errors: string;
  executionTimeMs: number;
  results: Array<{
    id: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    error?: string;
  }>;
};

const extractJsonPayload = (stdout: string) => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    if (!candidate.startsWith("{")) continue;
    try {
      return {
        parsed: JSON.parse(candidate) as { results: CodeSubmitResult["results"] },
        rawJson: candidate,
        prelude: lines.slice(0, index).join("\n"),
      };
    } catch {
      // Keep scanning upward for the harness JSON line.
    }
  }

  throw new Error("Runner did not return a valid JSON result payload.");
};

const safeJsonParse = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    return JSON.parse(normalized);
  } catch {
    if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
    if (/^(true|false)$/i.test(normalized)) return normalized.toLowerCase() === "true";
    return normalized;
  }
};

const normalizeTestArgs = (value: string) => {
  const raw = value.trim();
  const parsed = safeJsonParse(value);
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "args" in parsed &&
    Array.isArray((parsed as { args?: unknown }).args)
  ) {
    return (parsed as { args: unknown[] }).args;
  }
  if (Array.isArray(parsed)) return [parsed];
  if (/^-?\d+(\s+-?\d+)+$/.test(raw)) {
    return [raw.split(/\s+/).map((item) => Number(item))];
  }
  if (typeof parsed === "string" && parsed.includes("\n")) {
    return parsed
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        if (/^-?\d+(\.\d+)?$/.test(part)) return Number(part);
        if (/^-?\d+(\s+-?\d+)+$/.test(part)) return part.split(/\s+/).map((item) => Number(item));
        return part;
      });
  }
  if (raw.startsWith("[") && raw.endsWith("]")) return [parsed];
  return [parsed];
};

const escapeCppString = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const cppArgMeta = (arg: unknown, index: number) => {
  if (Array.isArray(arg)) {
    const allNumbers = arg.every((item) => typeof item === "number");
    const vectorType = allNumbers ? "int" : "std::string";
    const values = arg
      .map((item) =>
        typeof item === "number" ? String(item) : `"${escapeCppString(String(item))}"`,
      )
      .join(", ");
    return {
      setup: `std::vector<${vectorType}> arg${index} = {${values}};`,
      expr: `arg${index}`,
    };
  }
  if (typeof arg === "number") return { setup: "", expr: String(arg) };
  if (typeof arg === "boolean") return { setup: "", expr: arg ? "true" : "false" };
  if (typeof arg === "string" && /^-?\d+(\s+-?\d+)+$/.test(arg.trim())) {
    const values = arg
      .trim()
      .split(/\s+/)
      .map((item) => Number(item))
      .join(", ");
    return {
      setup: `std::vector<int> arg${index} = {${values}};`,
      expr: `arg${index}`,
    };
  }
  return { setup: "", expr: `"${escapeCppString(String(arg))}"` };
};

const execute = (command: string, args: string[], cwd: string) =>
  new Promise<{ stdout: string; stderr: string; code: number | null; executionTimeMs: number }>((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload: { stdout: string; stderr: string; code: number | null; executionTimeMs: number }) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      finish({
        stdout,
        stderr: `${stderr}\nExecution timed out.`,
        code: -1,
        executionTimeMs: Date.now() - startedAt,
      });
    }, 6000);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
        code: -1,
        executionTimeMs: Date.now() - startedAt,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ stdout, stderr, code, executionTimeMs: Date.now() - startedAt });
    });
  });

const buildPythonHarness = (functionName: string, tests: CodeSubmitBody["tests"]) => `
import json

def _safe_parse(value):
    raw = str(value).strip()
    if not raw:
        return ""
    try:
        return json.loads(raw)
    except Exception:
        lowered = raw.lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        try:
            if "." in raw:
                return float(raw)
            return int(raw)
        except Exception:
            return raw

def _normalize_args(value):
    raw = str(value).strip()
    parsed = _safe_parse(value)
    if isinstance(parsed, dict) and isinstance(parsed.get("args"), list):
        return parsed["args"]
    if isinstance(parsed, list):
        return [parsed]
    if all(piece.replace("-", "", 1).isdigit() for piece in raw.split()) and len(raw.split()) > 1:
        return [[int(piece) for piece in raw.split()]]
    if isinstance(parsed, str) and "\\n" in parsed:
        output = []
        for part in [line.strip() for line in parsed.splitlines() if line.strip()]:
            if part.replace("-", "", 1).isdigit():
                output.append(int(part))
            elif all(piece.replace("-", "", 1).isdigit() for piece in part.split()):
                output.append([int(piece) for piece in part.split()])
            else:
                output.append(part)
        return output
    if raw.startswith("[") and raw.endswith("]"):
        return [parsed]
    return [parsed]

results = []
tests = ${JSON.stringify(tests)}
fn = globals().get(${JSON.stringify(functionName)})

if not callable(fn):
    raise Exception("Function '${functionName}' was not found.")

for test in tests:
    try:
        args = _normalize_args(test["input"])
        expected = _safe_parse(test["expected"])
        actual = fn(*args)
        passed = actual == expected
        results.append({
            "id": test["id"],
            "passed": passed,
            "actualOutput": json.dumps(actual),
            "expectedOutput": json.dumps(expected)
        })
    except Exception as exc:
        results.append({
            "id": test["id"],
            "passed": False,
            "actualOutput": "error",
            "expectedOutput": test["expected"],
            "error": str(exc)
        })

print(json.dumps({"results": results}))
`;

const buildJavaScriptHarness = (functionName: string, tests: CodeSubmitBody["tests"]) => `
const results = [];
const tests = ${JSON.stringify(tests)};
const fn =
  (typeof ${functionName} !== "undefined" && typeof ${functionName} === "function" ? ${functionName} : undefined) ||
  globalThis[${JSON.stringify(functionName)}];

const safeParse = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return JSON.parse(raw);
  } catch {
    if (/^-?\\d+(\\.\\d+)?$/.test(raw)) return Number(raw);
    if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
    return raw;
  }
};

const normalizeArgs = (value) => {
  const raw = String(value ?? "").trim();
  const parsed = safeParse(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.args)) {
    return parsed.args;
  }
  if (Array.isArray(parsed)) return [parsed];
  if (/^-?\d+(\s+-?\d+)+$/.test(raw)) {
    return [raw.split(/\s+/).map((item) => Number(item))];
  }
  if (typeof parsed === "string" && parsed.includes("\\n")) {
    return parsed
      .split(/\\r?\\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        if (/^-?\\d+(\\.\\d+)?$/.test(part)) return Number(part);
        if (/^-?\\d+(\\s+-?\\d+)+$/.test(part)) return part.split(/\\s+/).map((item) => Number(item));
        return part;
      });
  }
  if (raw.startsWith("[") && raw.endsWith("]")) return [parsed];
  return [parsed];
};

if (typeof fn !== "function") {
  throw new Error("Function '${functionName}' was not found.");
}

for (const test of tests) {
  try {
    const args = normalizeArgs(test.input);
    const expected = safeParse(test.expected);
    const actual = fn(...args);
    results.push({
      id: test.id,
      passed: JSON.stringify(actual) === JSON.stringify(expected),
      actualOutput: JSON.stringify(actual),
      expectedOutput: JSON.stringify(expected),
    });
  } catch (error) {
    results.push({
      id: test.id,
      passed: false,
      actualOutput: "error",
      expectedOutput: test.expected,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify({ results }));
`;

const buildCHarness = (
  code: string,
  functionName: string,
  tests: CodeSubmitBody["tests"],
  language: "c" | "cpp",
) => `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

${language === "cpp" ? "#include <iostream>\n#include <sstream>\n#include <vector>\n#include <string>\n#include <climits>\nusing namespace std;\ntypedef long long llong;\ntypedef long long ll;\n" : ""}

${bodyComment(functionName, tests)}

${(() => {
  const usesSolutionClass =
    language === "cpp" && /(class|struct)\s+Solution\b/.test(code);
  return language === "cpp" && usesSolutionClass
    ? `/* Detected Solution class pattern; invoking Solution().${functionName}(...) */`
    : "";
})()}

${language === "c"
    ? `
int main(void) {
  const char *tests_json = ${JSON.stringify(JSON.stringify(tests))};
  printf("{\\"results\\":[");
  int first = 1;
${tests
  .map((test) => {
    const args = normalizeTestArgs(test.input);
    const callArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
    return `
  {
    char actual_buffer[256];
    snprintf(actual_buffer, sizeof(actual_buffer), "%d", ${functionName}(${callArgs}));
    if (!first) printf(",");
    printf("{\\"id\\":\\"${test.id}\\",\\"passed\\":%s,\\"actualOutput\\":\\"%s\\",\\"expectedOutput\\":\\"${escapeCString(
      test.expected,
    )}\\"}",
      strcmp(actual_buffer, "${escapeCString(test.expected)}") == 0 ? "true" : "false",
      actual_buffer
    );
    first = 0;
  }`;
  })
  .join("\n")}
  printf("]}");
  return 0;
}`
    : `
int main() {
  cout << "{\\"results\\":[";
  bool first = true;
${tests
  .map((test) => {
    const args = normalizeTestArgs(test.input);
    const argMeta = args.map((arg, index) => cppArgMeta(arg, index));
    const setupLines = argMeta.map((entry) => entry.setup).filter(Boolean).join("\n    ");
    const callArgs = argMeta.map((entry) => entry.expr).join(", ");
    const usesSolutionClass = /(class|struct)\s+Solution\b/.test(code);
    const invocation = usesSolutionClass
      ? `Solution().${functionName}(${callArgs})`
      : `${functionName}(${callArgs})`;
    return `
  {
    ${setupLines}
    std::ostringstream actual_stream;
    actual_stream << ${invocation};
    std::string actual = actual_stream.str();
    if (!first) cout << ",";
    cout << "{\\"id\\":\\"${test.id}\\",\\"passed\\":" << (actual == "${escapeCString(
      test.expected,
    )}" ? "true" : "false")
         << ",\\"actualOutput\\":\\"" << actual
         << "\\",\\"expectedOutput\\":\\"${escapeCString(test.expected)}\\"}";
    first = false;
  }`;
  })
  .join("\n")}
  cout << "]}";
  return 0;
}`}
`;

const buildCPrelude = (language: "c" | "cpp") =>
  language === "c"
    ? `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
`
    : `#include <bits/stdc++.h>
using namespace std;
typedef long long llong;
typedef long long ll;
`;

function escapeCString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function bodyComment(functionName: string, tests: CodeSubmitBody["tests"]) {
  return `/* Auto-generated harness for ${functionName} with ${tests.length} tests */`;
}

export const runCodeSubmission = async (body: CodeSubmitBody): Promise<CodeSubmitResult> => {
  const language = body.language.toLowerCase();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coding-runner-"));
  const fileId = randomUUID();

  try {
    if (!body.code.trim()) throw new Error("Code is required.");
    if (!body.functionName.trim()) throw new Error("Function name is required for test execution.");
    if (!Array.isArray(body.tests) || body.tests.length === 0) {
      throw new Error("At least one sample test is required.");
    }

    if (language === "python") {
      const filePath = path.join(tempDir, `${fileId}.py`);
      await fs.writeFile(filePath, `${body.code}\n\n${buildPythonHarness(body.functionName, body.tests)}`, "utf8");
      const result = await execute("python", [filePath], tempDir);
      if (result.code !== 0 && !result.stdout.trim()) throw new Error(result.stderr || "Python execution failed.");
      const extracted = extractJsonPayload(result.stdout.trim());
      return {
        output: extracted.prelude,
        errors: result.stderr.trim(),
        executionTimeMs: result.executionTimeMs,
        results: extracted.parsed.results,
      };
    }

    if (language === "javascript") {
      const filePath = path.join(tempDir, `${fileId}.mjs`);
      await fs.writeFile(filePath, `${body.code}\n\n${buildJavaScriptHarness(body.functionName, body.tests)}`, "utf8");
      const result = await execute("node", [filePath], tempDir);
      if (result.code !== 0 && !result.stdout.trim()) throw new Error(result.stderr || "JavaScript execution failed.");
      const extracted = extractJsonPayload(result.stdout.trim());
      return {
        output: extracted.prelude,
        errors: result.stderr.trim(),
        executionTimeMs: result.executionTimeMs,
        results: extracted.parsed.results,
      };
    }

    if (language === "c" || language === "c++" || language === "cpp") {
      const normalizedLanguage = language === "c" ? "c" : "cpp";
      const sourceExt = normalizedLanguage === "c" ? "c" : "cpp";
      const compiler = normalizedLanguage === "c" ? "gcc" : "g++";
      const standardFlag = normalizedLanguage === "c" ? "-std=gnu11" : "-std=gnu++17";
      const sourcePath = path.join(tempDir, `${fileId}.${sourceExt}`);
      const executablePath = path.join(tempDir, process.platform === "win32" ? `${fileId}.exe` : fileId);
      await fs.writeFile(
        sourcePath,
        `${buildCPrelude(normalizedLanguage)}\n${body.code}\n\n${buildCHarness(body.code, body.functionName, body.tests, normalizedLanguage)}`,
        "utf8",
      );
      const compileResult = await execute(compiler, [standardFlag, sourcePath, "-o", executablePath], tempDir);
      if (compileResult.code !== 0) {
        throw new Error(compileResult.stderr || `${normalizedLanguage.toUpperCase()} compilation failed.`);
      }
      const runResult = await execute(executablePath, [], tempDir);
      if (runResult.code !== 0 && !runResult.stdout.trim()) {
        throw new Error(runResult.stderr || `${normalizedLanguage.toUpperCase()} execution failed.`);
      }
      const extracted = extractJsonPayload(runResult.stdout.trim());
      return {
        output: extracted.prelude,
        errors: [compileResult.stderr.trim(), runResult.stderr.trim()].filter(Boolean).join("\n"),
        executionTimeMs: compileResult.executionTimeMs + runResult.executionTimeMs,
        results: extracted.parsed.results,
      };
    }

    throw new Error("Execution is currently available for Python, JavaScript, C, and C++ tracks.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
