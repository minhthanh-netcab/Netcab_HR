"use client";
// Lưới thẻ trang Tổng quan, tùy chỉnh được (màn hình ≥ 1024px):
// - Đổi chỗ: kéo tay nắm ⋮⋮ vắt trên mép trên mỗi thẻ, thả lên thẻ khác → chèn vào vị trí đó
// - Đổi kích thước: kéo góc dưới phải ◢ — rộng theo lưới 12 cột, cao theo hàng lưới 40px.
//   Thẻ không bao giờ thấp hơn nội dung (hàng lưới tự giãn), nên không có chữ/biểu đồ bị cắt.
// - Bàn phím: Tab tới tay nắm → mũi tên dời thẻ; Tab tới góc ◢ → ←/→ đổi rộng, ↑/↓ đổi cao
// - Tự lưu theo tài khoản; "Khôi phục bố cục mặc định" hiện khi đã thay đổi
// Màn hình nhỏ: 1 cột theo thứ tự đã sắp, ẩn tay nắm / góc kéo.
import { useRef, useState, useTransition, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripHorizontal, RotateCcw } from "lucide-react";
import { saveDashboardLayout } from "../dashboard-actions";
import { COLS, DEFAULT_LAYOUT, GAP_PX, MAX_H, MIN_H, MIN_W, ROW_PX, sameLayout, type DashView, type LayoutItem } from "./dashboard-layout";

export type GridCard = { id: string; title: string; node: ReactNode };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function DashboardGrid({ view, cards, initial }: { view: DashView; cards: GridCard[]; initial: LayoutItem[] }) {
  const [layout, setLayout] = useState(initial);
  const latest = useRef(initial);
  const grid = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number; colPx: number } | null>(null);
  const [, startSave] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const byId = new Map(cards.map((c) => [c.id, c]));

  const update = (next: LayoutItem[]) => {
    latest.current = next;
    setLayout(next);
  };
  // Lưu lỗi (mất mạng, server lỗi…) không làm hỏng trang: giữ bố cục trên màn hình, chỉ báo "chưa lưu được"
  const save = (next: LayoutItem[] | null) =>
    startSave(async () => {
      try {
        await saveDashboardLayout(view, next);
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    });

  /** Đưa thẻ `from` vào vị trí hiện tại của thẻ `to` */
  const moveTo = (from: string, to: string) => {
    const cur = latest.current;
    const a = cur.findIndex((x) => x.id === from);
    const b = cur.findIndex((x) => x.id === to);
    if (a < 0 || b < 0 || a === b) return;
    const next = [...cur];
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item);
    update(next);
  };

  const resizeTo = (id: string, w: number, h: number) => {
    const cur = latest.current;
    const it = cur.find((x) => x.id === id);
    const nw = clamp(w, MIN_W, COLS);
    const nh = clamp(h, MIN_H, MAX_H);
    if (!it || (it.w === nw && it.h === nh)) return;
    update(cur.map((x) => (x.id === id ? { ...x, w: nw, h: nh } : x)));
  };

  // ── Kéo góc ◢ để đổi kích thước (bắt theo lưới) ──
  const onResizeDown = (e: PointerEvent<HTMLButtonElement>, item: LayoutItem) => {
    const g = grid.current;
    if (!g) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const colPx = (g.clientWidth - GAP_PX * (COLS - 1)) / COLS;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: item.w, h: item.h, colPx };
    setResizing(item.id);
  };
  const onResizeMove = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    const s = resizeStart.current;
    if (!s || resizing !== id) return;
    const dw = Math.round((e.clientX - s.x) / (s.colPx + GAP_PX));
    const dh = Math.round((e.clientY - s.y) / (ROW_PX + GAP_PX));
    resizeTo(id, s.w + dw, s.h + dh);
  };
  const onResizeUp = () => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    setResizing(null);
    save(latest.current);
  };
  const onResizeKey = (e: KeyboardEvent, item: LayoutItem) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    resizeTo(item.id, item.w + d[0], item.h + d[1]);
    save(latest.current);
  };

  // ── Bàn phím cho tay nắm đổi chỗ ──
  const onMoveKey = (e: KeyboardEvent, id: string) => {
    const i = latest.current.findIndex((x) => x.id === id);
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    const j = i + step;
    if (!step || j < 0 || j >= latest.current.length) return;
    e.preventDefault();
    moveTo(id, latest.current[j].id);
    save(latest.current);
  };

  const changed = !sameLayout(layout, DEFAULT_LAYOUT[view]);

  return (
    <div className="flex flex-col gap-3">
      {(changed || saveFailed) && (
        <div className="hidden items-center justify-end gap-3 lg:flex">
          {saveFailed && <span className="text-xs text-red-600">Chưa lưu được bố cục, thử lại sau</span>}
          {changed && (
            <button
              type="button"
              onClick={() => {
                update(DEFAULT_LAYOUT[view]);
                save(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-brand-700"
            >
              <RotateCcw size={13} aria-hidden /> Khôi phục bố cục mặc định
            </button>
          )}
        </div>
      )}
      <div
        ref={grid}
        className={`grid grid-cols-1 gap-5 lg:grid-flow-row-dense lg:grid-cols-12 lg:auto-rows-[minmax(40px,auto)] ${resizing ? "select-none" : ""}`}
      >
        {layout.map((item) => {
          const card = byId.get(item.id);
          if (!card) return null;
          const active = dragId === item.id || resizing === item.id;
          return (
            <div
              key={item.id}
              style={{ "--w": item.w, "--h": item.h } as CSSProperties}
              className={`group/cell relative grid min-w-0 transition-opacity lg:[grid-column:span_var(--w)/span_var(--w)] lg:[grid-row:span_var(--h)/span_var(--h)] ${dragId === item.id ? "opacity-40" : ""} ${
                active ? "rounded-2xl ring-2 ring-brand-500/40" : ""
              }`}
              draggable={armed === item.id}
              onDragStart={(e) => {
                setDragId(item.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragId !== item.id) moveTo(dragId, item.id);
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragId(null);
                setArmed(null);
                save(latest.current);
              }}
            >
              {card.node}

              {/* Tay nắm đổi chỗ: vắt trên mép trên, góc phải (không đè nội dung) */}
              <button
                type="button"
                aria-label={`Đổi chỗ thẻ ${card.title}: kéo thả, hoặc dùng phím mũi tên`}
                title="Kéo để đổi chỗ"
                className="absolute right-6 top-0 z-10 hidden h-6 w-8 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-700 active:cursor-grabbing lg:flex"
                onPointerDown={() => setArmed(item.id)}
                onPointerUp={() => !dragId && setArmed(null)}
                onKeyDown={(e) => onMoveKey(e, item.id)}
              >
                <GripHorizontal size={15} aria-hidden />
              </button>

              {/* Góc đổi kích thước: hiện khi rê chuột vào thẻ / đang kéo / Tab tới */}
              <button
                type="button"
                aria-label={`Đổi kích thước thẻ ${card.title}: kéo góc, hoặc mũi tên trái/phải đổi rộng, lên/xuống đổi cao`}
                title="Kéo để đổi kích thước"
                className={`absolute bottom-1.5 right-1.5 z-10 hidden size-6 cursor-nwse-resize touch-none items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:opacity-100 lg:flex ${
                  resizing === item.id ? "bg-slate-100 text-brand-600 opacity-100" : "opacity-0 group-hover/cell:opacity-100"
                }`}
                onPointerDown={(e) => onResizeDown(e, item)}
                onPointerMove={(e) => onResizeMove(e, item.id)}
                onPointerUp={onResizeUp}
                onPointerCancel={onResizeUp}
                onKeyDown={(e) => onResizeKey(e, item)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M11 3 3 11M11 7 7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>

              {/* Nhãn kích thước khi đang kéo */}
              {resizing === item.id && (
                <span className="pointer-events-none absolute bottom-2 right-9 z-10 rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                  {item.w}/{COLS} cột · cao {item.h}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
