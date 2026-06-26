#!/usr/bin/env node
import { runChangeValidate } from "../lib/change/validator.js";

process.exit(runChangeValidate(process.argv.slice(2)));
