import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(projectDir, "data");
const dbPath = join(dataDir, "meals.sqlite");
const uploadsDir = join(dataDir, "uploads");

function timestampForFolder(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectFiles(dir, baseDir = dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath, baseDir);
    if (!entry.isFile() || entry.name === ".gitkeep") return [];
    return [fullPath];
  });
}

function copyUploads(exportDir) {
  const uploadFiles = collectFiles(uploadsDir);
  const exportedUploadsDir = join(exportDir, "uploads");
  mkdirSync(exportedUploadsDir, { recursive: true });

  return uploadFiles.map((sourcePath) => {
    const relativeUploadPath = relative(uploadsDir, sourcePath);
    const exportedPath = join(exportedUploadsDir, relativeUploadPath);
    mkdirSync(dirname(exportedPath), { recursive: true });
    copyFileSync(sourcePath, exportedPath);

    const stats = statSync(sourcePath);
    return {
      file_name: basename(sourcePath),
      source_relative_path: relative(projectDir, sourcePath).replaceAll("\\", "/"),
      exported_relative_path: relative(exportDir, exportedPath).replaceAll("\\", "/"),
      size_bytes: stats.size,
      modified_at: stats.mtime.toISOString(),
    };
  });
}

if (!existsSync(dbPath)) {
  throw new Error(`SQLite database not found at ${relative(projectDir, dbPath)}`);
}

const exportDir = process.argv[2]
  ? resolve(projectDir, process.argv[2])
  : join(projectDir, "backup", "exports", timestampForFolder());

mkdirSync(exportDir, { recursive: true });

const db = new DatabaseSync(dbPath, { readOnly: true });
const meals = db.prepare("SELECT * FROM meals ORDER BY meal_name COLLATE NOCASE, id").all();
const mealOrders = db
  .prepare("SELECT * FROM meal_orders ORDER BY ordered_week_start_date, meal_id, id")
  .all();
db.close();

const uploadManifest = copyUploads(exportDir);

writeJson(join(exportDir, "meals.json"), meals);
writeJson(join(exportDir, "meal_orders.json"), mealOrders);
writeJson(join(exportDir, "uploads-manifest.json"), uploadManifest);
writeJson(join(exportDir, "manifest.json"), {
  exported_at: new Date().toISOString(),
  source_database: relative(projectDir, dbPath).replaceAll("\\", "/"),
  source_uploads_folder: relative(projectDir, uploadsDir).replaceAll("\\", "/"),
  files: {
    meals: "meals.json",
    meal_orders: "meal_orders.json",
    uploads_manifest: "uploads-manifest.json",
    uploads_folder: "uploads/",
  },
  counts: {
    meals: meals.length,
    meal_orders: mealOrders.length,
    upload_files: uploadManifest.length,
  },
  notes: [
    "This export preserves existing meal and meal_order IDs for Supabase migration.",
    "Uploaded image files are copied into the export uploads folder and listed in uploads-manifest.json.",
    "The original data/meals.sqlite database and data/uploads folder are not modified by this script.",
  ],
});

console.log(`Export complete: ${exportDir}`);
console.log(`Meals: ${meals.length}`);
console.log(`Meal orders: ${mealOrders.length}`);
console.log(`Upload files copied: ${uploadManifest.length}`);
