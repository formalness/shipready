import { describe, expect, it } from "vitest";
import {
  hasLongRepeat,
  hasSequentialRun,
  shannonEntropy,
} from "../src/utils/entropy.js";

describe("shannonEntropy", () => {
  it("is 0 for a single repeated character", () => {
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
  });

  it("is 0 for the empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("is high for random-looking tokens", () => {
    expect(shannonEntropy("Zq9rT3mN8vL2wX5cB7dF1gH4")).toBeGreaterThan(4);
  });

  it("is low for dictionary-like words", () => {
    expect(shannonEntropy("passwordpassword")).toBeLessThan(3);
  });
});

describe("hasLongRepeat", () => {
  it("detects 5+ repeated characters", () => {
    expect(hasLongRepeat("sk-aaaaa-key")).toBe(true);
    expect(hasLongRepeat("-----BEGIN")).toBe(true);
  });

  it("passes random strings", () => {
    expect(hasLongRepeat("Zq9rT3mN8vL2wX5c")).toBe(false);
  });
});

describe("hasSequentialRun", () => {
  it("detects ascending runs", () => {
    expect(hasSequentialRun("key-abcdefghij")).toBe(true);
    expect(hasSequentialRun("0123456789")).toBe(true);
  });

  it("detects descending runs", () => {
    expect(hasSequentialRun("987654321a")).toBe(true);
  });

  it("passes random strings", () => {
    expect(hasSequentialRun("Zq9rT3mN8vL2wX5cB7dF")).toBe(false);
  });
});
