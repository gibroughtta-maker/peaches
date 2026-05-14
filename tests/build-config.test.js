const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "js", "config.js");

test("build-config writes Supabase runtime config from environment", () => {
  const previousConfig = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf8")
    : null;
  fs.rmSync(configPath, { force: true });

  const result = spawnSync(process.execPath, ["scripts/build-config.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test_anon_key",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(configPath, "utf8"),
    'window.PEACHES_CONFIG = {\n  SUPABASE_URL: "https://example.supabase.co",\n  SUPABASE_ANON_KEY: "test_anon_key"\n};\n',
  );

  if (previousConfig === null) {
    fs.rmSync(configPath, { force: true });
  } else {
    fs.writeFileSync(configPath, previousConfig);
  }
});
