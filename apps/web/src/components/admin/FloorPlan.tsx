"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import {
  canPlaceTable, FLOOR_COLUMNS, FLOOR_ROWS, lockedAreaFor, MAX_FLOOR_ELEMENTS, MAX_TABLE_NUMBER,
  type FloorElement, type FloorPlan as Plan, type FloorRect,
} from "@/lib/floor-plan";
import styles from "./FloorPlan.module.css";

export type FloorTableRecord = { id: number; number: number; label: string | null; token: string };
type Draft = Plan & { unlockedAreaIds: string[] };
type Drag = {
  id: string;
  pointer: number;
  element: FloorElement;
  clientX: number;
  clientY: number;
  cellWidth: number;
  cellHeight: number;
};

type Props = {
  plan: Plan;
  tables: FloorTableRecord[];
  orderCounts: Map<number | null, number>;
  canManage: boolean;
  onPlan: (plan: Plan, table?: FloorTableRecord) => void;
  refresh: () => Promise<void>;
};

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(value, max));
}

function position(rect: FloorRect): CSSProperties {
  return {
    left: `${100 * rect.x / FLOOR_COLUMNS}%`,
    top: `${100 * rect.y / FLOOR_ROWS}%`,
    width: `${100 * rect.width / FLOOR_COLUMNS}%`,
    height: `${100 * rect.height / FLOOR_ROWS}%`,
  };
}

export default function FloorPlan({ plan, tables, orderCounts, canManage, onPlan, refresh }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [number, setNumber] = useState("");
  const [numberRevision, setNumberRevision] = useState(0);
  const [existingId, setExistingId] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const elements = draft?.elements ?? plan.elements;
  const selected = elements.find(element => element.id === selectedId);
  const byId = new Map(tables.map(table => [table.id, table]));
  const assigned = new Set(elements.flatMap(element => element.kind === "table" ? [element.tableId] : []));
  const available = tables.filter(table => !assigned.has(table.id));

  function label(element: FloorElement) {
    if (element.kind === "area") return element.name || "Área";
    const table = element.tableId === null ? undefined : byId.get(element.tableId);
    if (table) return `Mesa ${table.number}`;
    if (element.tableId !== null) return "Mesa indisponível";
    return element.reference || "Mesa sem número";
  }

  function select(element: FloorElement) {
    setSelectedId(element.id);
    if (!draft && element.kind === "table") {
      setFeedback(null);
      const table = element.tableId === null ? undefined : byId.get(element.tableId);
      setNumber(table ? String(table.number) : "");
      setNumberRevision(plan.revision);
    }
  }

  function replace(element: FloorElement) {
    setDraft(current => current && { ...current, elements: current.elements.map(item => item.id === element.id ? element : item) });
  }

  function frozen(element: FloorElement) {
    return element.kind === "area" ? element.locked : Boolean(lockedAreaFor(element, elements));
  }

  function updateRect(element: FloorElement, patch: Partial<FloorRect>) {
    const updated = { ...element, ...patch };
    updated.x = clamp(updated.x, FLOOR_COLUMNS - updated.width);
    updated.y = clamp(updated.y, FLOOR_ROWS - updated.height);
    if (updated.kind === "table" && !canPlaceTable(updated, elements)) {
      setFeedback({ text: "Escolha um espaço livre, fora das áreas bloqueadas.", error: true });
      return;
    }
    setFeedback(null);
    replace(updated);
  }

  function add(kind: FloorElement["kind"], tableId: number | null = null) {
    if (!draft || elements.length >= MAX_FLOOR_ELEMENTS) return;
    const id = crypto.randomUUID();
    const areaCount = elements.filter(element => element.kind === "area").length;
    let element: FloorElement = { id, kind: "area", name: `Área ${areaCount + 1}`, locked: false, x: areaCount % 10, y: areaCount % 8, width: 12, height: 8 };
    if (kind === "table") {
      const table = { id, kind, tableId, x: 0, y: 0, width: 4, height: 3 };
      const spaces = Array.from({ length: (FLOOR_COLUMNS - table.width + 1) * (FLOOR_ROWS - table.height + 1) }, (_, index) => ({
        ...table, x: index % (FLOOR_COLUMNS - table.width + 1), y: Math.floor(index / (FLOOR_COLUMNS - table.width + 1)),
      }));
      const area = selected?.kind === "area" ? selected : null;
      const fits = (space: FloorRect) => !area || (
        space.x >= area.x && space.y >= area.y &&
        space.x + space.width <= area.x + area.width && space.y + space.height <= area.y + area.height
      );
      const free = spaces.find(space => area && space.x > area.x && space.y >= area.y + 2 && fits(space) && canPlaceTable(space, elements))
        ?? spaces.find(space => fits(space) && canPlaceTable(space, elements));
      if (!free) {
        setFeedback({ text: area ? "Não há espaço livre para outra mesa na área selecionada." : "Não há espaço livre para outra mesa na planta.", error: true });
        return;
      }
      element = free;
    }
    setDraft({ ...draft, elements: [...elements, element] });
    setSelectedId(id);
    setFeedback(null);
    setExistingId("");
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, element: FloorElement) {
    if (!draft || pending || event.button !== 0 || !event.isPrimary || !stage.current || drag.current) return;
    select(element);
    if (frozen(element)) return;
    const bounds = stage.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: element.id, pointer: event.pointerId, element, clientX: event.clientX, clientY: event.clientY,
      cellWidth: bounds.width / FLOOR_COLUMNS, cellHeight: bounds.height / FLOOR_ROWS,
    };
  }

  function move(event: PointerEvent<HTMLButtonElement>, id: string) {
    const current = drag.current;
    if (!current || current.id !== id || current.pointer !== event.pointerId) return;
    updateRect(current.element, {
      x: current.element.x + Math.round((event.clientX - current.clientX) / current.cellWidth),
      y: current.element.y + Math.round((event.clientY - current.clientY) / current.cellHeight),
    });
  }

  function stopDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  }

  async function save(method: "PUT" | "POST", payload: object) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/waiter", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(typeof result.error === "string" ? result.error : "Não foi possível salvar. Tente novamente.");
      }
      if (method === "PUT") {
        onPlan(result);
        setDraft(null);
      } else {
        onPlan(result.plan, result.table);
      }
      setSelectedId("");
      setFeedback({ text: method === "PUT" ? "Planta do salão salva." : `Mesa ${result.table.number} atualizada.` });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Não foi possível salvar. Confira a conexão.", error: true });
    } finally {
      setPending(false);
    }
  }

  const stale = draft !== null && draft.revision !== plan.revision;
  const staleNumber = numberRevision !== plan.revision;
  const limitReached = elements.length >= MAX_FLOOR_ELEMENTS;

  return <section className={styles.panel} aria-labelledby="floor-plan-title">
    <header className={styles.header}>
      <div>
        <h2 id="floor-plan-title">Planta do salão</h2>
        <p>{draft ? "Selecione uma área para incluir mesas nela. Arraste os elementos ou ajuste suas medidas no painel." : canManage ? "Selecione uma mesa na planta para atribuir ou alterar o número." : "Consulte a disposição das mesas e áreas."}</p>
      </div>
      {canManage && !draft && <button className={styles.action} disabled={pending} onClick={() => {
        setDraft({ ...plan, unlockedAreaIds: [] }); setSelectedId(""); setFeedback(null); setExistingId("");
      }}><AdminIcon name="settings" /> Editar salão</button>}
      {draft && <div className={styles.actions}>
        <button disabled={pending} onClick={() => { setDraft(null); setSelectedId(""); setFeedback(null); }}>Cancelar edição</button>
        <button className={styles.action} disabled={pending || stale || !canManage} onClick={() => void save("PUT", draft)}>{pending ? "Salvando…" : "Salvar planta"}</button>
      </div>}
    </header>

    {draft && <div className={styles.toolbar}>
      <button disabled={pending || limitReached} onClick={() => add("area")}><AdminIcon name="plus" /> Adicionar área</button>
      <button disabled={pending || limitReached} onClick={() => add("table")}><AdminIcon name="plus" /> Adicionar mesa</button>
      {available.length > 0 && <div className={styles.actions}>
        <select aria-label="Mesa cadastrada" value={existingId} disabled={pending || limitReached} onChange={event => setExistingId(event.target.value)}>
          <option value="">Mesa cadastrada…</option>
          {available.map(table => <option key={table.id} value={table.id}>Mesa {table.number}{table.label ? ` · ${table.label}` : ""}</option>)}
        </select>
        <button disabled={pending || limitReached || !existingId} onClick={() => add("table", Number(existingId))}>Incluir na planta</button>
      </div>}
    </div>}

    <div className={styles.viewport} tabIndex={0} role="region" aria-label="Mapa do salão">
      <div className={styles.stage} ref={stage}>
        {elements.length === 0 && <p className={styles.empty}>{draft ? "Adicione uma área ou mesa para começar." : "A planta ainda está vazia."}</p>}
        {elements.map(element => {
          const chosen = selectedId === element.id;
          const name = label(element);
          if (element.kind === "area" && !draft) return <div key={element.id} className={styles.area} data-locked={element.locked} style={position(element)}>
            <span>{name}{element.locked && <small>Área bloqueada</small>}</span>
          </div>;
          const count = element.kind === "table" ? orderCounts.get(element.tableId) ?? 0 : 0;
          const disabled = pending || (!draft && !canManage);
          const reference = element.kind === "table" ? element.reference : undefined;
          return <button type="button" key={element.id} style={position(element)}
            className={element.kind === "area" ? styles.area : styles.table}
            aria-label={element.kind === "area" && element.locked ? `${name}, área bloqueada` : name}
            aria-pressed={disabled ? undefined : chosen} disabled={disabled} title={reference}
            data-locked={element.kind === "area" && element.locked} data-draggable={Boolean(draft) && !frozen(element)}
            onPointerDown={event => startDrag(event, element)} onPointerMove={event => move(event, element.id)}
            onLostPointerCapture={stopDrag} onClick={() => select(element)}>
            <span>{name}{element.kind === "area" && element.locked && <small>Área bloqueada</small>}</span>
            {!draft && element.kind === "table" && (count > 0 && element.tableId !== null
              ? <small>{count} {count === 1 ? "pedido" : "pedidos"}</small>
              : reference && <small>{element.tableId === null ? "Sem número" : reference}</small>)}
          </button>;
        })}
      </div>
    </div>

    {draft && elements.length > 0 && <fieldset className={styles.inspector} disabled={pending}>
      <legend>Editar elemento</legend>
      <label>Elemento
        <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setFeedback(null); }}>
          <option value="">Selecione na planta</option>
          {elements.map(element => <option key={element.id} value={element.id}>{label(element)} · {element.x + 1}, {element.y + 1}</option>)}
        </select>
      </label>
      {selected && <>
        {selected.kind === "area" && <label>Nome da área<input maxLength={60} value={selected.name} disabled={selected.locked}
          onChange={event => replace({ ...selected, name: event.target.value })} /></label>}
        {selected.kind === "table" && <label>Referência da mesa<input maxLength={60} value={selected.reference ?? ""} disabled={frozen(selected)}
          onChange={event => replace({ ...selected, reference: event.target.value })} /></label>}
        <div className={styles.dimensions}>
          {([
            ["x", "Coluna", 1, FLOOR_COLUMNS - selected.width + 1],
            ["y", "Linha", 1, FLOOR_ROWS - selected.height + 1],
            ["width", "Largura", 1, FLOOR_COLUMNS],
            ["height", "Altura", 1, FLOOR_ROWS],
          ] as const).map(([key, title, min, max]) => {
            const offset = key === "x" || key === "y" ? 1 : 0;
            return <label key={key}>{title}
              <input type="number" min={min} max={max} value={selected[key] + offset} disabled={frozen(selected)}
                onChange={event => {
                  const value = event.target.valueAsNumber;
                  if (Number.isInteger(value) && value >= min && value <= max) updateRect(selected, { [key]: value - offset });
                }} />
            </label>;
          })}
        </div>
        {selected.kind === "area" && <button onClick={() => {
          const unlockedAreaIds = selected.locked && plan.elements.some(item => item.id === selected.id && item.kind === "area" && item.locked)
            ? [...new Set([...draft.unlockedAreaIds, selected.id])]
            : draft.unlockedAreaIds;
          setDraft({
            ...draft, unlockedAreaIds,
            elements: elements.map(item => item.id === selected.id ? { ...selected, locked: !selected.locked } : item),
          });
          setFeedback(null);
        }}>
          {selected.locked ? "Desbloquear área" : "Bloquear área"}
        </button>}
        {selected.kind === "table" && frozen(selected) && <p>Desbloqueie a área para mover esta mesa.</p>}
        <button className={styles.remove} disabled={frozen(selected)} onClick={() => {
          setDraft({ ...draft, elements: elements.filter(element => element.id !== selected.id) });
          setSelectedId(""); setFeedback(null);
        }}>Retirar da planta</button>
      </>}
    </fieldset>}

    {!draft && canManage && selected?.kind === "table" && <form className={styles.numberForm} onSubmit={event => {
      event.preventDefault();
      if (!staleNumber) void save("POST", { revision: numberRevision, elementId: selected.id, number: Number(number) });
    }}>
      <label htmlFor="floor-table-number">Número da mesa</label>
      <input id="floor-table-number" type="number" min={1} max={MAX_TABLE_NUMBER} required value={number}
        disabled={pending} onChange={event => setNumber(event.target.value)} />
      <button type="submit" className={styles.action} disabled={pending || staleNumber}>{pending ? "Salvando…" : "Salvar número"}</button>
      <button type="button" disabled={pending} onClick={() => { setSelectedId(""); setFeedback(null); }}>Cancelar</button>
      {staleNumber && <p role="alert" className={styles.feedback}>A planta mudou. Selecione a mesa novamente para conferir a numeração.</p>}
    </form>}

    {stale && <p className={styles.feedback} role="alert">A planta mudou em outro dispositivo. Cancele a edição e abra a planta atualizada.</p>}
    {feedback && <p className={styles.feedback} data-error={Boolean(feedback.error)} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
  </section>;
}
