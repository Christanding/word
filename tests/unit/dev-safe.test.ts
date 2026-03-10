import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDevRunCommand,
  getManagedDevPaths,
  parseManagedState,
  shouldDeleteStaleLock,
} from "../../scripts/dev-safe.mjs";

describe("dev-safe script helpers", () => {
  it("stores lock metadata under .next/dev", () => {
    const projectRoot = path.join("C:", "repo", "word");
    const paths = getManagedDevPaths(projectRoot);

    expect(paths.lockPath).toBe(path.join(projectRoot, ".next", "dev", "lock"));
    expect(paths.statePath).toBe(path.join(projectRoot, ".opencode", "dev-safe.json"));
  });

  it("parses managed state safely", () => {
    expect(parseManagedState('{"pid":1234}')).toEqual({ pid: 1234 });
    expect(parseManagedState('{"pid":"bad"}')).toBeNull();
    expect(parseManagedState('not-json')).toBeNull();
  });

  it("deletes stale lock only when tracked process is gone", () => {
    expect(shouldDeleteStaleLock({ lockExists: true, trackedProcessAlive: false })).toBe(true);
    expect(shouldDeleteStaleLock({ lockExists: true, trackedProcessAlive: true })).toBe(false);
    expect(shouldDeleteStaleLock({ lockExists: false, trackedProcessAlive: false })).toBe(false);
  });

  it("builds the wrapped dev command with passthrough args", () => {
    const projectRoot = path.join("C:", "repo", "word");

    expect(buildDevRunCommand(projectRoot, ["--port", "3005"])) .toEqual({
      command: process.execPath,
      args: [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "--port", "3005"],
    });

    expect(buildDevRunCommand(projectRoot, [])).toEqual({
      command: process.execPath,
      args: [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack"],
    });
  });
});
