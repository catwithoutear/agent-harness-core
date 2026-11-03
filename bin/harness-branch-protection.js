#!/usr/bin/env node
import process from "node:process";
import { runBranchProtection } from "../lib/branch-protection.js";

process.exit(runBranchProtection(process.argv.slice(2)));
