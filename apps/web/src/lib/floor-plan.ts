export const FLOOR_COLUMNS = 32;
export const FLOOR_ROWS = 20;
export const MAX_FLOOR_ELEMENTS = 150;
export const MAX_TABLE_NUMBER = 2_147_483_647;

export type FloorRect = { x: number; y: number; width: number; height: number };
export type FloorArea = FloorRect & { id: string; kind: "area"; name: string; locked: boolean };
export type FloorTable = FloorRect & { id: string; kind: "table"; tableId: number | null; reference?: string };
export type FloorElement = FloorArea | FloorTable;
export type FloorPlan = { revision: number; elements: FloorElement[] };

export function overlaps(a: FloorRect, b: FloorRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

export function lockedAreaFor(table: FloorRect, elements: FloorElement[]): FloorArea | undefined {
  return elements.find((element): element is FloorArea =>
    element.kind === "area" && element.locked && overlaps(table, element),
  );
}

export function canPlaceTable(table: FloorTable, elements: FloorElement[]) {
  return !lockedAreaFor(table, elements) &&
    !elements.some(element => element.kind === "table" && element.id !== table.id && overlaps(table, element));
}
