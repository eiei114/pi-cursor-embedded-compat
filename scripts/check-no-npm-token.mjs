import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const workflowDirectory = path.resolve(".github/workflows");
const forbidden = /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/;
const files = (await readdir(workflowDirectory)).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));

for (const file of files) {
  const content = await readFile(path.join(workflowDirectory, file), "utf8");
  if (forbidden.test(content)) {
    console.error(`forbidden npm token reference in ${file}`);
    process.exitCode = 1;
  }
}
