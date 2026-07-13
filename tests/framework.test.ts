import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectFramework,
  detectPackageManager,
  installCommand,
  isNodeEcosystem,
  runCommand,
  findWorkspaceDirs,
  detectExtraLanguages,
} from "../src/utils/framework.js";
import { checkPackageJson } from "../src/checks/packageJson.js";
import type { ProjectInfo } from "../src/types.js";

describe("detectFramework", () => {
  it("detects Next.js", () => {
    expect(detectFramework({ dependencies: { next: "^15.0.0", react: "^19" } })).toBe("Next.js");
  });

  it("detects NestJS before Express", () => {
    expect(
      detectFramework({ dependencies: { "@nestjs/core": "^10", express: "^4" } })
    ).toBe("NestJS");
  });

  it("detects Vite", () => {
    expect(detectFramework({ devDependencies: { vite: "^6" } })).toBe("Vite");
  });

  it("detects plain React", () => {
    expect(detectFramework({ dependencies: { react: "^19" } })).toBe("React");
  });

  it("detects Vue", () => {
    expect(detectFramework({ dependencies: { vue: "^3" } })).toBe("Vue");
  });

  it("detects Svelte", () => {
    expect(detectFramework({ devDependencies: { svelte: "^5" } })).toBe("Svelte");
  });

  it("detects Express", () => {
    expect(detectFramework({ dependencies: { express: "^4" } })).toBe("Express");
  });

  it("falls back to Node.js", () => {
    expect(detectFramework({ dependencies: {} })).toBe("Node.js");
  });

  it("returns unknown without package.json", () => {
    expect(detectFramework(null)).toBe("unknown");
  });
});

describe("commands", () => {
  it("builds install commands", () => {
    expect(installCommand("pnpm")).toBe("pnpm install");
    expect(installCommand("npm")).toBe("npm install");
    expect(installCommand("bun")).toBe("bun install");
  });

  it("builds run commands", () => {
    expect(runCommand("pnpm", "dev")).toBe("pnpm dev");
    expect(runCommand("npm", "build")).toBe("npm run build");
    expect(runCommand("yarn", "test")).toBe("yarn test");
  });
});

describe("detectFramework fallback (no package.json)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-fw-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const write = (rel: string, content = "") => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  it("detects a static HTML site", () => {
    const files = ["index.html", "about.html", "js/main.js"];
    expect(detectFramework(null, tmp, files)).toBe("Static HTML");
  });

  it("detects Python by pyproject.toml", () => {
    write("pyproject.toml", "[project]\nname='x'");
    expect(detectFramework(null, tmp, ["main.py"])).toBe("Python");
  });

  it("detects Python by dominant .py files without manifest", () => {
    expect(detectFramework(null, tmp, ["app.py", "utils.py", "models.py"])).toBe("Python");
  });

  it("detects Rust by Cargo.toml", () => {
    write("Cargo.toml", "[package]");
    expect(detectFramework(null, tmp, ["src/main.rs"])).toBe("Rust");
  });

  it("detects Go by go.mod", () => {
    write("go.mod", "module x");
    expect(detectFramework(null, tmp, ["main.go"])).toBe("Go");
  });

  it("detects plain JS project as Node.js", () => {
    expect(detectFramework(null, tmp, ["server.js", "lib/util.js"])).toBe("Node.js");
  });

  it("detects Astro from dependencies", () => {
    expect(detectFramework({ dependencies: { astro: "^4.0.0" } })).toBe("Astro");
  });

  it("detects Remix from dependencies", () => {
    expect(detectFramework({ dependencies: { "@remix-run/react": "^2.0.0" } })).toBe("Remix");
  });

  it("detects Angular from dependencies", () => {
    expect(detectFramework({ dependencies: { "@angular/core": "^17.0.0" } })).toBe("Angular");
  });
});

describe("detectPackageManager fallback", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-pm-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const write = (rel: string, content = "") => {
    fs.writeFileSync(path.join(tmp, rel), content);
  };

  it("returns npm for package.json without lockfile", () => {
    write("package.json", "{}");
    expect(detectPackageManager(tmp)).toBe("npm");
  });

  it("detects pip via requirements.txt", () => {
    write("requirements.txt", "flask");
    expect(detectPackageManager(tmp)).toBe("pip");
  });

  it("detects poetry via poetry.lock", () => {
    write("poetry.lock", "");
    expect(detectPackageManager(tmp)).toBe("poetry");
  });

  it("detects cargo via Cargo.toml", () => {
    write("Cargo.toml", "[package]");
    expect(detectPackageManager(tmp)).toBe("cargo");
  });

  it("detects go via go.mod", () => {
    write("go.mod", "module x");
    expect(detectPackageManager(tmp)).toBe("go");
  });

  it("returns none for a bare static site", () => {
    write("index.html", "<html></html>");
    expect(detectPackageManager(tmp)).toBe("none");
  });
});

describe("package.json check for non-Node projects", () => {
  const projectFor = (framework: ProjectInfo["framework"]): ProjectInfo => ({
    root: "/tmp/x",
    hasPackageJson: false,
    packageJson: null,
    packageManager: "none",
    framework,
    scripts: {},
    sourceFiles: [],
  });

  it("does not penalize a static HTML site", () => {
    const result = checkPackageJson(projectFor("Static HTML"));
    expect(result.findings[0].rule).toBe("package-json.not-applicable");
    expect(result.findings[0].severity).toBe("info");
  });

  it("does not penalize a Python project", () => {
    const result = checkPackageJson(projectFor("Python"));
    expect(result.findings[0].rule).toBe("package-json.not-applicable");
  });

  it("still flags a Node.js project without package.json", () => {
    const result = checkPackageJson(projectFor("Node.js"));
    expect(result.findings[0].rule).toBe("package-json.missing");
    expect(result.findings[0].severity).toBe("error");
  });
});

describe("isNodeEcosystem", () => {
  it("treats Next.js as Node ecosystem", () => {
    expect(isNodeEcosystem("Next.js")).toBe(true);
  });

  it("treats Static HTML and Python as non-Node", () => {
    expect(isNodeEcosystem("Static HTML")).toBe(false);
    expect(isNodeEcosystem("Python")).toBe(false);
  });
});

describe("findWorkspaceDirs / monorepo framework detection", () => {
  it("expands workspace globs and detects the framework from workspace packages", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-mono-"));
    try {
      fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "apps", "web", "package.json"),
        JSON.stringify({ name: "web", dependencies: { next: "16.0.0" } })
      );
      const rootPkg = { name: "mono", workspaces: ["apps/*"] };
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(rootPkg));

      const dirs = findWorkspaceDirs(root, rootPkg);
      expect(dirs).toEqual([path.join("apps", "web")]);
      // Root has no framework deps, but the workspace app is Next.js.
      expect(detectFramework(rootPkg, root, [], dirs)).toBe("Next.js");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads packages from pnpm-workspace.yaml", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-pnpm-"));
    try {
      fs.mkdirSync(path.join(root, "packages", "ui"), { recursive: true });
      fs.writeFileSync(path.join(root, "packages", "ui", "package.json"), "{}");
      fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - \"packages/*\"\n");
      expect(findWorkspaceDirs(root, null)).toEqual([path.join("packages", "ui")]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no workspaces for a plain single-package repo", () => {
    expect(findWorkspaceDirs("/nonexistent", { name: "x" })).toEqual([]);
  });
});

describe("deep workspaces, pseudo-workspaces, and extra languages", () => {
  it("expands ** workspace globs one nesting level deep", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-deep-"));
    try {
      fs.mkdirSync(path.join(root, "packages", "integrations", "react"), { recursive: true });
      fs.writeFileSync(path.join(root, "packages", "integrations", "react", "package.json"), "{}");
      const dirs = findWorkspaceDirs(root, { name: "x", workspaces: ["packages/**/*"] } as never);
      expect(dirs).toContain(path.join("packages", "integrations", "react"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats conventional frontend/backend dirs as pseudo-workspaces", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-pseudo-"));
    try {
      fs.mkdirSync(path.join(root, "frontend"), { recursive: true });
      fs.writeFileSync(path.join(root, "frontend", "package.json"), "{}");
      expect(findWorkspaceDirs(root, { name: "x" } as never)).toEqual(["frontend"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects Python alongside a JS framework", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipready-lang-"));
    try {
      fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"api\"\n");
      expect(detectExtraLanguages(root, "Vite")).toEqual(["Python"]);
      // A Python project should not list Python as "extra".
      expect(detectExtraLanguages(root, "Python")).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

