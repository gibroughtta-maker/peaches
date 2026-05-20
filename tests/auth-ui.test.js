const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

test("index renders password login, registration, and reset entry points", () => {
  const html = read("index.html");

  assert.match(html, /id="email-login-form"/);
  assert.match(html, /data-auth-mode="login"/);
  assert.match(html, /data-auth-mode="register"/);
  assert.doesNotMatch(html, /data-login-intent/);
  assert.doesNotMatch(html, /Sign-in type/);
  assert.doesNotMatch(html, />Customer</);
  assert.doesNotMatch(html, />Staff</);
  assert.match(html, /Staff access is managed by Peaches in Supabase/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.match(html, /id="confirm-password"/);
  assert.match(html, /id="full-name"/);
  assert.match(html, /id="birth-date"/);
  assert.match(html, /id="phone"/);
  assert.match(html, /autocomplete="name"/);
  assert.match(html, /autocomplete="bday"/);
  assert.match(html, /autocomplete="tel"/);
  assert.match(html, /id="forgot-password"/);
  assert.match(html, /Log in/);
  assert.match(html, /Register/);
  assert.doesNotMatch(html, /Continue with email/);
  assert.match(html, /class="phone-frame"/);
  assert.match(html, /body > \.logo\s*\{[\s\S]*top:\s*28px/);
  assert.match(html, /\.tagline\s*\{[\s\S]*top:\s*88px/);
  assert.match(html, /\.phone-header\s*\{[\s\S]*height:\s*126px/);
  assert.doesNotMatch(html, /top:\s*96px/);
  assert.doesNotMatch(html, /top:\s*164px/);
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
    assert.match(html, /auth-router\.js\?v=20260520-signup-phone/);
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

test("reset password page renders a password update form", () => {
  const html = read("reset-password.html");

  assert.match(html, /id="password-reset-form"/);
  assert.match(html, /id="reset-password"/);
  assert.match(html, /id="reset-password-confirm"/);
  assert.match(html, /Update password/);
  assert.match(html, /\/js\/auth-router\.js/);
});

test("password auth redirects use the configured production site instead of localhost", () => {
  const source = read("js/auth-router.js");
  const buildConfig = read("scripts/build-config.js");

  assert.match(source, /function signInRedirectTo/);
  assert.match(source, /function passwordResetRedirectTo/);
  assert.match(source, /PEACHES_CONFIG\?\.SITE_URL/);
  assert.match(source, /peaches-puce\.vercel\.app/);
  assert.match(source, /emailRedirectTo: signInRedirectTo\(\)/);
  assert.match(source, /redirectTo: passwordResetRedirectTo\(\)/);
  assert.match(buildConfig, /SITE_URL/);
  assert.match(buildConfig, /VERCEL_PROJECT_PRODUCTION_URL/);
});

test("customer app renders QR per customer and keeps history back arrow-only", () => {
  const source = read("js/customer-app.js");
  const html = read("customer.html");

  assert.match(source, /function renderCustomerQr/);
  assert.match(source, /const payload = customer\.id/);
  assert.doesNotMatch(html, /class="qr-name"/);
  assert.doesNotMatch(html, /class="qr-id"/);
  assert.doesNotMatch(html, /class="qr-pts-pill"/);
  assert.doesNotMatch(html, /Show this code to your therapist/);
  assert.doesNotMatch(html, /reward ready to redeem/);
  assert.doesNotMatch(source, /function customerStaffUrl/);
  assert.doesNotMatch(source, />Back<\/button>/);
});

test("staff QR scan verifies a customer before point and voucher actions", () => {
  const source = read("js/staff-app.js");
  const html = read("staff.html");

  assert.match(source, /openCustomer\(customerId,\s*\{\s*verifiedByScan:\s*true,\s*navigateTo:\s*"client-detail"\s*\}\)/);
  assert.match(source, /selectedVerifiedByScan = verifiedByScan/);
  assert.match(html, /Scan the customer's QR code before adding points/);
  assert.match(source, /getElementById\("go-add-points"\)/);
  assert.match(source, /getElementById\("go-redeem"\)/);
  assert.match(html, /id="add-points-screen"/);
  assert.match(html, /id="voucher-screen"/);
  assert.match(html, /id="confirm-add-points"/);
  assert.doesNotMatch(html, /Sophie Anderson/);
  assert.doesNotMatch(html, /Jessica Mills/);
});

test("signup phone is persisted through Supabase customer trigger", () => {
  const migration = read("supabase/migrations/20260520000002_require_signup_phone.sql");

  assert.match(migration, /alter table public\.customers[\s\S]*add column if not exists phone text/);
  assert.match(migration, /alter table public\.staff[\s\S]*add column if not exists phone text/);
  assert.match(migration, /raw_user_meta_data ->> 'phone'/);
  assert.match(migration, /phone = coalesce\(nullif\(excluded\.phone, ''\), public\.customers\.phone\)/);
});
