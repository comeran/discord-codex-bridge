import { describe, expect, it } from "vitest";

import { formatHelpMessage } from "../src/core/message-formatter.js";

describe("formatHelpMessage", () => {
  it("includes the slash command surface and safety boundary", () => {
    const help = formatHelpMessage("!bind", "!binding", "!unbind");

    expect(help).toContain("/project bind path:<absolute-path>");
    expect(help).toContain("/session show");
    expect(help).toContain("/run prompt:<text>");
    expect(help).toContain("/status");
    expect(help).toContain("/skill list");
    expect(help).toContain("/mcp list");
    expect(help).toContain("不支持登录、token");
  });
});
