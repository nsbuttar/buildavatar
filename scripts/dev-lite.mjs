import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const cmd = isWindows ? process.env.ComSpec ?? "cmd.exe" : "pnpm";
const args = isWindows
  ? ["/d", "/s", "/c", "pnpm --filter @avatar/web dev"]
  : ["--filter", "@avatar/web", "dev"];
const env = {
  ...process.env,
  APP_RUNTIME_MODE: process.env.APP_RUNTIME_MODE || "lite",
};

const child = spawn(cmd, args, {
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error("Failed to start dev server in lite mode:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
