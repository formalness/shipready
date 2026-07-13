import type { CheckResult, Finding } from "../types.js";

export interface TodoFinding {
  kind: "marker" | "debug";
  label: string;
  file: string;
  line: number;
}

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b/;
const DEBUG_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "console.log", re: /\bconsole\.log\s*\(/ },
  { label: "debugger", re: /^\s*debugger\b/ },
  {
    label: "not implemented",
    re: /throw new Error\((?:"Not implemented"|'Not implemented')\)/,
  },
];

/** Scans a file's content for TODO/debug markers. */
export function scanContentForTodos(
  content: string,
  file: string
): TodoFinding[] {
  const found: TodoFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Same suppression marker the secret scanner honors - one convention
    // for all checks, so intentional console.log/TODO lines stay quiet.
    if (line.includes("shipready-ignore")) continue;
    const marker = line.match(MARKER_RE);
    if (marker) {
      found.push({ kind: "marker", label: marker[1], file, line: i + 1 });
    }
    for (const { label, re } of DEBUG_PATTERNS) {
      if (re.test(line)) {
        found.push({ kind: "debug", label, file, line: i + 1 });
      }
    }
  }
  return found;
}

/** Builds the CheckResult from all todo/debug findings. */
export function checkTodos(todoFindings: TodoFinding[]): CheckResult {
  const findings: Finding[] = [];

  const markers = todoFindings.filter((f) => f.kind === "marker");
  const debug = todoFindings.filter((f) => f.kind === "debug");

  if (markers.length === 0 && debug.length === 0) {
    findings.push({
      severity: "success",
      rule: "todos.clean",
      message: "No TODO/FIXME or debug leftovers found",
    });
    return { name: "todos", findings };
  }

  if (markers.length > 0) {
    findings.push({
      severity: "warning",
      rule: "todos.markers",
      message: `${markers.length} TODO/FIXME comment${markers.length > 1 ? "s" : ""} found`,
    });
  }
  if (debug.length > 0) {
    const logs = debug.filter((d) => d.label === "console.log").length;
    const other = debug.length - logs;
    const parts: string[] = [];
    if (logs > 0) parts.push(`${logs} console.log call${logs > 1 ? "s" : ""}`);
    if (other > 0) parts.push(`${other} other debug marker${other > 1 ? "s" : ""}`);
    findings.push({
      severity: "warning",
      rule: "todos.debug",
      message: `${parts.join(" and ")} found`,
    });
  }

  for (const f of todoFindings) {
    findings.push({
      severity: "info",
      rule: "todos.item",
      message: f.label,
      file: f.file,
      line: f.line,
    });
  }

  return { name: "todos", findings };
}
