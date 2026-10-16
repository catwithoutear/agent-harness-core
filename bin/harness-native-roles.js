#!/usr/bin/env node
import { runNativeRoles } from "../lib/project/native-roles.js";
process.exit(runNativeRoles(process.argv.slice(2)));
