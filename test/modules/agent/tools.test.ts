import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { createAllAgentTools, createShellTool, createFileWriterTool, createFileReaderTool, createDirectoryListerTool } from "../../../modules/agent/tools";
import { AgentLogger } from "../../../modules/agent/tools/logger";
import * as path from "path";
import * as os from "os";

describe("Native Agent Tools", () => {
  const tools = createAllAgentTools();

  const getTool = (name: string) => tools.find((t: any) => t.name === name);

  describe("file_reader", () => {
    it("should be available", () => {
      const tool = getTool("file_reader");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("file_reader");
      const schema = tool!.getSchema().shape;
      expect(schema.path).to.exist;
      expect(schema.content).to.exist;
    });
  });

  describe("file_writer", () => {
    it("should be available", () => {
      const tool = getTool("file_writer");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("file_writer");
      const schema = tool!.getSchema().shape;
      expect(schema.path).to.exist;
      expect(schema.content).to.exist;
      expect(schema.append).to.exist;
    });
  });

  describe("file_deleter", () => {
    it("should be available", () => {
      const tool = getTool("file_deleter");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("file_deleter");
      const schema = tool!.getSchema().shape;
      expect(schema.path).to.exist;
      expect(schema.recursive).to.exist;
    });
  });

  describe("directory_creator", () => {
    it("should be available", () => {
      const tool = getTool("directory_creator");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("directory_creator");
      const schema = tool!.getSchema().shape;
      expect(schema.path).to.exist;
      expect(schema.recursive).to.exist;
    });
  });

  describe("directory_lister", () => {
    it("should be available", () => {
      const tool = getTool("directory_lister");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("directory_lister");
      const schema = tool!.getSchema().shape;
      expect(schema.path).to.exist;
      expect(schema.entries).to.exist;
    });
  });

  describe("shell", () => {
    it("should be available", () => {
      const tool = getTool("shell");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("shell");
      const schema = tool!.getSchema().shape;
      expect(schema.command).to.exist;
      expect(schema.stdout).to.exist;
      expect(schema.stderr).to.exist;
      expect(schema.exitCode).to.exist;
    });
  });

  describe("shell execution", () => {
    const testDir = path.join(os.tmpdir(), "opencode-test");
    const testFile = path.join(testDir, "test.txt");
    const testPyScript = path.join(testDir, "test_script.py");

    before(async () => {
      const fs = await import("fs/promises");
      await fs.mkdir(testDir, { recursive: true });
    });

    after(async () => {
      const fs = await import("fs/promises");
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it("should execute bash command", async () => {
      const shell = createShellTool();
      await shell.execute("execute", { command: "echo hello_bash", cwd: testDir, timeout: 5000 });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(0);
      expect(ctx.stdout.trim()).to.equal("hello_bash");
      expect(["docker", "process"]).to.include(ctx.isolationMethod);
    });

    it("should execute python script", async () => {
      const writer = createFileWriterTool();
      await writer.execute("write", { path: testPyScript, content: 'print("hello_python")' });

      const shell = createShellTool();
      await shell.execute("execute", { command: `python3 ${testPyScript}`, cwd: testDir, timeout: 5000 });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(0);
      expect(ctx.stdout.trim()).to.equal("hello_python");
    });

    it("should read file via shell cat", async () => {
      const writer = createFileWriterTool();
      await writer.execute("write", { path: testFile, content: "shell_read_test" });

      const shell = createShellTool();
      await shell.execute("execute", { command: `cat ${testFile}`, cwd: testDir, timeout: 5000 });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(0);
      expect(ctx.stdout.trim()).to.equal("shell_read_test");
    });

    it("should list directory via shell ls", async () => {
      const shell = createShellTool();
      await shell.execute("execute", { command: "ls -1", cwd: testDir, timeout: 5000 });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(0);
      expect(ctx.stdout).to.include("test.txt");
    });

    it("should block dangerous commands", async () => {
      const shell = createShellTool();
      await shell.execute("execute", { command: "rm -rf /", cwd: testDir });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(1);
      expect(ctx.stderr).to.include("blocked");
      expect(ctx.isolationMethod).to.equal("blocked");
    });

    it("should timeout long-running commands", async () => {
      const shell = createShellTool();
      const start = Date.now();
      await shell.execute("execute", { command: "sleep 10", cwd: testDir, timeout: 1000 });
      const elapsed = Date.now() - start;
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(124);
      expect(elapsed).to.be.lessThan(5000);
    });

    it("should support pipe in bash", async () => {
      const shell = createShellTool();
      await shell.execute("execute", { command: 'echo -e "a\nb\nc" | grep b', cwd: testDir, timeout: 5000 });
      const ctx = shell.getContext();
      expect(ctx.exitCode).to.equal(0);
      expect(ctx.stdout.trim()).to.equal("b");
    });
  });

  describe("node_code", () => {
    it("should be available", () => {
      const tool = getTool("node_code");
      expect(tool).to.exist;
    });

    it("should have correct schema", () => {
      const tool = getTool("node_code");
      const schema = tool!.getSchema().shape;
      expect(schema.code).to.exist;
      expect(schema.result).to.exist;
      expect(schema.error).to.exist;
    });
  });

  describe("createAllAgentTools", () => {
    it("should return 7 tools", () => {
      expect(tools).to.have.lengthOf(7);
    });

    it("should have all expected tool names", () => {
      const names = tools.map((t) => t.name);
      expect(names).to.include("file_reader");
      expect(names).to.include("file_writer");
      expect(names).to.include("file_deleter");
      expect(names).to.include("directory_creator");
      expect(names).to.include("directory_lister");
      expect(names).to.include("shell");
      expect(names).to.include("node_code");
    });
  });
});

describe("AgentLogger", () => {
  it("should create logger instance", () => {
    const logger = new AgentLogger(false);
    expect(logger).to.exist;
  });

  it("should log and retrieve messages", () => {
    const logger = new AgentLogger(false);
    logger.info("test", "Test message");
    const logs = logger.getLogs();
    expect(logs).to.have.lengthOf(1);
    expect(logs[0].message).to.equal("Test message");
    expect(logs[0].source).to.equal("test");
    expect(logs[0].level).to.equal("info");
  });

  it("should filter by level", () => {
    const logger = new AgentLogger(false);
    logger.info("test", "Info message");
    logger.warn("test", "Warn message");
    logger.error("test", "Error message");
    
    expect(logger.getLogsByLevel("info")).to.have.lengthOf(1);
    expect(logger.getLogsByLevel("warn")).to.have.lengthOf(1);
    expect(logger.getLogsByLevel("error")).to.have.lengthOf(1);
    expect(logger.getLogsByLevel("debug")).to.have.lengthOf(0);
  });

  it("should clear logs", () => {
    const logger = new AgentLogger(false);
    logger.info("test", "Message");
    logger.clearLogs();
    expect(logger.getLogs()).to.have.lengthOf(0);
  });

  it("should export history as string", () => {
    const logger = new AgentLogger(false);
    logger.info("test", "Test message");
    const history = logger.exportHistory();
    expect(history).to.include("Test message");
    expect(history).to.include("[INFO]");
  });

  it("should enable and disable", () => {
    const logger = new AgentLogger(false);
    expect(logger.isEnabled()).to.equal(false);
    logger.enable();
    expect(logger.isEnabled()).to.equal(true);
    logger.disable();
    expect(logger.isEnabled()).to.equal(false);
  });
});
