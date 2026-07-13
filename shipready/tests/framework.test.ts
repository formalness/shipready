import { describe, expect, it } from "vitest";
import { detectFramework, installCommand, runCommand } from "../src/utils/framework.js";

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
