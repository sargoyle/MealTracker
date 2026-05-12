import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url));
const dbPath = join(projectDir, "data", "meals.sqlite");
const uploadsDir = join(projectDir, "data", "uploads");
const dryRun = process.argv.includes("--dry-run");

loadLocalEnv();

const supabaseUrl = stripTrailingSlash(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "meal-images";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function requireSupabaseConfig() {
  if (dryRun) return;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for migration.");
}

function contentTypeFor(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function collectUploadFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectUploadFiles(fullPath);
    if (!entry.isFile() || entry.name === ".gitkeep") return [];
    return [fullPath];
  });
}

function storageObjectPathForFileName(fileName) {
  return `legacy/${fileName}`;
}

function storagePublicUrl(objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(storageBucket)}/${encodedPath}`;
}

function migrateImageUrl(value) {
  if (!value || !value.startsWith("/uploads/")) return value;
  const objectPath = storageObjectPathForFileName(value.split("/").pop());
  return storagePublicUrl(objectPath);
}

function normalizeMeal(meal) {
  return {
    ...meal,
    image_url: migrateImageUrl(meal.image_url),
    ingredients_image_url: migrateImageUrl(meal.ingredients_image_url),
    nutrition_image_url: migrateImageUrl(meal.nutrition_image_url),
  };
}

async function supabaseRest(path, { method = "GET", query = {}, body, prefer = "return=minimal" } = {}) {
  requireSupabaseConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    let message = `Supabase request failed (${response.status}).`;
    try {
      const data = JSON.parse(text);
      message = data.message || data.hint || data.details || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

async function uploadFile(sourcePath) {
  const fileName = basename(sourcePath);
  const objectPath = storageObjectPathForFileName(fileName);
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(storageBucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": contentTypeFor(fileName),
      "x-upsert": "true",
    },
    body: readFileSync(sourcePath),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage upload failed for ${fileName} (${response.status}): ${text}`);
  }
}

function readSqliteData() {
  if (!existsSync(dbPath)) throw new Error(`SQLite database not found: ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const meals = db.prepare("SELECT * FROM meals ORDER BY meal_name COLLATE NOCASE, id").all();
    const mealOrders = db.prepare("SELECT * FROM meal_orders ORDER BY ordered_week_start_date, meal_id, id").all();
    return { meals, mealOrders };
  } finally {
    db.close();
  }
}

function summarize({ meals, mealOrders, uploadFiles }) {
  const imageRefs = new Set();
  for (const meal of meals) {
    for (const key of ["image_url", "ingredients_image_url", "nutrition_image_url"]) {
      if (meal[key]?.startsWith("/uploads/")) imageRefs.add(meal[key].split("/").pop());
    }
  }

  console.log(`SQLite source: ${dbPath}`);
  console.log(`Uploads source: ${uploadsDir}`);
  console.log(`Mode: ${dryRun ? "dry run, no writes" : "write to Supabase"}`);
  console.log(`Meals to upsert: ${meals.length}`);
  console.log(`Meal orders to upsert: ${mealOrders.length}`);
  console.log(`Upload files to upload: ${uploadFiles.length}`);
  console.log(`Upload files referenced by meal image fields: ${imageRefs.size}`);

  if (dryRun) {
    console.log("");
    console.log("Sample meal image URL mapping:");
    const sample = meals.find((meal) => meal.image_url?.startsWith("/uploads/"));
    if (sample) console.log(`${sample.image_url} -> ${migrateImageUrl(sample.image_url)}`);
    else console.log("No /uploads/ meal image URL found.");
  }
}

const { meals, mealOrders } = readSqliteData();
const uploadFiles = collectUploadFiles(uploadsDir);
summarize({ meals, mealOrders, uploadFiles });

if (dryRun) {
  console.log("");
  console.log("Dry run complete. No Supabase writes were made.");
  process.exit(0);
}

console.log("");
console.log(`Uploading files to Supabase Storage bucket "${storageBucket}"...`);
for (const filePath of uploadFiles) {
  await uploadFile(filePath);
}

console.log("Upserting meals into Supabase...");
await supabaseRest("meals", {
  method: "POST",
  query: { on_conflict: "id" },
  body: meals.map(normalizeMeal),
  prefer: "resolution=merge-duplicates,return=minimal",
});

console.log("Upserting meal orders into Supabase...");
await supabaseRest("meal_orders", {
  method: "POST",
  query: { on_conflict: "id" },
  body: mealOrders,
  prefer: "resolution=merge-duplicates,return=minimal",
});

console.log("Migration complete.");
