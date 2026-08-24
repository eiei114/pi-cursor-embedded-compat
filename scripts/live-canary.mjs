import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const marker = "PI_CURSOR_EMBEDDED_COMPAT_OK";
const compatExtension = fileURLToPath(new URL("../extensions/index.ts", import.meta.url));
const sdkExtension = process.env.PI_CURSOR_SDK_EXTENSION ?? resolveSdkExtension();

function resolveSdkExtension() {
  try {
    const packageJsonPath = require.resolve("pi-cursor-sdk/package.json");
    const packageJson = require(packageJsonPath);
    const extension = packageJson.pi?.extensions?.[0];
    if (typeof extension !== "string") throw new Error("pi-cursor-sdk manifest has no extension");
    return path.resolve(path.dirname(packageJsonPath), extension);
  } catch {
    console.error(JSON.stringify({ status: "error", code: "sdk_extension_not_found" }));
    process.exit(1);
  }
}

const {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} = await import("@earendil-works/pi-coding-agent");

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-cursor-embedded-canary-"));
const runtimeAgentDir = process.env.PI_AGENT_DIR ?? getAgentDir();
try {
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir,
    additionalExtensionPaths: [compatExtension, sdkExtension],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const modelRuntime = await ModelRuntime.create({
    allowModelNetwork: false,
    authPath: process.env.PI_AUTH_PATH ?? path.join(runtimeAgentDir, "auth.json"),
    modelsPath: process.env.PI_MODELS_PATH ?? path.join(runtimeAgentDir, "models.json"),
  });
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    agentDir,
    modelRuntime,
    resourceLoader,
    tools: [],
    sessionManager: SessionManager.inMemory(process.cwd()),
  });

  try {
    const model = modelRuntime.getModel("cursor", "composer-2.5");
    if (!model) {
      console.error(JSON.stringify({ status: "error", code: "cursor_model_not_registered" }));
      process.exitCode = 1;
    } else {
      await session.setModel(model);
      let output = "";
      let assistantMessage;
      session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          output += event.assistantMessageEvent.delta;
        }
        if (event.type === "message_end" && event.message.role === "assistant") {
          assistantMessage = event.message;
        }
      });
      await session.prompt(`Reply exactly ${marker} and nothing else.`);
      if (assistantMessage?.stopReason === "error") {
        const errorMessage = assistantMessage.errorMessage ?? "";
        const code = errorMessage.includes("protoBase64")
          ? "proto_base64_request_error"
          : errorMessage.includes("401") || errorMessage.includes("auth")
            ? "cursor_auth_error"
            : "request_failed";
        console.error(JSON.stringify({ status: "error", code }));
        process.exitCode = 1;
      } else if (!output.includes(marker)) {
        console.error(JSON.stringify({ status: "error", code: "marker_missing" }));
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify({ status: "ok", model: "cursor/composer-2.5", marker }));
      }
    }
  } finally {
    session.dispose();
  }
} catch {
  console.error(JSON.stringify({ status: "error", code: "request_failed" }));
  process.exitCode = 1;
} finally {
  await rm(agentDir, { recursive: true, force: true });
}
