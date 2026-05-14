const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

test("index renders one secure email login with customer and staff intent copy", () => {
  const html = read("index.html");

  assert.match(html, /id="email-login-form"/);
  assert.match(html, /data-login-intent/);
  assert.match(html, /Customer/);
  assert.match(html, /Staff/);
  assert.match(html, /Staff access is approved by Peaches/);
  assert.match(html, /type="email"/);
  assert.match(html, /Continue with email/);
  assert.match(html, /class="phone-frame"/);
  assert.doesNotMatch(html, /class="status-bar"/);
  assert.doesNotMatch(html, /href="\/customer\.html"/);
  assert.doesNotMatch(html, /href="\/staff\.html"/);
  assert.doesNotMatch(html, /Login with mobile number/);
  assert.doesNotMatch(html, /class="login-card"/);
});

test("app pages render the inner app surface without a decorative device shell", () => {
  for (const file of ["index.html", "customer.html", "staff.html"]) {
    const html = read(file);
    const phoneFrameCss = html.match(/\.phone-frame\s*\{[\s\S]*?\}/)?.[0] || "";

    assert.doesNotMatch(html, /class="status-bar"/);
    assert.doesNotMatch(html, />9:4[01]</);
    assert.doesNotMatch(phoneFrameCss, /0 0 0 10px #1a0a08/);
    assert.doesNotMatch(phoneFrameCss, /border-radius:\s*44px/);
    assert.doesNotMatch(phoneFrameCss, /margin:\s*0 auto 40px/);
  }
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

test("customer and staff pages do not expose prototype navigation chrome", () => {
  for (const file of ["customer.html", "staff.html"]) {
    const html = read(file);

    assert.doesNotMatch(html, /class="proto-nav"/);
    assert.doesNotMatch(html, /class="screen-label"/);
    assert.doesNotMatch(html, /Prototype only/);
  }
});

test("Supabase client supports the v2 CDN global", () => {
  const source = read("js/supabase-client.js");

  assert.match(source, /window\.supabaseJs \|\| window\.supabase/);
  assert.match(source, /createClient/);
});

test("customer app renders QR per customer and keeps history back arrow-only", () => {
  const source = read("js/customer-app.js");

  assert.match(source, /function renderCustomerQr/);
  assert.match(source, /const payload = customer\.id/);
  assert.doesNotMatch(source, /function customerStaffUrl/);
  assert.doesNotMatch(source, />Back<\/button>/);
});

test("staff QR scan opens add-points screen after selecting the customer", () => {
  const source = read("js/staff-app.js");
  const html = read("staff.html");

  assert.match(source, /selectCustomerById\(customerId,\s*\{\s*navigate:\s*false\s*\}\)/);
  assert.match(source, /function selectCustomerById\(customerId,\s*options = \{\}\)/);
  assert.match(source, /addPointsUnlockedByScan = true/);
  assert.match(source, /Scan the customer's QR code before adding points/);
  assert.match(source, /window\.show\?\.\("add-points-screen"\)/);
  assert.match(html, /id="add-points-screen"/);
  assert.match(html, /id="confirm-add-points"/);
});
