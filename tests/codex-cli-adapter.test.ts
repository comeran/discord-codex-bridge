import { describe, expect, it } from "vitest";

import { buildCodexExecArgs } from "../src/adapters/codex-cli-adapter.js";

describe("buildCodexExecArgs", () => {
  it("does not include top-level approval flags unsupported by codex exec", () => {
    const args = buildCodexExecArgs({
      projectPath: "/tmp/project",
      outputFile: "/tmp/out.txt",
      prompt: "Implement the task.",
      sandboxMode: "workspace-write"
    });

    expect(args).not.toContain("-a");
    expect(args).toEqual([
      "exec",
      "-C",
      "/tmp/project",
      "--skip-git-repo-check",
      "-s",
      "workspace-write",
      "--color",
      "never",
      "-o",
      "/tmp/out.txt",
      "Implement the task."
    ]);
  });
});
