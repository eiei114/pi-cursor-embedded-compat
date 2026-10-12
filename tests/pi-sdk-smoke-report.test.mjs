import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writePiSdkSmokeReport } from "../scripts/pi-sdk-smoke-report.mjs";

test("smoke reports preserve committed evidence unless explicitly requested", () => {
  const root = mkdtempSync(join(tmpdir(), "pi smoke report test "));
  const smokeRoot = mkdtempSync(join(tmpdir(), "pi smoke output test "));
  const trackedPath = join(root, "docs", "verification", "pi-sdk-smoke.json");
  const trackedEvidence = "committed platform evidence\n";
  const report = { platform: "test" };

  try {
    mkdirSync(join(root, "docs", "verification"), { recursive: true });
    writeFileSync(trackedPath, trackedEvidence, "utf8");

    const defaultPath = writePiSdkSmokeReport(report, { root, smokeRoot, args: [], env: {} });
    assert.equal(defaultPath, join(smokeRoot, "pi-sdk-smoke.json"));
    assert.deepEqual(JSON.parse(readFileSync(defaultPath, "utf8")), report);
    assert.equal(readFileSync(trackedPath, "utf8"), trackedEvidence);

    const explicitPath = writePiSdkSmokeReport(report, { root, smokeRoot, args: ["--write-report"], env: {} });
    assert.equal(explicitPath, resolve(trackedPath));
    assert.deepEqual(JSON.parse(readFileSync(trackedPath, "utf8")), report);

    const configuredPath = join(root, "custom-report.json");
    const envPath = writePiSdkSmokeReport(report, {
      root,
      smokeRoot,
      args: [],
      env: { PI_SMOKE_REPORT: configuredPath },
    });
    assert.equal(envPath, resolve(configuredPath));
    assert.deepEqual(JSON.parse(readFileSync(configuredPath, "utf8")), report);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(smokeRoot, { recursive: true, force: true });
  }
});
