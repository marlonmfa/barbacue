import type { SVGProps } from "react";

export type AdminIconName =
  | "home"
  | "orders"
  | "products"
  | "categories"
  | "coupons"
  | "tables"
  | "customers"
  | "whatsapp"
  | "team"
  | "calendar"
  | "settings"
  | "system"
  | "user"
  | "beaker"
  | "logout"
  | "external"
  | "menu"
  | "close"
  | "arrow"
  | "printer"
  | "mail"
  | "clock"
  | "delivery"
  | "kitchen"
  | "route"
  | "check"
  | "plus"
  | "spark"
  | "chevron";

export function AdminIcon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: AdminIconName; size?: number }) {
  const paths: Record<AdminIconName, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.3V21h13V9.3M9 21v-6h6v6"/></>,
    orders: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    products: <><path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v9"/></>,
    categories: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    coupons: <><path d="M3 8.5V5h3.5L21 19.5 16.5 24 2 9.5 3 8.5Z" transform="translate(0 -2)"/><circle cx="7" cy="7" r="1"/></>,
    tables: <><path d="M5 8h14l1 6H4l1-6ZM7 14v7M17 14v7M8 4v4M16 4v4"/></>,
    customers: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    whatsapp: <><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.45L3 20l1.08-4.7A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M8.1 7.8c.4 3.2 2.9 5.7 6.1 6.1l1.2-1.5-2.1-1-1 1c-1.4-.6-2.1-1.3-2.7-2.7l1-1-1-2.1-1.5 1.2Z"/></>,
    team: <><circle cx="9" cy="8" r="3.5"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4.5a3.5 3.5 0 0 1 0 7M17 15a5 5 0 0 1 4 4v2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    system: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h4M15 13h2M7 17h7"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    beaker: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></>,
    external: <><path d="M14 3h7v7M10 14 21 3M18 13v7H4V6h7"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    printer: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><path d="M18 12h.01"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    delivery: <><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    kitchen: <><path d="M6 13a5 5 0 0 1 0-10 5 5 0 0 1 9-1 5 5 0 1 1 3 11v8H6v-8ZM6 17h12"/></>,
    route: <><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8M6 9v2M18 15v-2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    spark: <><path d="m12 3 1.25 4.25L17.5 8.5l-4.25 1.25L12 14l-1.25-4.25L6.5 8.5l4.25-1.25L12 3Z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
