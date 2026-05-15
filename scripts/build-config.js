const fs = require("node:fs");
const path = require("node:path");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const rawSiteUrl = process.env.SITE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, "") : "";

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  process.exit(1);
}

const out = `window.PEACHES_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)},
  SITE_URL: ${JSON.stringify(siteUrl)}
};
`;

fs.writeFileSync(path.join(__dirname, "..", "js", "config.js"), out);
console.log("Generated js/config.js");
