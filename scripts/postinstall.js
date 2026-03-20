#!/usr/bin/env node

/**
 * postinstall script — registers spm:// protocol handler with the OS.
 * Runs automatically after `npm install -g @skillbase/spm`.
 * Failures are non-fatal (protocol handler is optional).
 */

// Skip in CI environments
if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
  process.exit(0);
}

async function main() {
  try {
    const { registerProtocol } = await import("../dist/core/protocol/register.js");
    await registerProtocol();
  } catch {
    // Non-fatal: protocol handler is a convenience feature
  }
}

main();
