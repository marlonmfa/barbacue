import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  const cats = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder));

  const prods = await db
    .select()
    .from(products)
    .where(eq(products.available, true))
    .orderBy(asc(products.sortOrder));

  const grouped = cats.map((cat) => ({
    ...cat,
    products: prods.filter((p) => p.categoryId === cat.id),
  }));

  return Response.json(grouped);
}
