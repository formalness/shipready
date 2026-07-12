import { describe, expect, it } from "vitest";
import { generateAgentsMd } from "../src/generators/agentsMd.js";
import { generateClaudeMd } from "../src/generators/claudeMd.js";
import { generateCursorRules } from "../src/generators/cursorRules.js";
import type { ProjectInfo } from "../src/types.js";

const project: ProjectInfo = {
  root: "/tmp/demo",
  hasPackageJson: true,
  packageJson: { name: "demo-app" },
  packageManager: "pnpm",
  framework: "Next.js",
  scripts: {
    dev: "next dev",
    build: "next build",
    test: "vitest",
    lint: "eslint .",
  },
  sourceFiles: ["src/app.ts", "src/lib/db.ts", "tests/app.test.ts"],
};

describe("generateAgentsMd", () => {
  const content = generateAgentsMd(project);

  it("includes detected framework and package manager", () => {
    expect(content).toContain("Next.js");
    expect(content).toContain("pnpm");
  });

  it("includes install and script commands", () => {
    expect(content).toContain("pnpm install");
    expect(content).toContain("pnpm dev");
    expect(content).toContain("pnpm build");
    expect(content).toContain("pnpm test");
    expect(content).toContain("pnpm lint");
  });

  it("includes agent rules", () => {
    expect(content).toContain("Do not edit .env files directly.");
    expect(content).toContain("Do not commit secrets or API keys.");
  });

  it("includes project structure summary", () => {
    expect(content).toContain("`src/`");
    expect(content).toContain("`tests/`");
  });
});

describe("generateClaudeMd", () => {
  it("includes project name and rules", () => {
    const content = generateClaudeMd(project);
    expect(content).toContain("demo-app");
    expect(content).toContain("Do not commit secrets or API keys.");
  });
});

describe("generateCursorRules", () => {
  it("includes framework and rules", () => {
    const content = generateCursorRules(project);
    expect(content).toContain("Next.js");
    expect(content).toContain("Do not edit .env files directly.");
  });
});
