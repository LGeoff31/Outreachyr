import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const dryRun = process.argv.includes("--dry-run");
const onlyIndex = process.argv.indexOf("--only");
const onlyCommand = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
const backendProjectEnvironment = isWindows ? ".venv" : `.venv-${process.platform}`;
const backendCacheDir = `.uv-cache-${process.platform}`;

const commands = [
  {
    name: "backend",
    command: isWindows ? "uv.exe" : "uv",
    args: ["run", "python", "app.py"],
    cwd: fileURLToPath(new URL("../backend/", import.meta.url)),
    env: {
      UV_PROJECT_ENVIRONMENT: backendProjectEnvironment,
      UV_CACHE_DIR: backendCacheDir,
    },
    display:
      backendProjectEnvironment === ".venv"
        ? "uv run python app.py"
        : `UV_PROJECT_ENVIRONMENT=${backendProjectEnvironment} uv run python app.py`,
  },
  {
    name: "frontend",
    command: isWindows ? "cmd.exe" : "npm",
    args: isWindows ? ["/d", "/s", "/c", "npm.cmd run dev"] : ["run", "dev"],
    cwd: fileURLToPath(new URL("../frontend/", import.meta.url)),
    display: "npm run dev",
  },
];

if (onlyIndex !== -1 && !onlyCommand) {
  console.error("[dev] missing command name after --only");
  process.exit(1);
}

const selectedCommands = onlyCommand
  ? commands.filter((item) => item.name === onlyCommand)
  : commands;

if (selectedCommands.length === 0) {
  console.error(`[dev] unknown command '${onlyCommand}'`);
  process.exit(1);
}

if (dryRun) {
  for (const item of selectedCommands) {
    console.log(
      `[dev] ${item.name}: ${item.display ?? `${item.command} ${item.args.join(" ")}`} (${item.cwd})`,
    );
  }
  process.exit(0);
}

const children = [];
let shuttingDown = false;

function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      cwd: rootDir,
      stdio: "ignore",
    });
    return;
  }

  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      child.kill("SIGTERM");
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    stopChild(child);
  }

  setTimeout(() => process.exit(exitCode), 500);
}

for (const item of selectedCommands) {
  console.log(`[dev] starting ${item.name}: ${item.display ?? `${item.command} ${item.args.join(" ")}`}`);
  const child = spawn(item.command, item.args, {
    cwd: item.cwd,
    env: { ...process.env, FORCE_COLOR: "1", ...item.env },
    detached: !isWindows,
    stdio: "inherit",
  });

  children.push(child);

  child.on("error", (error) => {
    console.error(`[dev] failed to start ${item.name}: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev] ${item.name} exited with ${reason}; stopping the other process.`);
    shutdown(code === 0 || code === null ? 1 : code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
