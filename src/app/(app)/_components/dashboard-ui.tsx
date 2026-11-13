// Khối giao diện riêng cho trang Tổng quan (style thẻ bo lớn, bóng mềm, icon tròn).
// Chỉ dùng ở src/app/(app)/page.tsx — các trang khác vẫn dùng Card/StatCard cũ.
import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { BellRing, CircleCheckBig, Maximize } from "lucide-react";
import { Avatar } from "@/components/ui";
import type { Tone } from "@/lib/labels";

/** Khung thẻ chung: bo 16px, không viền đậm, bóng mềm */
export const DASH_CARD = "rounded-2xl bg-white ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.22)]";

const DATE = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ───────── Lời chào ─────────

export function Greeting({ name, right }: { name: string; right?: ReactNode }) {
  const first = name.trim().split(/\s+/).at(-1) ?? name;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={name} size={48} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-slate-900">Xin chào, {first}</div>
          <div className="text-sm text-slate-500">{cap(DATE.format(new Date()))}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

// ───────── Banner cảnh báo ─────────

/** Chữ nhấn màu đỏ trong banner (tên người, số việc…) */
export function Hl({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-red-600">{children}</span>;
}

export function AlertBanner({ ok = false, title, children, href, cta = "Xem chi tiết" }: { ok?: boolean; title: string; children: ReactNode; href?: string; cta?: string }) {
  const Icon = ok ? CircleCheckBig : BellRing;
  return (
    <div role={ok ? "status" : "alert"} className={`${DASH_CARD} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5`}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-white ${ok ? "bg-emerald-600" : "bg-brand-900"}`}>
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <p className="mt-0.5 text-sm text-slate-600">{children}</p>
        </div>
      </div>
      {href && (
        <Link href={href} className="btn btn-primary shrink-0 self-end rounded-full px-5 sm:self-auto">
          {cta}
        </Link>
      )}
    </div>
  );
}

// ───────── Ô chỉ số ─────────

type StatTone = "blue" | "green" | "amber" | "red" | "gray";
const STAT_TONE: Record<StatTone, { icon: string; value: string }> = {
  blue: { icon: "border-slate-200 bg-white text-slate-700", value: "text-slate-900" },
  green: { icon: "border-emerald-200 bg-emerald-50 text-emerald-600", value: "text-slate-900" },
  amber: { icon: "border-amber-200 bg-amber-50 text-amber-600", value: "text-amber-700" },
  red: { icon: "border-red-200 bg-red-50 text-red-600", value: "text-red-600" },
  gray: { icon: "border-slate-200 bg-white text-slate-400", value: "text-slate-400" },
};

/** Chỉ hiện tên + số; chi tiết (sub) chỉ hiện khi rê chuột (title), bấm vào để xem trang chi tiết */
export function StatCard({ icon: Icon, label, value, sub, tone = "blue", href }: { icon: ElementType; label: string; value: string; sub?: string; tone?: StatTone; href: string }) {
  const t = STAT_TONE[tone];
  return (
    <Link href={href} title={sub} className={`${DASH_CARD} group block min-w-0 p-4 no-underline transition hover:no-underline hover:shadow-md sm:p-5`}>
      <span className="flex items-start justify-between gap-2">
        <span className="truncate text-sm text-slate-500" title={label}>
          {label}
        </span>
        <Maximize size={15} className="mt-0.5 shrink-0 text-slate-400 transition group-hover:text-brand-600" aria-hidden />
      </span>
      <span className="mt-3 flex items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${t.icon}`}>
          <Icon size={17} aria-hidden />
        </span>
        <span className={`truncate text-2xl font-semibold tabular-nums ${t.value}`}>{value}</span>
      </span>
    </Link>
  );
}

// ───────── Thẻ nội dung: icon tròn + tiêu đề + mô tả + nút tròn ─────────

export function DashCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  icon?: ElementType;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${DASH_CARD} flex min-w-0 flex-col ${className}`}>
      <header className="flex items-start gap-3 px-5 pt-5">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
            <Icon size={18} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {/* Nội dung giãn theo chiều cao thẻ (người dùng kéo to/nhỏ); không bao giờ thấp hơn nội dung */}
      <div className="flex min-h-0 flex-1 flex-col p-5 [&>*]:flex-1">{children}</div>
    </section>
  );
}

/** Nút viên thuốc (vd "Xem chi tiết") */
export function PillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 no-underline shadow-sm transition hover:border-slate-300 hover:no-underline">
      {children}
    </Link>
  );
}

/** Nút tròn chỉ có icon */
export function CircleLink({ href, icon: Icon, label }: { href: string; icon: ElementType; label: string }) {
  return (
    <Link href={href} title={label} aria-label={label} className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-brand-600">
      <Icon size={16} aria-hidden />
    </Link>
  );
}

// ───────── Danh sách nhiệm vụ đang chạy: mỗi dòng 1 việc — tên · người làm · hạn; bấm để mở ─────────

export type OngoingTask = {
  id: string;
  title: string;
  assignee: string;
  /** Nhãn hạn ngắn, không xuống dòng: "Trễ 7 ngày", "Hạn 14/11", "Không hạn" */
  due: { label: string; tone: Tone };
};

const MARK = ["bg-brand-900 text-white", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700"];
const DUE_CHIP: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
  violet: "bg-violet-50 text-violet-700",
};

export function OngoingTasks({ rows, emptyText }: { rows: OngoingTask[]; emptyText: string }) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>;
  // [contain:size]: danh sách không tự kéo thẻ cao lên — thẻ cao bao nhiêu thì hiện bấy nhiêu dòng, còn lại cuộn
  return (
    <ul className="-mx-2 flex min-h-44 flex-col gap-1 overflow-y-auto [contain:size]">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link href={`/tasks/${r.id}`} title={r.title} className="flex items-center gap-3 rounded-xl px-2 py-2.5 no-underline transition hover:bg-slate-50 hover:no-underline">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${MARK[i % MARK.length]}`}>{r.title.trim().charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
              <span className="block truncate text-xs text-slate-500">{r.assignee}</span>
            </span>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${DUE_CHIP[r.due.tone]}`}>{r.due.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
