const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

test("index renders a single email login instead of manual app selection", () => {
  const html = read("index.html");

  assert.match(html, /id="email-login-form"/);
  assert.match(html, /type="email"/);
  assert.match(html, /Continue with email/);
  assert.doesNotMatch(html, /href="\/customer\.html"/);
  assert.doesNotMatch(html, /href="\/staff\.html"/);
  assert.doesNotMatch(html, /Login with mobile number/);
});

test("pages load Supabase runtime scripts and auth router", () => {
  for (const file of ["index.html", "customer.html", "staff.html"]) {
    const html = read(file);

    assert.match(html, /\/js\/config\.js/);
    assert.match(html, /@supabase\/supabase-js@2/);
    assert.match(html, /\/js\/supabase-client\.js/);
    assert.match(html, /\/js\/auth-router\.js/);
  }
});

test("customer and staff pages declare the required role guard", () => {
  assert.match(read("customer.html"), /data-required-role="customer"/);
  assert.match(read("staff.html"), /data-required-role="therapist"/);
});

test("Supabase client supports the v2 CDN global", () => {
  const source = read("js/supabase-client.js");

  assert.match(source, /window\.supabaseJs \|\| window\.supabase/);
  assert.match(source, /createClient/);
});
