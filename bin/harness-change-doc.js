#!/usr/bin/env node
import { runChangeDoc } from "../lib/change/doc-tool.js";

process.exitCode = runChangeDoc(process.argv.slice(2));
