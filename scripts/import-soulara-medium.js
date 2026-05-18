const collectionUrl = "https://soulara.com.au/collections/medium/products.json?limit=250";
const appUrl = process.env.MEAL_TRACKER_URL || "http://localhost:4173";

function decodeEntities(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, "\"")
    .replace(/&rdquo;/g, "\"")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");
}

function htmlToText(html = "") {
  return decodeEntities(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstParagraph(html = "") {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return htmlToText(match?.[1] || html).split(/\n\s*Ingredients:?/i)[0].trim();
}

function macroLine(text = "") {
  const match = text.match(/(\d+)\s*Cal\s*(\d+)\s*P\s*(\d+)\s*C\s*(\d+)\s*F/i);
  return match ? `${match[1]} Cal, ${match[2]} P, ${match[3]} C, ${match[4]} F` : "";
}

async function api(path, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

const existingData = await api("/api/meals?status=All&show_archived=true&meal_type=All&rating=All");
const existing = new Set(
  (existingData.meals || []).map((meal) => `${(meal.meal_provider || "").toLowerCase()}::${meal.meal_name.toLowerCase()}`),
);

const collectionResponse = await fetch(collectionUrl);
if (!collectionResponse.ok) throw new Error(`Soulara collection request failed: ${collectionResponse.status}`);
const collection = await collectionResponse.json();

let added = 0;
let skipped = 0;

for (const product of collection.products || []) {
  const key = `soulara::${product.title.toLowerCase()}`;
  if (existing.has(key)) {
    skipped += 1;
    continue;
  }

  const variant = product.variants?.[0] || {};
  const details = htmlToText(product.body_html || "");
  const macros = macroLine(details);
  const notes = [
    `Source: https://soulara.com.au/products/${product.handle}`,
    variant.grams ? `Size: ${variant.grams} g` : "Size: 350 g",
    variant.price ? `Price at import: $${variant.price}` : "",
    macros ? `Nutrition summary: ${macros}` : "",
    details ? `Scraped product details:\n${details}` : "",
  ].filter(Boolean).join("\n\n");

  await api("/api/meals", {
    method: "POST",
    body: JSON.stringify({
      meal_name: product.title,
      meal_provider: "Soulara",
      meal_type: "Dinner",
      image_url: product.images?.[0]?.src || "",
      description: firstParagraph(product.body_html || ""),
      rating: "Not rated",
      notes,
      season: "",
      week_number: "",
      day_available: "",
      status: "Active",
      archive: false,
    }),
  });

  existing.add(key);
  added += 1;
}

console.log(JSON.stringify({ products: collection.products?.length || 0, added, skipped }, null, 2));
