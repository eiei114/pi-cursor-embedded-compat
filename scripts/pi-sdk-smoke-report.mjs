import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function writePiSdkSmokeReport(report, { root, smokeRoot, args, env }) {
  const trackedReportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
  const reportPath = env.PI_SMOKE_REPORT
    ? resolve(env.PI_SMOKE_REPORT)
    : args.includes("--write-report")
      ? trackedReportPath
      : join(smokeRoot, "pi-sdk-smoke.json");

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}
