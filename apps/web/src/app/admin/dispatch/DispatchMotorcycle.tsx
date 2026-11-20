import type { CSSProperties } from "react";
import styles from "./page.module.css";

export type DispatchVehicle = { model: string | null; color: string | null };

const paintColors = [
  [/vermelh|bord[oô]/i, "#df3e47"],
  [/prat/i, "#c3cbd9"],
  [/cinz|grafit/i, "#68778f"],
  [/pret/i, "#34394a"],
  [/branc/i, "#f2ede1"],
  [/azul/i, "#4287d9"],
  [/verde/i, "#52a66a"],
  [/amarel/i, "#eab53d"],
] as const;

export function DispatchMotorcycle({ vehicle }: { vehicle?: DispatchVehicle | null }) {
  const model = vehicle?.model?.trim();
  const color = vehicle?.color?.trim();
  const paint = paintColors.find(([pattern]) => pattern.test(color ?? ""))?.[1] ?? "#8993a3";
  const label = [model, color].filter(Boolean).join(", ");
  const silhouette = /twister|cb\s?300/i.test(model ?? "") ? "twister" : /fan|\bcg\b/i.test(model ?? "") ? "fan" : "generic";

  return <span className={styles.motorcycle} role="img" aria-label={label ? `Moto ${label}` : "Moto do entregador"}
    title={label || "Moto do entregador"} data-silhouette={silhouette} style={{ "--bike-paint": paint } as CSSProperties}>
    <span className={styles.bikeWheelBack} /><span className={styles.bikeWheelFront} />
    <span className={styles.bikeFrame} /><span className={styles.bikeFork} />
    <span className={styles.bikeSeat} /><span className={styles.bikeTank} />
    <span className={styles.bikeLamp} /><span className={styles.bikeHandle} />
  </span>;
}
