import images from "@/data/pedir-product-images.json";

type Brand = "barbacue" | "barbadog" | "chelas";
interface MenuPhoto {
  brand: Brand; productId: number; name: string; originalImageUrl: string | null;
  imageUrl: string; illustrative: boolean;
}
const catalog = new Map((images as MenuPhoto[]).map(image => [`${image.brand}:${image.productId}`, image]));

/** Keep newer owner uploads and renamed products ahead of a reviewed snapshot. */
export function orderingImage(brand: Brand, product: { id: number; name: string; imageUrl: string | null }) {
  const image = catalog.get(`${brand}:${product.id}`);
  if (image && image.name === product.name && (product.imageUrl === image.originalImageUrl || product.imageUrl === image.imageUrl)) {
    return { src: image.imageUrl, illustrative: image.illustrative };
  }
  return { src: product.imageUrl, illustrative: Boolean(product.imageUrl?.startsWith("/menu/")) };
}
