import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORT_REGISTRY } from "../lib/registry.ts";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  parseCompatDiagnostics,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";
import { writePiSdkSmokeReport } from "./pi-sdk-smoke-report.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE_TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const FROZEN_VERSION = "1.2.0";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) => {
  const version = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== FROZEN_VERSION || version !== FROZEN_VERSION) {
    throw new Error(`Smoke requires the exact ${FROZEN_VERSION} dev/test SDK pin for ${name}; found manifest=${manifest.devDependencies?.[name]}, installed=${version}`);
  }
  return [name, version];
}));
if (manifest.peerDependencies?.["@earendil-works/pi-coding-agent"] !== "*") {
  throw new Error("Smoke requires the public Pi coding-agent peer range to remain '*'");
}

const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const entry = SUPPORT_REGISTRY[0];
const originalSource = readFileSync(resolve(root, "tests/fixtures/http-headers-connect-1.7.0.js"), "utf8");
const patchedSource = originalSource.replace(entry.failureSignature, entry.replacement);
const patchedSha256 = hash(patchedSource);
if (patchedSha256 !== entry.patchedSha256) {
  throw new Error("Smoke fixture no longer matches the registered patched hash");
}
const unknownSource = originalSource.replace("protoBase64.enc(bytes)", "protoBase64.enc(bytes, true)");
if (unknownSource === originalSource || !unknownSource.includes(entry.failureSignature)) {
  throw new Error("Smoke negative fixture must retain the registered failure signature while changing its hash");
}

function writePackage(rootPath, name, version) {
  const packagePath = join(rootPath, "node_modules", ...name.split("/"));
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(join(packagePath, "package.json"), JSON.stringify({ name, version }, null, 2) + "\n");
  return packagePath;
}

function createFixture(name, targetSource) {
  const directory = mkdtempSync(join(smokeRoot, `${name} fixture `));
  const extensionPath = join(directory, "extensions", "index.ts");
  mkdirSync(dirname(extensionPath), { recursive: true });
  copyFileSync(resolve(root, "extensions/index.ts"), extensionPath);
  for (const file of ["contracts.ts", "live-target.ts", "patch-core.ts", "registry.ts"]) {
    const destination = join(directory, "lib", file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(root, "lib", file), destination);
  }

  writePackage(directory, "pi-cursor-sdk", entry.graph.piCursorSdk);
  writePackage(directory, "@cursor/sdk", entry.graph.cursorSdk);
  const connectRoot = writePackage(directory, "@connectrpc/connect", entry.graph.connect);
  writePackage(directory, "@bufbuild/protobuf", entry.graph.protobuf);
  const targetPath = join(connectRoot, ...entry.targetRelativePath.split("/"));
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, targetSource, "utf8");
  return { directory, extensionPath, targetPath };
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotePosix(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function piArguments(extensionPath) {
  return [
    "--offline",
    "--no-session",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-context-files",
    "--no-prompt-templates",
    "--no-mcp",
    "-e",
    extensionPath,
    "--mode",
    "rpc",
  ];
}

function killOwnedTree(child) {
  if (!child.pid) return "no child PID was assigned";
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      timeout: 500,
      windowsHide: true,
    });
    if (result.error) return `taskkill error: ${result.error.message}`;
    return `taskkill exit ${result.status}: ${(result.stdout ?? "").trim()} ${(result.stderr ?? "").trim()}`.trim();
  }
  try {
    child.kill("SIGKILL");
    return "sent SIGKILL to owned child";
  } catch (error) {
    return `kill error: ${error.message}`;
  }
}

function runBounded(executable, args, { cwd, env, input = "" }) {
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let spawnError;
    let timedOut = false;
    let outputLimitExceeded = false;
    let processExitObserved = false;
    let actualExitCode = null;
    let actualSignal = null;
    let cleanupAction = null;
    let settled = false;
    let deadline;
    let cleanupCheck;
    let finalCleanupCheck;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(cleanupCheck);
      clearTimeout(finalCleanupCheck);
      resolveResult({
        stdout,
        stderr,
        actualExitCode,
        actualSignal,
        processExitObserved,
        timedOut,
        outputLimitExceeded,
        spawnError: spawnError?.message,
        cleanupAction,
      });
    };
    const terminate = () => {
      if (cleanupAction !== null) return;
      cleanupAction = killOwnedTree(child);
      cleanupCheck = setTimeout(() => {
        if (processExitObserved) return;
        cleanupAction += "; " + killOwnedTree(child);
        finalCleanupCheck = setTimeout(() => {
          if (!processExitObserved) cleanupAction += "; process exit not observed within cleanup grace";
          finish();
        }, 250);
      }, 250);
    };
    const capture = (current, chunk) => {
      if (current.length >= OUTPUT_LIMIT) {
        outputLimitExceeded = true;
        terminate();
        return current;
      }
      const remaining = OUTPUT_LIMIT - current.length;
      const text = chunk.toString("utf8");
      const next = current + text.slice(0, remaining);
      if (text.length > remaining) {
        outputLimitExceeded = true;
        terminate();
      }
      return next;
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = capture(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = capture(stderr, chunk); });
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code, signal) => {
      processExitObserved = Number.isInteger(child.pid);
      actualExitCode = code;
      actualSignal = signal;
      finish();
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    deadline = setTimeout(() => {
      timedOut = true;
      terminate();
    }, PROBE_TIMEOUT_MS);
  });
}

function launchSpec(extensionPath, agentDir) {
  const args = piArguments(extensionPath);
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const command = `& ${[process.execPath, piCli, ...args].map(quotePowerShell).join(" ")}; exit $LASTEXITCODE`;
    return { shell: "powershell.exe", executable: shell, args: ["-NoProfile", "-NonInteractive", "-Command", command], env };
  }
  const command = `exec ${[process.execPath, piCli, ...args].map(quotePosix).join(" ")}`;
  return { shell: "/bin/sh", executable: "/bin/sh", args: ["-c", command], env };
}

async function runPi(extensionPath, directory, agentDir, useHostShell = false) {
  if (!useHostShell) {
    return runBounded(process.execPath, [piCli, ...piArguments(extensionPath)], {
      cwd: directory,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
    });
  }
  const spec = launchSpec(extensionPath, agentDir);
  return runBounded(spec.executable, spec.args, { cwd: directory, env: spec.env });
}

function inspectTarget(targetPath) {
  try {
    const content = readFileSync(targetPath, "utf8");
    return { content, sha256: hash(content) };
  } catch {
    return { content: null, sha256: null };
  }
}

function sanitizeEvidence(value) {
  return value.replaceAll(smokeRoot, "<smoke-root>");
}

function makeCase(name, run, targetPath, expected, additionalRuns = []) {
  const fullOutput = `${run.stdout}${run.stderr}`;
  const diagnostics = parseCompatDiagnostics(fullOutput);
  const diagnostic = diagnostics.at(-1) ?? null;
  const target = inspectTarget(targetPath);
  const priorRun = additionalRuns.at(-1);
  const priorOutput = priorRun ? `${priorRun.stdout}${priorRun.stderr}` : "";
  const priorObservation = priorRun ? {
    diagnostic: parseCompatDiagnostics(priorOutput).at(-1) ?? null,
    exit_code: priorRun.actualExitCode,
    process_exit_observed: priorRun.processExitObserved,
    timed_out: priorRun.timedOut,
    unhandled_error: UNHANDLED_ERROR_PATTERN.test(priorOutput),
    extension_load_error: EXTENSION_LOAD_ERROR_PATTERN.test(priorOutput),
  } : {};
  const observation = {
    diagnostic,
    target_sha256: target.sha256,
    expected_patched_sha256: patchedSha256,
    expected_unchanged_sha256: expected.unchangedSha256,
    first_process_diagnostic: priorObservation.diagnostic,
    first_process_exit_code: priorObservation.exit_code,
    first_process_exit_observed: priorObservation.process_exit_observed,
    first_process_timed_out: priorObservation.timed_out,
    first_process_unhandled_error: priorObservation.unhandled_error,
    first_process_extension_load_error: priorObservation.extension_load_error,
    exit_code: Number.isInteger(run.actualExitCode) ? run.actualExitCode : -1,
    process_exit_observed: run.processExitObserved,
    timed_out: run.timedOut,
    unhandled_error: UNHANDLED_ERROR_PATTERN.test(fullOutput),
    extension_load_error: EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput),
    shell: expected.shell,
    expected_shell: expected.shell,
  };
  const assertions = behaviorAssertions(name, observation);
  const passed = assertions.every((item) => item.passed)
    && run.processExitObserved
    && !run.timedOut
    && !run.outputLimitExceeded
    && !run.spawnError;
  const evidence = {
    stdout: sanitizeEvidence(run.stdout),
    stderr: sanitizeEvidence(run.stderr),
    actual_exit_code: run.actualExitCode,
    actual_signal: run.actualSignal,
    process_exit_observed: run.processExitObserved,
    timed_out: run.timedOut,
    output_limit_exceeded: run.outputLimitExceeded,
    spawn_error: run.spawnError ?? null,
    cleanup_action: run.cleanupAction,
    compatibility_diagnostics: diagnostics,
    target_sha256: target.sha256,
    target_bytes: target.content === null ? null : Buffer.byteLength(target.content, "utf8"),
    prior_processes: additionalRuns.map((prior) => ({
      stdout: sanitizeEvidence(prior.stdout),
      stderr: sanitizeEvidence(prior.stderr),
      actual_exit_code: prior.actualExitCode,
      process_exit_observed: prior.processExitObserved,
      timed_out: prior.timedOut,
      spawn_error: prior.spawnError ?? null,
      compatibility_diagnostics: parseCompatDiagnostics(`${prior.stdout}${prior.stderr}`),
    })),
  };
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: observation.exit_code,
    passed,
    evidence,
    assertions,
    hasUnhandledError: observation.unhandled_error,
    hasLoadError: observation.extension_load_error,
  };
}

const smokeRoot = mkdtempSync(join(tmpdir(), "pi cursor compat smoke "));
const agentDir = mkdtempSync(join(smokeRoot, "isolated Pi config "));

try {
  const cases = [];

  const loadFixture = createFixture("extension load", patchedSource);
  const loadRun = await runPi(loadFixture.extensionPath, loadFixture.directory, agentDir);
  cases.push(makeCase("extension_load", loadRun, loadFixture.targetPath, { unchangedSha256: patchedSha256 }));

  const happyFixture = createFixture("happy path", originalSource);
  const happyRun = await runPi(happyFixture.extensionPath, happyFixture.directory, agentDir);
  cases.push(makeCase("happy_path", happyRun, happyFixture.targetPath, {}));

  const errorFixture = createFixture("error path", unknownSource);
  const errorRun = await runPi(errorFixture.extensionPath, errorFixture.directory, agentDir);
  cases.push(makeCase("error_path", errorRun, errorFixture.targetPath, { unchangedSha256: hash(unknownSource) }));

  const reloadFixture = createFixture("reload cleanup", originalSource);
  const firstReloadRun = await runPi(reloadFixture.extensionPath, reloadFixture.directory, agentDir);
  const secondReloadRun = await runPi(reloadFixture.extensionPath, reloadFixture.directory, agentDir);
  cases.push(makeCase("reload_cleanup", secondReloadRun, reloadFixture.targetPath, {}, [firstReloadRun]));

  const shellFixture = createFixture("native host shell", originalSource);
  const shellRun = await runPi(shellFixture.extensionPath, shellFixture.directory, agentDir, true);
  cases.push(makeCase("host_shell", shellRun, shellFixture.targetPath, {
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
  }));

  const unexpectedLoadErrors = cases.filter((item) => item.hasLoadError).length;
  const unhandledErrors = cases.filter((item) => item.hasUnhandledError).length;
  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; actual pinned Pi host and extension lifecycle with a local deterministic Cursor dependency/file fixture",
    fixture_boundary: "Only the Cursor dependency graph and target file are synthetic; Pi's SDK process, extension loader, extension code, Node file resolution, patch write/read-back, failure handling, and native shell are real.",
    unhandled_errors: unhandledErrors,
    extension_load_errors: unexpectedLoadErrors,
    cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
  };
  writePiSdkSmokeReport(report, {
    root,
    smokeRoot,
    args: process.argv.slice(2),
    env: process.env,
  });

  const summary = cases.map((item) => ({
    name: item.name,
    passed: item.passed,
    exit_code: item.exit_code,
    failed_assertions: item.assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.id),
  }));
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform, cases: summary }));
  if (cases.some((item) => !item.passed) || unexpectedLoadErrors !== 0 || unhandledErrors !== 0) process.exitCode = 1;
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
