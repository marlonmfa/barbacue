import type { Brand } from "./brands";

export interface MenuChoice {
  productId: number;
  qty: number;
}

export interface MenuOption {
  id: number;
  name: string;
  priceCents: number;
}

export interface MenuOptionGroup {
  slug: string;
  name: string;
  options: MenuOption[];
}

export const OPTION_GROUP_LIMIT = 9;
const burgerGroups = ["turbine-seu-lanche", "para-acompanhar", "molhos"];
const groupsByCategory: Record<string, readonly string[]> = {
  hamburgueres: burgerGroups,
  "hamburguer-vegetariano": ["para-acompanhar", "molhos"],
  "combos-individuais": burgerGroups,
  "combos-para-compartilhar": ["para-acompanhar", "molhos"],
  porcoes: ["turbinar-porcao", "molhos"],
};

export function optionGroupsFor(brand: Brand, category: string | null | undefined): readonly string[] {
  return brand === "barbacue" && category && Object.hasOwn(groupsByCategory, category)
    ? groupsByCategory[category]
    : [];
}

export function cartLineKey(item: { productId: number; brand?: Brand; notes?: string | null; choices?: readonly MenuChoice[] }) {
  return JSON.stringify([
    item.brand ?? "barbacue", item.productId, item.notes?.trim() ?? "",
    [...(item.choices ?? [])].sort((a, b) => a.productId - b.productId).map(choice => [choice.productId, choice.qty]),
  ]);
}

export function menuOptionsTotal(choices: readonly MenuChoice[], groups: readonly MenuOptionGroup[]) {
  const prices = new Map(groups.flatMap(group => group.options.map(option => [option.id, option.priceCents] as const)));
  return choices.reduce((total, choice) => total + (prices.get(choice.productId) ?? 0) * choice.qty, 0);
}
