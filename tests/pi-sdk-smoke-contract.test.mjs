import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  parseCompatDiagnostics,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const patchedHash = "a".repeat(64);
const unchangedHash = "b".repeat(64);
const diagnostic = (fields = {}) => ({
  source: "pi-cursor-embedded-compat",
  action: "patched",
  ...fields,
});
const goodRuntime = {
  diagnostic: diagnostic(),
  target_sha256: patchedHash,
  expected_patched_sha256: patchedHash,
  expected_unchanged_sha256: unchangedHash,
  exit_code: 0,
  process_exit_observed: true,
  timed_out: false,
  unhandled_error: false,
  extension_load_error: false,
  shell: "/bin/sh",
  expected_shell: "/bin/sh",
};

function passed(name, observation = goodRuntime) {
  return behaviorAssertions(name, observation).every((item) => item.passed);
}

test("declares the behavior-v2 contract and parses only complete compatibility diagnostics", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(parseCompatDiagnostics(
    `noise\n[cursor_compat] ${JSON.stringify(diagnostic())}\n[cursor_compat] {bad json}\n`,
  ), [diagnostic()]);
  assert.deepEqual(parseCompatDiagnostics("[cursor_compat] {\"source\":\"partial\"}"), [{ source: "partial" }]);
  assert.deepEqual(parseCompatDiagnostics("not a diagnostic"), []);
});

test("extension load and happy path require real diagnostic and target-file observations", () => {
  assert.deepEqual(behaviorAssertions("extension_load", goodRuntime).map((item) => item.id), ["extension_registered"]);
  assert.equal(passed("extension_load"), true);
  assert.equal(passed("extension_load", { ...goodRuntime, diagnostic: null }), false);
  assert.equal(passed("extension_load", { ...goodRuntime, exit_code: 1 }), false);

  assert.deepEqual(behaviorAssertions("happy_path", goodRuntime).map((item) => item.id), ["feature_response"]);
  assert.equal(passed("happy_path"), true);
  for (const bad of [
    { ...goodRuntime, diagnostic: diagnostic({ action: "already_patched" }) },
    { ...goodRuntime, target_sha256: unchangedHash },
    { ...goodRuntime, diagnostic: diagnostic({ source: "foreign" }) },
  ]) {
    assert.equal(passed("happy_path", bad), false);
  }
});

test("handled error requires a captured Pi load failure, exact code, expected exit and no file mutation", () => {
  const error = {
    ...goodRuntime,
    diagnostic: diagnostic({ code: "signature_mismatch", action: undefined }),
    target_sha256: unchangedHash,
    expected_unchanged_sha256: unchangedHash,
    extension_load_error: true,
    captured_extension_failure: true,
    exit_code: 1,
  };
  assert.deepEqual(behaviorAssertions("error_path", error).map((item) => item.id), ["handled_error"]);
  assert.equal(passed("error_path", error), true);
  for (const bad of [
    { ...error, diagnostic: diagnostic({ code: "write_failed" }) },
    { ...error, target_sha256: patchedHash },
    { ...error, extension_load_error: false },
    { ...error, captured_extension_failure: false },
    { ...error, unhandled_error: true },
    { ...error, exit_code: 0 },
  ]) {
    assert.equal(passed("error_path", bad), false);
  }
});

test("reload requires a successful first process and second-process registration, response and clean exit", () => {
  const reload = {
    ...goodRuntime,
    diagnostic: diagnostic({ action: "already_patched" }),
    first_process_diagnostic: diagnostic(),
    first_process_exit_code: 0,
    first_process_exit_observed: true,
    first_process_timed_out: false,
    first_process_unhandled_error: false,
    first_process_extension_load_error: false,
  };
  assert.deepEqual(behaviorAssertions("reload_cleanup", reload).map((item) => item.id), [
    "reloaded_extension_registered",
    "reloaded_feature_response",
    "clean_shutdown",
  ]);
  assert.ok(behaviorAssertions("reload_cleanup", reload).every((item) => item.passed));

  const missingResponse = [
    { ...reload, diagnostic: null },
    { ...reload, diagnostic: diagnostic({ action: "patched" }) },
    { ...reload, diagnostic: diagnostic({ source: "foreign", action: "already_patched" }) },
    { ...reload, target_sha256: unchangedHash },
    { ...reload, first_process_diagnostic: null },
    { ...reload, first_process_exit_code: 1 },
    { ...reload, exit_code: 1 },
    { ...reload, unhandled_error: true },
  ];
  for (const bad of missingResponse) {
    assert.ok(behaviorAssertions("reload_cleanup", bad).some((item) => !item.passed));
  }
});

test("native shell case requires the expected shell, actual Pi diagnostic and patched file", () => {
  assert.deepEqual(behaviorAssertions("host_shell", goodRuntime).map((item) => item.id), ["native_shell_boundary"]);
  assert.equal(passed("host_shell"), true);
  assert.equal(passed("host_shell", { ...goodRuntime, shell: "other-shell" }), false);
  assert.equal(passed("host_shell", { ...goodRuntime, diagnostic: null }), false);
  assert.equal(passed("host_shell", { ...goodRuntime, target_sha256: unchangedHash }), false);
});
