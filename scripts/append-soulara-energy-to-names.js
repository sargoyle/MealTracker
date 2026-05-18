const appUrl = process.env.MEAL_TRACKER_URL || "http://localhost:4173";

async function api(path, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function extractEnergy(notes = "") {
  const perServe = notes.match(/Average quantity per serve:\s*350g([\s\S]*?)(?:Average quantity per serve:\s*100g|$)/i)?.[1] || notes;
  const energy = perServe.match(/Energy:\s*([\d.]+)\s*kJ\s*\/\s*([\d.]+)\s*Cal/i);
  if (!energy) return null;

  const kj = Number(energy[1]);
  const cal = Number(energy[2]);
  if (!Number.isFinite(kj) || !Number.isFinite(cal)) return null;
  return `${Math.round(cal)} Cal / ${Math.round(kj)} kJ`;
}

function stripExistingEnergy(name) {
  return name.replace(/\s+\(\d+\s*Cal\s*\/\s*\d+\s*kJ\)$/i, "");
}

const { meals } = await api("/api/meals?status=All&show_archived=true&meal_type=All&rating=All");
const soularaMeals = meals.filter((meal) => meal.meal_provider === "Soulara");

let updated = 0;
let skipped = 0;

for (const meal of soularaMeals) {
  const energy = extractEnergy(meal.notes || "");
  if (!energy) {
    skipped += 1;
    continue;
  }

  const baseName = stripExistingEnergy(meal.meal_name);
  const mealName = `${baseName} (${energy})`;
  if (meal.meal_name === mealName) {
    skipped += 1;
    continue;
  }

  await api(`/api/meals/${meal.id}`, {
    method: "PUT",
    body: JSON.stringify({
      meal_name: mealName,
      meal_provider: meal.meal_provider,
      meal_type: meal.meal_type,
      image_url: meal.image_url || "",
      ingredients_image_url: meal.ingredients_image_url || "",
      nutrition_image_url: meal.nutrition_image_url || "",
      description: meal.description || "",
      rating: meal.rating,
      notes: meal.notes || "",
      last_ordered_date: meal.last_ordered_date || "",
      season: meal.season || "",
      week_number: meal.week_number || "",
      day_available: meal.day_available || "",
      status: meal.status,
      archive: Boolean(meal.archive),
    }),
  });
  updated += 1;
}

console.log(JSON.stringify({ soularaMeals: soularaMeals.length, updated, skipped }, null, 2));
