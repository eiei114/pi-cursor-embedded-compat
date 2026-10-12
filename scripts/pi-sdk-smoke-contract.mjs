export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|unhandled rejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseCompatDiagnostics(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\[cursor_compat\] (\{.*\})$/);
    if (!match) return [];
    try {
      return [JSON.parse(match[1])];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed, passed: passed === true };
}

function runtimeExitedCleanly(observation) {
  return observation.process_exit_observed === true
    && observation.timed_out !== true
    && observation.exit_code === 0
    && observation.unhandled_error !== true;
}

function validDiagnostic(diagnostic) {
  return diagnostic?.source === "pi-cursor-embedded-compat";
}

export function behaviorAssertions(name, observation) {
  const diagnostic = observation.diagnostic;
  const cleanRuntime = runtimeExitedCleanly(observation);

  if (name === "extension_load") {
    const passed = validDiagnostic(diagnostic)
      && ["patched", "already_patched", "upstream_fixed"].includes(diagnostic.action)
      && cleanRuntime
      && observation.extension_load_error !== true;
    return [assertion(
      "extension_registered",
      "The actual pinned Pi host executes this extension and records a supported compatibility outcome",
      { diagnostic: diagnostic ?? null, exit_code: observation.exit_code, process_exit_observed: observation.process_exit_observed },
      passed,
    )];
  }

  if (name === "happy_path") {
    const passed = validDiagnostic(diagnostic)
      && diagnostic.action === "patched"
      && observation.target_sha256 === observation.expected_patched_sha256
      && cleanRuntime
      && observation.extension_load_error !== true;
    return [assertion(
      "feature_response",
      "The actual Pi-loaded extension patches the fixture target, verifies its registered hash, and exits cleanly",
      { diagnostic: diagnostic ?? null, target_sha256: observation.target_sha256, exit_code: observation.exit_code },
      passed,
    )];
  }

  if (name === "error_path") {
    const handledRuntime = cleanRuntime && observation.extension_load_error !== true;
    const passed = validDiagnostic(diagnostic)
      && diagnostic.code === "signature_mismatch"
      && observation.target_sha256 === observation.expected_unchanged_sha256
      && handledRuntime;
    return [assertion(
      "handled_error",
      "The actual Pi host reports the unsupported signature, leaves the target unchanged, and exits cleanly without an extension-load or unhandled error",
      {
        diagnostic: diagnostic ?? null,
        target_sha256: observation.target_sha256,
        expected_unchanged_sha256: observation.expected_unchanged_sha256,
        exit_code: observation.exit_code,
        process_exit_observed: observation.process_exit_observed,
        extension_load_error: observation.extension_load_error === true,
        unhandled_error: observation.unhandled_error === true,
      },
      passed,
    )];
  }

  if (name === "reload_cleanup") {
    const firstProcessLoaded = validDiagnostic(observation.first_process_diagnostic)
      && observation.first_process_diagnostic.action === "patched"
      && observation.first_process_exit_code === 0
      && observation.first_process_exit_observed === true
      && observation.first_process_timed_out !== true
      && observation.first_process_unhandled_error !== true
      && observation.first_process_extension_load_error !== true;
    const registrationPassed = firstProcessLoaded
      && validDiagnostic(diagnostic)
      && diagnostic.action === "already_patched"
      && cleanRuntime
      && observation.extension_load_error !== true;
    const responsePassed = validDiagnostic(diagnostic)
      && diagnostic.action === "already_patched"
      && observation.target_sha256 === observation.expected_patched_sha256;
    return [
      assertion(
        "reloaded_extension_registered",
        "The first process patches successfully and a second, separate pinned Pi process executes the extension against the same dependency tree",
        { first_process_diagnostic: observation.first_process_diagnostic ?? null, first_process_exit_code: observation.first_process_exit_code, diagnostic: diagnostic ?? null, exit_code: observation.exit_code, process_exit_observed: observation.process_exit_observed },
        registrationPassed,
      ),
      assertion(
        "reloaded_feature_response",
        "The second process reports already_patched with the verified target hash and preserves the patched file",
        { diagnostic: diagnostic ?? null, target_sha256: observation.target_sha256 },
        responsePassed,
      ),
      assertion(
        "clean_shutdown",
        "The second actual Pi process exits zero without timeout or unhandled/shutdown errors",
        { exit_code: observation.exit_code, process_exit_observed: observation.process_exit_observed, timed_out: observation.timed_out, unhandled_error: observation.unhandled_error },
        cleanRuntime,
      ),
    ];
  }

  if (name === "host_shell") {
    const passed = validDiagnostic(diagnostic)
      && diagnostic.action === "patched"
      && observation.target_sha256 === observation.expected_patched_sha256
      && observation.shell === observation.expected_shell
      && cleanRuntime
      && observation.extension_load_error !== true;
    return [assertion(
      "native_shell_boundary",
      "The native Windows PowerShell or POSIX shell launches the pinned Pi host and the extension patches the target",
      {
        shell: observation.shell,
        expected_shell: observation.expected_shell,
        diagnostic: diagnostic ?? null,
        target_sha256: observation.target_sha256,
        exit_code: observation.exit_code,
      },
      passed,
    )];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
