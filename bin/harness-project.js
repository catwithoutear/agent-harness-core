#!/usr/bin/env node
import { runHarnessProject } from "../lib/project/projector.js";

process.exit(runHarnessProject(process.argv.slice(2)));
