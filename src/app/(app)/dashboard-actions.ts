"use server";
// Lưu bố cục trang Tổng quan của chính người đang đăng nhập (không ảnh hưởng người khác).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { DASH_VIEWS, resolveLayout, sameLayout, DEFAULT_LAYOUT, type DashView } from "./_components/dashboard-layout";

/** items = null → khôi phục bố cục mặc định cho view đó */
export async function saveDashboardLayout(view: DashView, items: unknown) {
  const user = await requireUser();
  if (!DASH_VIEWS.includes(view)) return;
  const current = user.dashboardLayout && typeof user.dashboardLayout === "object" && !Array.isArray(user.dashboardLayout) ? { ...(user.dashboardLayout as Record<string, unknown>) } : {};
  const clean = items === null ? null : resolveLayout(view, items);
  if (!clean || sameLayout(clean, DEFAULT_LAYOUT[view])) delete current[view];
  else current[view] = clean;
  await db.user.update({ where: { id: user.id }, data: { dashboardLayout: current as Prisma.InputJsonObject } });
}
