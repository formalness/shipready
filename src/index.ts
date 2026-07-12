#!/usr/bin/env node
import { run } from "./cli.js";

run(process.argv).catch((err: unknown) => {
  console.error(`shipready: ${(err as Error).message}`);
  process.exit(1);
});
