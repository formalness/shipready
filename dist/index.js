#!/usr/bin/env node
import { run } from "./cli.js";
run(process.argv).catch((err) => {
    console.error(`shipready: ${err.message}`);
    process.exit(1);
});
