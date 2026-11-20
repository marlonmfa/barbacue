"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatPrice } from "@/lib/cart";
import { menuOptionsTotal, OPTION_GROUP_LIMIT, type MenuChoice, type MenuOptionGroup } from "@/lib/menu-options";

export function CustomizeOrderItem({ name, description, priceCents, groups, initialChoices, initialNotes, onSave, onClose }: {
  name: string;
  description?: string | null;
  priceCents: number;
  groups: readonly MenuOptionGroup[];
  initialChoices?: MenuChoice[];
  initialNotes?: string;
  onSave: (choices: MenuChoice[], notes: string) => void;
  onClose: () => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState(() => (initialChoices ?? []).filter(choice =>
    groups.some(group => group.options.some(option => option.id === choice.productId))));
  const [notes, setNotes] = useState(initialNotes ?? "");
  useEffect(() => { dialog.current?.showModal(); }, []);

  function change(productId: number, qty: number) {
    setChoices(current => [...current.filter(choice => choice.productId !== productId), ...(qty > 0 ? [{ productId, qty }] : [])]);
  }

  return <dialog ref={dialog} aria-labelledby={title} onClose={onClose}
    className="m-auto w-[min(94vw,36rem)] max-h-[88dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] shadow-xl backdrop:bg-black/60">
    <form onSubmit={event => { event.preventDefault(); onSave(choices, notes.trim()); dialog.current?.close(); }} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id={title} className="text-xl font-bold">{name}</h2>
          {description && <p className="text-sm text-[var(--text-muted)]">{description}</p>}</div>
        <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>
      {groups.map(group => {
        const count = group.options.reduce((n, option) => n + (choices.find(choice => choice.productId === option.id)?.qty ?? 0), 0);
        return <fieldset key={group.slug} className="rounded-xl border border-[var(--border)] px-3 py-2">
          <legend className="px-1 font-semibold">{group.name}</legend>
          <p className="text-xs text-[var(--text-muted)]">Opcional · até {OPTION_GROUP_LIMIT} por unidade · {count} selecionado(s)</p>
          {group.options.map(option => {
            const qty = choices.find(choice => choice.productId === option.id)?.qty ?? 0;
            return <div key={option.id} className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-2 first:border-0">
              <span className="text-sm">{option.name} · {formatPrice(option.priceCents)}</span>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" aria-label={`Retirar ${option.name}`} disabled={!qty} onClick={() => change(option.id, qty - 1)} className="h-8 w-8 rounded-full border border-[var(--border)] disabled:opacity-40">−</button>
                <output aria-label={`Quantidade de ${option.name}`}>{qty}</output>
                <button type="button" aria-label={`Incluir ${option.name}`} disabled={count >= OPTION_GROUP_LIMIT} onClick={() => change(option.id, qty + 1)} className="h-8 w-8 rounded-full border border-[var(--border)] disabled:opacity-40">+</button>
              </div>
            </div>;
          })}
        </fieldset>;
      })}
      <label className="flex flex-col gap-1 text-sm font-semibold">Observação do item
        <textarea maxLength={160} rows={2} placeholder="Ex.: sem cebola" value={notes} onChange={event => setNotes(event.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2 font-normal" />
      </label>
      <button className="btn-brand sticky bottom-0 rounded-xl p-3 text-sm font-bold" type="submit">
        {initialNotes !== undefined ? "Salvar item" : "Adicionar ao pedido"} · {formatPrice(priceCents + menuOptionsTotal(choices, groups))} por unidade
      </button>
    </form>
  </dialog>;
}
