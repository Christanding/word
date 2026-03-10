import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const STATE_FILE = "opencode-dev.json";

export function getManagedDevPaths(projectRoot) {
  const devDir = path.join(projectRoot, ".next", "dev");
  return {
    devDir,
    lockPath: path.join(devDir, "lock"),
    statePath: path.join(projectRoot, ".opencode", "dev-safe.json"),
  };
}

export function parseManagedState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0) {
      return { pid: parsed.pid };
    }
  } catch {
    return null;
  }
  return null;
}

export function shouldDeleteStaleLock({ lockExists, trackedProcessAlive }) {
  return lockExists && !trackedProcessAlive;
}

export function buildDevRunCommand(projectRoot, extraArgs) {
  const nextCliPath = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  return {
    command: process.execPath,
    args: [nextCliPath, "dev", "--webpack", ...extraArgs],
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeManagedState(statePath, pid) {
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, JSON.stringify({ pid }), "utf8");
}

function removeManagedState(statePath) {
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
}

async function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killProcessTree(pid) {
  if (!(await isProcessAlive(pid))) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", (code) => (code === 0 || code === 128 ? resolve() : reject(new Error(`taskkill failed: ${code ?? 'unknown'}`))));
      killer.on("error", reject);
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function cleanupBeforeStart(projectRoot) {
  const { lockPath, statePath } = getManagedDevPaths(projectRoot);
  const state = fs.existsSync(statePath) ? parseManagedState(fs.readFileSync(statePath, "utf8")) : null;
  const trackedProcessAlive = state ? await isProcessAlive(state.pid) : false;

  if (state?.pid && trackedProcessAlive) {
    await killProcessTree(state.pid);
  }

  removeManagedState(statePath);

  if (shouldDeleteStaleLock({ lockExists: fs.existsSync(lockPath), trackedProcessAlive })) {
    fs.rmSync(lockPath, { force: true });
  }
}

async function main() {
  const projectRoot = process.cwd();
  const extraArgs = process.argv.slice(2);
  const { statePath } = getManagedDevPaths(projectRoot);

  await cleanupBeforeStart(projectRoot);

  const { command, args } = buildDevRunCommand(projectRoot, extraArgs);
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  writeManagedState(statePath, child.pid);

  const cleanup = () => removeManagedState(statePath);
  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  child.on("error", (error) => {
    cleanup();
    throw error;
  });

  const handleSignal = async (signal) => {
    cleanup();
    try {
      await killProcessTree(child.pid);
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (scriptPath && scriptPath === modulePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
