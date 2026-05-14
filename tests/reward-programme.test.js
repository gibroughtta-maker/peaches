const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(repoRoot, "supabase", "migrations", "20260514000003_update_reward_tiers.sql"),
  "utf8",
);

const expectedRewards = [
  [100, "Free Eyebrow Wax or Upper Lip Wax", "10.50"],
  [200, "Free Lash Tint or Brow Wax", "13.00"],
  [350, "Free Underarm Wax or Brow Wax & Tint", "21.00"],
  [500, "Free Half Leg or Full Arms Wax", "26.00"],
  [800, "Free Lash Lift or Brow Lamination", "40.00"],
  [1200, "Free Brazilian or Hollywood Wax", "48.00"],
  [2000, "Free Hollywood + Half Leg Package", "74.00"],
];

test("Supabase reward migration contains the current Peaches loyalty tiers", () => {
  assert.match(migration, /add column if not exists retail_value/);
  assert.match(migration, /add column if not exists valid_months/);

  for (const [points, name, value] of expectedRewards) {
    assert.match(migration, new RegExp(`'${name.replace(/[+]/g, "\\+")}'`));
    assert.match(migration, new RegExp(`\\b${points}\\b`));
    assert.match(migration, new RegExp(`\\b${value}\\b`));
  }
});
