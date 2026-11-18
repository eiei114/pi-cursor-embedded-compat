import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("documented embedded profiles pin the package version and load the shim first", () => {
  for (const path of ["README.md", "docs/usage.md"]) {
    const document = readFileSync(new URL(path, root), "utf8");
    const pins = [...document.matchAll(/npm:pi-cursor-embedded-compat@([^\s",\]]+)/g)]
      .map((match) => match[1]);

    assert.deepEqual(pins, [version], `${path} must pin package.json version ${version}`);

    const profileBlock = document.match(/```json\s*([\s\S]*?)```/);
    assert.ok(profileBlock, `${path} must include its explicit JSON profile`);
    const profile = JSON.parse(profileBlock[1]);
    const shimIndex = profile.indexOf(`npm:pi-cursor-embedded-compat@${version}`);
    const sdkIndex = profile.indexOf("npm:pi-cursor-sdk");

    assert.equal(profile[0], "--no-extensions", `${path} must keep --no-extensions`);
    assert.ok(shimIndex > 0, `${path} must include the shim install argument`);
    assert.equal(profile[shimIndex - 1], "-e", `${path} must use -e for the shim`);
    assert.ok(sdkIndex > shimIndex, `${path} must load the shim before pi-cursor-sdk`);
    assert.equal(profile[sdkIndex - 1], "-e", `${path} must use -e for pi-cursor-sdk`);
  }
});
