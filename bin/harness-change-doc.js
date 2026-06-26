#!/usr/bin/env node
import { runChangeDoc } from "../lib/change/doc-tool.js";

process.exit(runChangeDoc(process.argv.slice(2)));
