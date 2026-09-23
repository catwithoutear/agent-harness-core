/**
 * Canonical source template for the self-contained ZCode context adapter.
 * The projector renders the two marker expressions into a standalone module;
 * projected adapters must not import from this package or the source tree.
 */
export const ZCODE_CONTEXT_ADAPTER_RUNTIME = "zcode-context-adapter@1";

export const ZCODE_CONTEXT_ADAPTER_TEMPLATE = `#!/usr/bin/env node
import process from "node:process";

const intent = __HARNESS_ZCODE_INTENT__;
const context = __HARNESS_ZCODE_CONTEXT__;

// Drain hook input without allowing untrusted data to affect the result.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  void intent;
  process.stdout.write(JSON.stringify({ additionalContext: context }) + "\\n");
});
process.stdin.resume();
`;

export function renderZCodeContextAdapter({ intent, context }) {
  if (typeof intent !== "string" || intent.length === 0) {
    throw new TypeError("ZCode adapter intent must be a non-empty string");
  }
  if (typeof context !== "string") {
    throw new TypeError("ZCode adapter context must be a string");
  }
  return ZCODE_CONTEXT_ADAPTER_TEMPLATE
    .replace("__HARNESS_ZCODE_INTENT__", JSON.stringify(intent))
    .replace("__HARNESS_ZCODE_CONTEXT__", JSON.stringify(context));
}
