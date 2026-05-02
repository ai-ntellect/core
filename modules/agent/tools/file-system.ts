import { GraphFlow } from "../../../graph/index";
import { z } from "zod";
import { spawn, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export function createFileReaderTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "file_reader",
    schema: z.object({
      path: z.string().describe("File path to read"),
      content: z.any().optional().describe("File content (populated by tool)"),
      encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8").describe("File encoding"),
    }),
    context: { path: "", encoding: "utf-8" },
    nodes: [{
      name: "read",
      execute: async (ctx: any) => {
        const fs = await import("fs/promises");
        try {
          ctx.content = await fs.readFile(ctx.path, ctx.encoding as BufferEncoding);
          console.log(`  [TOOL:file_reader] Read ${ctx.path}`);
        } catch (e: any) {
          console.log(`  [TOOL:file_reader] Error: ${e.message}`);
          ctx.content = `Error: ${e.message}`;
        }
      },
      next: [],
    }],
  });
}

export function createFileWriterTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "file_writer",
    schema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Content to write"),
      append: z.boolean().optional().default(false).describe("Append instead of overwrite"),
      success: z.any().optional().describe("Write result (populated by tool)"),
    }),
    context: { path: "", content: "", append: false },
    nodes: [{
      name: "write",
      execute: async (ctx: any) => {
        const fs = await import("fs/promises");
        try {
          const flag = ctx.append ? "a" : "w";
          await fs.writeFile(ctx.path, ctx.content, { flag });
          ctx.success = true;
          console.log(`  [TOOL:file_writer] ${ctx.append ? "Appended to" : "Wrote"} ${ctx.path}`);
        } catch (e: any) {
          console.log(`  [TOOL:file_writer] Error: ${e.message}`);
          ctx.success = false;
        }
      },
      next: [],
    }],
  });
}

export function createFileDeleterTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "file_deleter",
    schema: z.object({
      path: z.string().describe("File path to delete"),
      recursive: z.boolean().optional().default(false).describe("Delete directories recursively"),
      success: z.any().optional().describe("Delete result (populated by tool)"),
    }),
    context: { path: "", recursive: false },
    nodes: [{
      name: "delete",
      execute: async (ctx: any) => {
        const fs = await import("fs/promises");
        try {
          const stat = await fs.stat(ctx.path);
          if (stat.isDirectory()) {
            await fs.rm(ctx.path, { recursive: ctx.recursive });
          } else {
            await fs.unlink(ctx.path);
          }
          ctx.success = true;
          console.log(`  [TOOL:file_deleter] Deleted ${ctx.path}`);
        } catch (e: any) {
          console.log(`  [TOOL:file_deleter] Error: ${e.message}`);
          ctx.success = false;
        }
      },
      next: [],
    }],
  });
}

export function createDirectoryCreatorTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "directory_creator",
    schema: z.object({
      path: z.string().describe("Directory path to create"),
      recursive: z.boolean().optional().default(true).describe("Create parent directories"),
      success: z.any().optional().describe("Create result (populated by tool)"),
    }),
    context: { path: "", recursive: true },
    nodes: [{
      name: "mkdir",
      execute: async (ctx: any) => {
        const fs = await import("fs/promises");
        try {
          await fs.mkdir(ctx.path, { recursive: ctx.recursive });
          ctx.success = true;
          console.log(`  [TOOL:directory_creator] Created ${ctx.path}`);
        } catch (e: any) {
          console.log(`  [TOOL:directory_creator] Error: ${e.message}`);
          ctx.success = false;
        }
      },
      next: [],
    }],
  });
}

export function createDirectoryListerTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "directory_lister",
    schema: z.object({
      path: z.string().describe("Directory path to list"),
      entries: z.any().optional().describe("Directory entries (populated by tool)"),
    }),
    context: { path: "" },
    nodes: [{
      name: "list",
      execute: async (ctx: any) => {
        const fs = await import("fs/promises");
        try {
          const entries = await fs.readdir(ctx.path, { withFileTypes: true });
          ctx.entries = entries.map((e: any) => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          }));
          console.log(`  [TOOL:directory_lister] Listed ${ctx.path}: ${ctx.entries.length} entries`);
        } catch (e: any) {
          console.log(`  [TOOL:directory_lister] Error: ${e.message}`);
          ctx.entries = [];
        }
      },
      next: [],
    }],
  });
}

const BLOCKED_COMMANDS = [
  "rm -rf /", "mkfs", "dd if=", "chmod -R 777 /",
  ":(){ :|:& };:", "kill -9 -1", "shutdown", "reboot", "init ",
];

function isCommandBlocked(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return BLOCKED_COMMANDS.some(b => normalized.includes(b));
}

async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync("docker info", { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function executeInDocker(command: string, cwd: string, timeout: number): Promise<{
  stdout: string; stderr: string; exitCode: number; method: string
}> {
  const safeCwd = cwd.replace(/[^a-zA-Z0-9/_.\-]/g, "");
  const dockerCmd = `docker run --rm --network none --memory=256m --cpus=0.5 --security-opt no-new-privileges --timeout ${timeout / 1000}s -v ${safeCwd}:/workspace:ro -w /workspace alpine:3.19 sh -c ${JSON.stringify(command)}`;
  try {
    const { stdout, stderr } = await execAsync(dockerCmd, { timeout, maxBuffer: 1024 * 1024 });
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0, method: "docker" };
  } catch (e: any) {
    return {
      stdout: e.stdout || "",
      stderr: e.stderr || e.message || "Docker execution failed",
      exitCode: e.code ?? 1,
      method: "docker"
    };
  }
}

async function executeInProcess(command: string, cwd: string, timeout: number): Promise<{
  stdout: string; stderr: string; exitCode: number; method: string
}> {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd.exe" : "/bin/sh";
  const args = isWindows ? ["/c", command] : ["-c", command];
  const safeEnv = { PATH: process.env.PATH || "", HOME: process.env.HOME || "", LANG: "en_US.UTF-8" };

  return new Promise((resolve) => {
    const child = spawn(shell, args, { cwd, env: safeEnv });
    let stdout = "";
    let stderr = "";
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (code: number) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, method: "process" });
    };

    timer = setTimeout(() => {
      if (!done) {
        child.kill("SIGKILL");
        finish(124);
      }
    }, timeout);

    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number | null) => finish(code ?? 1));
    child.on("error", () => finish(1));
    child.on("exit", (code: number | null, sig: NodeJS.Signals | null) => {
      if (code !== null) finish(code);
    });
  });
}

export function createShellTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "shell",
    schema: z.object({
      command: z.string().describe("Shell command to execute"),
      cwd: z.string().optional().describe("Working directory (host path, only used as context)"),
      timeout: z.number().optional().describe("Timeout in ms (max 60000)"),
      stdout: z.string().optional().describe("Command output"),
      stderr: z.string().optional().describe("Error output"),
      exitCode: z.number().optional().describe("Exit code"),
      isolationMethod: z.string().optional().describe("Isolation method used: docker or process"),
    }),
    context: { command: "", cwd: process.cwd(), timeout: 30000 },
    nodes: [{
      name: "execute",
      execute: async (ctx: any) => {
        if (!ctx.command) { ctx.exitCode = 1; ctx.stderr = "No command provided"; return; }
        if (isCommandBlocked(ctx.command)) {
          ctx.exitCode = 1; ctx.stderr = "Command blocked for security"; ctx.isolationMethod = "blocked";
          console.log(`  [TOOL:shell] Blocked: ${ctx.command}`);
          return;
        }
        const timeout = Math.min(ctx.timeout || 30000, 60000);
        const cwd = ctx.cwd || process.cwd();
        const dockerAvailable = await isDockerAvailable();
        console.log(`  [TOOL:shell] Running: ${ctx.command} (${dockerAvailable ? "docker" : "process"} isolation)`);
        const result = dockerAvailable
          ? await executeInDocker(ctx.command, cwd, timeout)
          : await executeInProcess(ctx.command, cwd, timeout);
        ctx.stdout = result.stdout;
        ctx.stderr = result.stderr;
        ctx.exitCode = result.exitCode;
        ctx.isolationMethod = result.method;
        console.log(`  [TOOL:shell] Exit code: ${ctx.exitCode} [${result.method}]`);
      },
      next: [],
    }],
  });
}

export function createNodeCodeTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "node_code",
    schema: z.object({
      code: z.string().describe("JavaScript/TypeScript code to execute"),
      result: z.string().optional().describe("Execution result"),
      error: z.string().optional().describe("Error message"),
    }),
    context: { code: "", result: "", error: "" },
    nodes: [{
      name: "run",
      execute: async (ctx: any) => {
        console.log(`  [TOOL:node_code] Running code...`);
        try {
          const vm = await import("vm");
          const sandbox = { 
            ctx, 
            result: undefined, 
            error: undefined,
            console: {
              log: (...args: any[]) => { 
                sandbox._log = (sandbox._log || []).concat(
                  args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))
                ); 
              }
            },
            _log: [] as string[]
          };
          const script = new vm.Script(`
            (async () => { 
              ${ctx.code}
            })()
          `);
          await script.runInNewContext(sandbox);
          
          const logOutput = sandbox._log?.join('\n') || '';
          const codeResult = sandbox.ctx?.result !== undefined ? String(sandbox.ctx.result) : '';
          ctx.result = logOutput || codeResult;
          if (!ctx.result) ctx.result = "Code executed (no output)";
          console.log(`  [TOOL:node_code] Result: ${ctx.result}`);
        } catch (e: any) {
          ctx.error = e.message;
          console.log(`  [TOOL:node_code] Error: ${e.message}`);
        }
      },
      next: [],
    }],
  });
}

export function createAllAgentTools(): GraphFlow<any>[] {
  return [
    createFileReaderTool(),
    createFileWriterTool(),
    createFileDeleterTool(),
    createDirectoryCreatorTool(),
    createDirectoryListerTool(),
    createShellTool(),
    createNodeCodeTool(),
  ];
}
