/** Only explicit, first-person availability declarations may change dispatch. */
export function declaresCourierAvailability(message: string): boolean {
  if (message.includes("?")) return false;
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/^[*!_.]+|[*!_.]+$/g, "").replace(/\s+/g, " ").trim();
  return /^(?:(?:ja )?(?:estou|to|tou|fico) )?disponivel(?: (?:agora|hoje))?(?: (?:para|pra) (?:entregas?|entregar|pegar entregas?))?(?: (?:agora|hoje))?$/.test(normalized)
    || /^(?:(?:ja )?posso|pode me mandar|pode mandar) (?:pegar )?entregas?(?: (?:agora|hoje))?$/.test(normalized)
    || /^(?:(?:ja )?(?:estou|to|tou) )?livre (?:para|pra) (?:entregar|pegar entregas?)(?: agora)?$/.test(normalized)
    || /^me marc(?:a|e) (?:como )?disponivel$/.test(normalized);
}
