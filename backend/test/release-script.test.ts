import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// enable-release-workflow (JOS-206) — the release decisions run offline, without GitHub; the version comes from the tag.
const SCRIPT = join(import.meta.dirname, "..", "..", ".github", "scripts", "release.sh");

const release = (...args: string[]): string => execFileSync("bash", [SCRIPT, ...args], { encoding: "utf8" }).trim();

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vid4you-release-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("release.sh parse", () => {
  it("reads a release tag as a production version", () => {
    expect(release("parse", "v1.0.0")).toBe("version=1.0.0\nchannel=production\nprerelease=false");
  });

  it("reads a release candidate tag as a uat pre-release", () => {
    expect(release("parse", "v1.0.0-rc.1")).toBe("version=1.0.0-rc.1\nchannel=uat\nprerelease=true");
  });

  it.each(["v1.0", "1.0.0", "v1.0.0-beta", "v1.0.0-rc", "v1.0.0-rc.1.2", "release-abc"])("rejects %s and names it", (tag) => {
    const result = spawnSync("bash", [SCRIPT, "parse", tag], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(tag);
  });
});

describe("release.sh on-branch", () => {
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.test", ...args], { cwd: dir, encoding: "utf8" }).trim();
  const onBranch = (tag: string) => spawnSync("bash", [SCRIPT, "on-branch", tag, "main"], { cwd: dir, encoding: "utf8" });

  beforeEach(() => {
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "on main");
    git("tag", "v1.0.0");
    git("checkout", "-q", "-b", "side");
    git("commit", "-q", "--allow-empty", "-m", "off main");
    git("tag", "v2.0.0");
  });

  it("accepts a tag on a commit of the release branch", () => {
    expect(onBranch("v1.0.0").status).toBe(0);
  });

  it("rejects a tag outside the release branch and names the tag and the branch", () => {
    const result = onBranch("v2.0.0");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("v2.0.0");
    expect(result.stderr).toContain("main");
  });
});

describe("release.sh checksums and verify", () => {
  const writeZips = (): string[] => {
    const names = ["Vid4You-darwin-arm64.zip", "Vid4You-darwin-x64.zip", "Vid4You-win32-x64.zip"];
    names.forEach((name) => writeFileSync(join(dir, name), `content of ${name}`));
    return names;
  };

  it("lists each zip in SHA256SUMS.txt and verifies untouched files", () => {
    const names = writeZips();
    release("checksums", dir);
    const listing = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8");
    names.forEach((name) => expect(listing).toContain(name));
    expect(spawnSync("bash", [SCRIPT, "verify", dir]).status).toBe(0);
  });

  it("fails and names a tampered zip", () => {
    writeZips();
    release("checksums", dir);
    writeFileSync(join(dir, "Vid4You-win32-x64.zip"), "tampered");
    const result = spawnSync("bash", [SCRIPT, "verify", dir], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Vid4You-win32-x64.zip");
  });
});
