import { GraphFlow } from "../../../graph/index";
import { z } from "zod";
import { spawn } from "child_process";

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

export function createShellTool(): GraphFlow<any> {
  return new GraphFlow({
    name: "shell",
    schema: z.object({
      command: z.string().describe("Shell command to execute"),
      cwd: z.string().optional().describe("Working directory"),
      stdout: z.string().optional().describe("Command output"),
      stderr: z.string().optional().describe("Error output"),
      exitCode: z.number().optional().describe("Exit code"),
    }),
    context: { command: "", cwd: process.cwd() },
    nodes: [{
      name: "execute",
      execute: async (ctx: any) => {
        return new Promise((resolve) => {
          const cwd = ctx.cwd || process.cwd();
          const isWindows = process.platform === "win32";
          const shell = isWindows ? "cmd.exe" : "/bin/sh";
          const args = isWindows ? ["/c", ctx.command] : ["-c", ctx.command];
          
          console.log(`  [TOOL:shell] Running: ${ctx.command}`);
          
          const child = spawn(shell, args, { cwd });
          let stdout = "";
          let stderr = "";

          child.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          child.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          child.on("close", (code: number | null) => {
            ctx.stdout = stdout;
            ctx.stderr = stderr;
            ctx.exitCode = code ?? 0;
            console.log(`  [TOOL:shell] Exit code: ${ctx.exitCode}`);
            resolve();
          });

          child.on("error", (e: Error) => {
            ctx.stderr = e.message;
            ctx.exitCode = 1;
            console.log(`  [TOOL:shell] Error: ${e.message}`);
            resolve();
          });
        });
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
