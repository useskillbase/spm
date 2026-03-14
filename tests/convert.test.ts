import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Import internals for testing
// We test the convert logic by calling the exported function with flags (non-interactive)
import { convertCommand } from "../src/cli/commands/convert.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skillbase-convert-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("skills convert", () => {
  it("converts a single .md file into a skill scaffold", async () => {
    const promptFile = path.join(tmpDir, "code-review.md");
    await fs.writeFile(promptFile, "# Code Review\n\nReview code carefully.\n");

    const outputDir = path.join(tmpDir, "output");
    await fs.mkdir(outputDir);

    await convertCommand(promptFile, {
      author: "tester",
      scope: "test",
      license: "MIT",
      output: outputDir,
    });

    const skillDir = path.join(outputDir, "code-review");
    const manifest = JSON.parse(
      await fs.readFile(path.join(skillDir, "skill.json"), "utf-8"),
    );
    const content = await fs.readFile(
      path.join(skillDir, "SKILL.md"),
      "utf-8",
    );

    expect(manifest.name).toBe("code-review");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.author).toBe("tester");
    expect(manifest.license).toBe("MIT");
    expect(manifest.entry).toBe("SKILL.md");
    expect(content).toContain("<instructions>");
    expect(content).toContain("# Code Review\n\nReview code carefully.");
    expect(content).toContain("</instructions>");
    expect(content).toContain("<role>");
    expect(content).toContain("<examples>");
    expect(content).toContain("<verification>");
  });

  it("converts a directory of prompt files", async () => {
    const promptsDir = path.join(tmpDir, "prompts");
    await fs.mkdir(promptsDir);
    await fs.writeFile(path.join(promptsDir, "alpha.md"), "Alpha prompt");
    await fs.writeFile(path.join(promptsDir, "beta.txt"), "Beta prompt");
    await fs.writeFile(path.join(promptsDir, "ignore.json"), "{}"); // should be skipped

    const outputDir = path.join(tmpDir, "output");
    await fs.mkdir(outputDir);

    await convertCommand(promptsDir, {
      author: "tester",
      scope: "dev",
      license: "Apache-2.0",
      output: outputDir,
    });

    // Two skills created
    const alphaManifest = JSON.parse(
      await fs.readFile(
        path.join(outputDir, "alpha", "skill.json"),
        "utf-8",
      ),
    );
    const betaManifest = JSON.parse(
      await fs.readFile(
        path.join(outputDir, "beta", "skill.json"),
        "utf-8",
      ),
    );

    expect(alphaManifest.name).toBe("alpha");
    expect(alphaManifest.license).toBe("Apache-2.0");
    expect(betaManifest.name).toBe("beta");

    // .json file should NOT have been converted
    const betaContent = await fs.readFile(
      path.join(outputDir, "beta", "SKILL.md"),
      "utf-8",
    );
    expect(betaContent).toContain("<instructions>");
    expect(betaContent).toContain("Beta prompt");
    expect(betaContent).toContain("</instructions>");
  });

  it("skips existing skill directories", async () => {
    const promptFile = path.join(tmpDir, "existing.md");
    await fs.writeFile(promptFile, "prompt content");

    const outputDir = path.join(tmpDir, "output");
    await fs.mkdir(path.join(outputDir, "existing"), { recursive: true });

    await convertCommand(promptFile, {
      author: "tester",
      scope: "user",
      license: "MIT",
      output: outputDir,
    });

    // Should not have created skill.json inside existing dir
    const files = await fs.readdir(path.join(outputDir, "existing"));
    expect(files).not.toContain("skill.json");
  });

  it("slugifies file names correctly", async () => {
    const promptFile = path.join(tmpDir, "My Cool Prompt!.md");
    await fs.writeFile(promptFile, "content");

    const outputDir = path.join(tmpDir, "output");
    await fs.mkdir(outputDir);

    await convertCommand(promptFile, {
      author: "tester",
      scope: "user",
      license: "MIT",
      output: outputDir,
    });

    const entries = await fs.readdir(outputDir);
    expect(entries).toContain("my-cool-prompt");
  });

  it("handles .prompt extension", async () => {
    const promptsDir = path.join(tmpDir, "prompts");
    await fs.mkdir(promptsDir);
    await fs.writeFile(path.join(promptsDir, "helper.prompt"), "prompt content");

    const outputDir = path.join(tmpDir, "output");
    await fs.mkdir(outputDir);

    await convertCommand(promptsDir, {
      author: "tester",
      scope: "user",
      license: "MIT",
      output: outputDir,
    });

    const manifest = JSON.parse(
      await fs.readFile(
        path.join(outputDir, "helper", "skill.json"),
        "utf-8",
      ),
    );
    expect(manifest.name).toBe("helper");
  });
});
