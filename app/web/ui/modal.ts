// Centered modal for full history entries.
import { el, esc } from "./util";

let host: HTMLElement | null = null;
export function setModalHost(h: HTMLElement) { host = h; }

export function openModal(title: string, bodyHtml: string) {
  document.querySelector(".modal")?.remove();
  const prev = document.activeElement as HTMLElement | null;
  const m = el("div", "modal", `<div class="modal-card glass" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="btn ghost x" aria-label="Close">✕</button></header><div class="modal-body">${bodyHtml}</div></div>`);
  const close = () => { m.remove(); window.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
  m.addEventListener("click", (e) => { if (e.target === m || (e.target as HTMLElement).closest(".x")) close(); });
  window.addEventListener("keydown", onKey, true);
  (host ?? document.body).appendChild(m);
  m.querySelector<HTMLElement>(".x")?.focus();
}
