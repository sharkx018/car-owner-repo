#!/usr/bin/env node
// Generates index.html from template.html using env vars.
//
// Locally: reads .env (gitignored, never committed) if present.
// In CI (GitHub Actions): .env doesn't exist, so it falls back to
// process.env, populated from GitHub repository variables — see
// .github/workflows/deploy.yml. Either way, the real values never
// need to be committed to the repo.
//
// Run: node build.js  (re-run any time .env changes)

const fs = require("fs");
const path = require("path");

const root = __dirname;
const envPath = path.join(root, ".env");
const templatePath = path.join(root, "template.html");
const outPath = path.join(root, "index.html");

const REQUIRED_KEYS = ["CAR_NUMBER", "OWNER_NAMES", "OWNER_PHONES"];

function parseEnvFile(content) {
  const vars = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function loadEnv() {
  // Start with whatever's already in process.env (e.g. from CI secrets).
  const vars = {};
  for (const key of REQUIRED_KEYS) {
    if (process.env[key]) vars[key] = process.env[key];
  }
  // Layer in .env file values when present (local dev), without
  // overriding anything already supplied via real env vars.
  if (fs.existsSync(envPath)) {
    const fileVars = parseEnvFile(fs.readFileSync(envPath, "utf8"));
    for (const key of Object.keys(fileVars)) {
      if (!vars[key]) vars[key] = fileVars[key];
    }
  }
  const missing = REQUIRED_KEYS.filter((k) => !vars[k]);
  if (missing.length) {
    throw new Error(
      `Missing values for: ${missing.join(", ")}. Provide a local .env file or set them as env vars.`
    );
  }
  return vars;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function ownerCardHtml(name, phone, index) {
  const cleanPhone = phone.replace(/[^\d+]/g, "");
  const waPhone = cleanPhone.replace(/^\+/, "");
  const avatarStyle = `background: var(--avatar-${(index % 4) + 1})`;
  return `
      <div class="owner">
        <div class="owner-top">
          <div class="avatar" style="${avatarStyle}">${escapeHtml(initials(name))}</div>
          <div class="owner-info">
            <div class="owner-label">Owner ${index + 1}</div>
            <div class="owner-name">${escapeHtml(name)}</div>
          </div>
        </div>
        <div class="owner-bottom">
          <div class="owner-phone">${escapeHtml(phone)}</div>
          <div class="owner-actions">
            <a class="btn btn-call" href="tel:${escapeHtml(cleanPhone)}" aria-label="Call ${escapeHtml(name)}">📞 Call</a>
            <a class="btn btn-whatsapp" href="https://wa.me/${escapeHtml(waPhone)}" aria-label="WhatsApp ${escapeHtml(name)}">💬 Chat</a>
          </div>
        </div>
      </div>`;
}

const env = loadEnv();
let html = fs.readFileSync(templatePath, "utf8");

const names = env.OWNER_NAMES.split(",").map((s) => s.trim());
const phones = env.OWNER_PHONES.split(",").map((s) => s.trim());

if (names.length !== phones.length) {
  throw new Error(
    `OWNER_NAMES (${names.length}) and OWNER_PHONES (${phones.length}) must have the same number of comma-separated entries.`
  );
}

// Loop over each name/phone pair by index and render one owner card per entry.
const ownersHtml = names
  .map((name, index) => ownerCardHtml(name, phones[index], index))
  .join("\n");

html = html.split("{{OWNERS}}").join(ownersHtml);
html = html.split("{{CAR_NUMBER}}").join(escapeHtml(env.CAR_NUMBER));

fs.writeFileSync(outPath, html);
console.log(`Generated ${outPath} with ${names.length} owner(s)`);
