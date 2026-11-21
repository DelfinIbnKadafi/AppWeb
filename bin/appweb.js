#!/usr/bin/env node
const { run } = require("../src/cli");

run(process.argv.slice(2)).catch((err) => {
  console.error("\nError: " + err.message);
  process.exit(1);
});
