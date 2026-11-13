// Bố cục trang Tổng quan: thứ tự + kích thước (rộng w / cao h) của từng thẻ, lưu theo tài khoản (User.dashboardLayout).
// Lưới 12 cột; chiều cao tính theo "hàng lưới" (ROW_PX, cách nhau GAP_PX). Thẻ không bao giờ thấp hơn nội dung của nó.
// Dùng chung cho server (đọc/kiểm tra dữ liệu đã lưu) và client (lưới kéo thả).

export type DashView = "company" | "team" | "personal";
export type LayoutItem = { id: string; w: number; h: number };

export const DASH_VIEWS: DashView[] = ["company", "team", "personal"];
export const COLS = 12;
export const ROW_PX = 40;
export const GAP_PX = 20;
export const MIN_W = 3;
export const MAX_H = 24;
export const MIN_H = 3;

const MANAGER: LayoutItem[] = [
  { id: "tasks", w: 4, h: 6 },
  { id: "kpiTrend", w: 8, h: 6 },
  { id: "kpiPlans", w: 4, h: 6 },
  { id: "staffMix", w: 4, h: 6 },
  { id: "review", w: 4, h: 6 },
  { id: "kpiByUnit", w: 4, h: 6 },
  { id: "tasksWeekly", w: 8, h: 6 },
];

/** Bố cục mặc định — mỗi hàng đủ 12 cột, các thẻ cùng hàng cao bằng nhau */
export const DEFAULT_LAYOUT: Record<DashView, LayoutItem[]> = {
  company: MANAGER,
  team: MANAGER,
  personal: [
    { id: "myTasks", w: 4, h: 6 },
    { id: "myKpi", w: 8, h: 6 },
    { id: "myTaskStatus", w: 4, h: 6 },
    { id: "kpiLatest", w: 8, h: 6 },
  ],
};

const clampInt = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null);

/**
 * Làm sạch bố cục (đã lưu hoặc client gửi lên): chỉ giữ thẻ có thật của view, bỏ trùng, kích thước trong giới hạn;
 * nhận cả dạng cũ { id, span: 1|2|3 } (span × 4 cột); thẻ mới thêm sau này được nối vào cuối với kích thước mặc định.
 */
export function resolveLayout(view: DashView, saved: unknown): LayoutItem[] {
  const defaults = DEFAULT_LAYOUT[view];
  if (!Array.isArray(saved)) return defaults;
  const byId = new Map(defaults.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const it of saved) {
    if (!it || typeof it !== "object") continue;
    const { id, w, h, span } = it as { id?: unknown; w?: unknown; h?: unknown; span?: unknown };
    if (typeof id !== "string" || !byId.has(id) || seen.has(id)) continue;
    const def = byId.get(id)!;
    const width = clampInt(w, MIN_W, COLS) ?? (span === 1 || span === 2 || span === 3 ? span * 4 : def.w);
    const height = clampInt(h, MIN_H, MAX_H) ?? def.h;
    seen.add(id);
    out.push({ id, w: width, h: height });
  }
  for (const d of defaults) if (!seen.has(d.id)) out.push(d);
  return out;
}

export function sameLayout(a: LayoutItem[], b: LayoutItem[]) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.w === b[i].w && x.h === b[i].h);
}
