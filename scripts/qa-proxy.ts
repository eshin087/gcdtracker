import { createNeonBridge } from "../tests/support/neon-local";

async function main() {
  const port = process.env.QA_NEON_HTTP_PORT ? Number(process.env.QA_NEON_HTTP_PORT) : 55433;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("QA_NEON_HTTP_PORT must be an unprivileged TCP port.");
  const bridge = await createNeonBridge({ port });
  console.log("Isolated QA Neon HTTP endpoint: " + bridge.endpoint);
  console.log("Set GCD_QA_MODE=1 and QA_NEON_HTTP_ENDPOINT to this endpoint for the local Next process.");
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await bridge.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "QA bridge failed");
  process.exitCode = 1;
});
