"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/cart";
import { deliveryEstimate, parseCheckoutQuote, quoteMatchesAddress } from "@/lib/delivery-checkout";
import type { CheckoutDeliveryQuote, DeliveryAvailability, DeliveryBrand } from "@/lib/delivery-checkout";
import styles from "./DeliveryQuote.module.css";

interface Props {
  address: string;
  brand: DeliveryBrand;
  quote: CheckoutDeliveryQuote | null;
  availability: DeliveryAvailability;
  disabled?: boolean;
  onAddressChange: (address: string) => void;
  onQuoteChange: (quote: CheckoutDeliveryQuote | null) => void;
  onAvailabilityChange: (availability: DeliveryAvailability) => void;
}

export function DeliveryQuote({ address, brand, quote, availability, disabled = false, onAddressChange, onQuoteChange, onAvailabilityChange }: Props) {
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const request = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const currentQuote = quoteMatchesAddress(quote, address, brand) ? quote : null;

  const checkAvailability = useCallback(async (signal?: AbortSignal) => {
    onAvailabilityChange("loading");
    try {
      const response = await fetch("/api/delivery/quote", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || typeof data.enabled !== "boolean") throw new Error("Não foi possível verificar a entrega.");
      if (signal?.aborted) return;
      const next = data.enabled ? "enabled" : "disabled";
      onAvailabilityChange(next);
    } catch {
      if (signal?.aborted) return;
      onAvailabilityChange("error");
    }
  }, [onAvailabilityChange]);

  useEffect(() => {
    const controller = new AbortController();
    const activeRequest = request.current;
    void checkAvailability(controller.signal);
    return () => { controller.abort(); activeRequest.sequence++; activeRequest.controller?.abort(); };
  }, [checkAvailability]);

  useEffect(() => {
    if (!quote) return;
    const timeout = setTimeout(() => {
      onQuoteChange(null);
      setExpired(true);
    }, Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timeout);
  }, [quote, onQuoteChange]);

  async function calculate() {
    if (disabled || calculating || !address.trim()) return;
    const sequence = ++request.current.sequence;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    setError(null);
    setExpired(false);
    setCalculating(true);
    onQuoteChange(null);
    try {
      const response = await fetch("/api/delivery/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), brand }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      const data = await response.json();
      if (sequence !== request.current.sequence) return;
      if (!response.ok) {
        if (data.error === "delivery_disabled") {
          onAvailabilityChange("disabled");
          return;
        }
        throw new Error(typeof data.message === "string" ? data.message : "Não foi possível calcular o frete. Confira o endereço e tente novamente.");
      }
      onQuoteChange(parseCheckoutQuote(data, address, brand));
    } catch (cause) {
      if (sequence !== request.current.sequence || controller.signal.aborted) return;
      setError(cause instanceof TypeError ? "Sem conexão. Tente calcular o frete novamente." : cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "A consulta demorou demais. Tente calcular o frete novamente.");
    } finally {
      if (sequence === request.current.sequence) setCalculating(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="delivery-title" aria-busy={calculating}>
      <div className={styles.heading}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <div><h2 id="delivery-title">Entrega no seu endereço</h2><p>Confira o destino antes de finalizar.</p></div>
      </div>
      <label className={styles.label} htmlFor="payment-delivery-address">Endereço de entrega</label>
      <textarea id="payment-delivery-address" value={address} disabled={disabled} rows={2} maxLength={500}
        autoComplete="street-address" placeholder="Rua, número, bairro, cidade e CEP" aria-describedby="delivery-address-help"
        onChange={event => {
          request.current.sequence++; request.current.controller?.abort();
          setCalculating(false); setError(null); setExpired(false);
          onQuoteChange(null); onAddressChange(event.target.value);
        }} className={styles.address} />
      <p id="delivery-address-help" className={styles.help}>Inclua o número, a cidade e o CEP para localizar a entrega.</p>
      {availability === "loading" && <p role="status" className={styles.help}>Verificando as condições de entrega…</p>}
      {availability === "error" && <div className={styles.error} role="alert"><p>Não foi possível verificar a entrega. Confira sua conexão e tente novamente.</p><button type="button" disabled={disabled} onClick={() => void checkAvailability()}>Verificar entrega</button></div>}
      {availability === "enabled" && <>
        {currentQuote ? <div className={styles.result} role="status">
          <div className={styles.priceRow}><strong>Frete para este endereço</strong><span>{formatPrice(currentQuote.feeCents)}</span></div>
          <p>{deliveryEstimate(currentQuote.distanceMeters, currentQuote.durationSeconds)}</p>
          <p className={styles.help}>Tempo estimado de deslocamento. O preparo do pedido é contado à parte.</p>
          <p className={styles.help}>Valor reservado até {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(currentQuote.expiresAt))}.</p>
          <p className={styles.attribution}>Dados de mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>
        </div> : <>
          {expired && <p role="status" className={styles.notice}>A cotação expirou. Calcule o frete novamente para confirmar o valor.</p>}
          <button type="button" className={styles.calculate} onClick={calculate} disabled={disabled || calculating || !address.trim()}>
            {calculating ? "Calculando frete…" : "Calcular frete"}
          </button>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </>}
    </section>
  );
}
