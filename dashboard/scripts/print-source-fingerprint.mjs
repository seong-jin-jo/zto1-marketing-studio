#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { sourceFingerprint } from "./lib/source-evidence.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoot = path.resolve(process.argv[2] || defaultRoot);
process.stdout.write(`${await sourceFingerprint(dashboardRoot)}\n`);
