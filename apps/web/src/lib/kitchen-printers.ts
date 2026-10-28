import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kitchenPrintDevices, kitchenPrinterRoutes } from "@/db/schema";

// Preserve the exact OS printer name, including any spaces at its edges.
const deviceName = z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/).refine(value => value.trim().length > 0);
export const printerInventorySchema = z.object({
  id: z.string().uuid(), name: deviceName,
  printers: z.array(z.object({ name: deviceName, displayName: deviceName })).max(100),
});
export const printerRouteSchema = z.object({
  brand: z.enum(["barbacue", "chelas", "barbadog"]),
  mode: z.enum(["default", "paused", "printer"]),
  deviceId: z.string().uuid().optional(), printerName: deviceName.optional(),
  paper: z.union([z.literal(58), z.literal(80), z.literal(210)]).default(80),
}).refine(value => value.mode !== "printer" || Boolean(value.deviceId && value.printerName));

export async function registerPrinterInventory(value: z.infer<typeof printerInventorySchema>) {
  const printers = [...new Map(value.printers.map(p => [p.name, p])).values()];
  await db.insert(kitchenPrintDevices).values({ ...value, printers, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: kitchenPrintDevices.id, set: { name: value.name, printers, lastSeenAt: new Date() } });
}

export async function printerOverview() {
  const [devices, routes] = await Promise.all([
    db.select().from(kitchenPrintDevices).orderBy(kitchenPrintDevices.name),
    db.select().from(kitchenPrinterRoutes),
  ]);
  return {
    devices: devices.map(device => ({ ...device, online: Date.now() - device.lastSeenAt.getTime() < 60_000 })),
    routes,
  };
}

export async function savePrinterRoute(value: z.infer<typeof printerRouteSchema>): Promise<boolean> {
  return db.transaction(async tx => {
    if (value.mode === "default") {
      await tx.delete(kitchenPrinterRoutes).where(eq(kitchenPrinterRoutes.brand, value.brand));
      return true;
    }
    if (value.mode === "printer") {
      const [device] = await tx.select().from(kitchenPrintDevices).where(eq(kitchenPrintDevices.id, value.deviceId!)).for("share");
      if (!device?.printers.some(printer => printer.name === value.printerName)) return false;
    }
    const route = {
      brand: value.brand, paper: value.paper,
      deviceId: value.mode === "printer" ? value.deviceId! : null,
      printerName: value.mode === "printer" ? value.printerName! : null,
    };
    await tx.insert(kitchenPrinterRoutes).values(route)
      .onConflictDoUpdate({ target: kitchenPrinterRoutes.brand, set: route });
    return true;
  });
}
