/** Tipos mínimos usados pela integração. Campos extras da API são preservados via index signature. */

export interface IfoodEvent {
  id: string;
  code: string; // PLC, CFM, RTP, DSP, CON, CAN, ...
  fullCode?: string;
  orderId: string;
  merchantId?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface IfoodMerchant {
  id: string;
  name: string;
  corporateName?: string;
  [k: string]: unknown;
}

export interface IfoodOrderCustomer {
  id?: string;
  name?: string;
  phone?: { number?: string; localizer?: string; localizerExpiration?: string };
  documentNumber?: string;
  [k: string]: unknown;
}

export interface IfoodOrderItem {
  id?: string;
  index?: number;
  name: string;
  externalCode?: string;
  quantity: number;
  unitPrice?: number;
  optionsPrice?: number;
  totalPrice?: number;
  observations?: string;
  options?: Array<{
    name: string;
    quantity: number;
    unitPrice?: number;
    externalCode?: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export interface IfoodOrder {
  id: string;
  displayId?: string;
  orderType?: "DELIVERY" | "TAKEOUT" | "INDOOR" | string;
  orderTiming?: "IMMEDIATE" | "SCHEDULED" | string;
  createdAt?: string;
  merchant?: { id: string; name?: string };
  customer?: IfoodOrderCustomer;
  items?: IfoodOrderItem[];
  total?: {
    subTotal?: number;
    deliveryFee?: number;
    benefits?: number;
    orderAmount?: number;
    additionalFees?: number;
  };
  delivery?: {
    mode?: string;
    deliveryDateTime?: string;
    deliveryAddress?: {
      streetName?: string;
      streetNumber?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      reference?: string;
      formattedAddress?: string;
      coordinates?: { latitude?: number; longitude?: number };
    };
    [k: string]: unknown;
  };
  payments?: {
    prepaid?: number;
    pending?: number;
    methods?: Array<{
      method?: string;
      type?: "ONLINE" | "OFFLINE" | string;
      value?: number;
      currency?: string;
      card?: { brand?: string };
      cash?: { changeFor?: number };
      transaction?: { authorizationCode?: string; acquirerDocument?: string };
      [k: string]: unknown;
    }>;
  };
  [k: string]: unknown;
}

export interface CancellationReason {
  cancelCodeId: string;
  description: string;
  [k: string]: unknown;
}
