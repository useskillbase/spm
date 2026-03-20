import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

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
    const raw = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
    const { data: frontmatter, content } = matter(raw);

    expect(frontmatter.name).toBe("code-review");
    expect(frontmatter.version).toBe("1.0.0");
    expect(frontmatter.author).toBe("tester");
    expect(frontmatter.license).toBe("MIT");
    expect(frontmatter.schema_version).toBe(3);
    expect(content).toContain("<instructions>");
    expect(content).toContain("# Code Review\n\nReview code carefully.");
    expect(content).toContain("</instructions>");
    expect(content).toContain("<context>");
    expect(content).toContain("<examples>");
    expect(content).toContain("<verification>");

    // No skill.json should exist
    const files = await fs.readdir(skillDir);
    expect(files).not.toContain("skill.json");
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

    // Two skills created — read frontmatter from SKILL.md
    const alphaRaw = await fs.readFile(path.join(outputDir, "alpha", "SKILL.md"), "utf-8");
    const betaRaw = await fs.readFile(path.join(outputDir, "beta", "SKILL.md"), "utf-8");
    const alphaFm = matter(alphaRaw).data;
    const betaFm = matter(betaRaw).data;

    expect(alphaFm.name).toBe("alpha");
    expect(alphaFm.license).toBe("Apache-2.0");
    expect(betaFm.name).toBe("beta");

    // .json file should NOT have been converted
    const betaContent = matter(betaRaw).content;
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

    // Should not have created SKILL.md inside existing dir
    const files = await fs.readdir(path.join(outputDir, "existing"));
    expect(files).not.toContain("SKILL.md");
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

    const raw = await fs.readFile(path.join(outputDir, "helper", "SKILL.md"), "utf-8");
    const { data: frontmatter } = matter(raw);
    expect(frontmatter.name).toBe("helper");
  });
});
