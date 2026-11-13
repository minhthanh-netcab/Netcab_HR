// Stepper 4 bước: Chưa bắt đầu → Đang làm → Chờ xác nhận → Hoàn thành, trải hết chiều ngang.
// Bước đã qua: tròn đặc + dấu tick; bước hiện tại: viền màu nhấn + số; bước sau: viền xám + số.
// Dưới mỗi bước là tên + mốc ngày (giao / bắt đầu / báo cáo / hạn hoặc ngày xong).
// Bị trả lại: bước "Chờ xác nhận" chuyển màu cảnh báo, ghi ngày trả lại.
import type { TaskStatus } from "@prisma/client";
import { Check, CornerUpLeft } from "lucide-react";
import { fmtDate } from "@/lib/dates";

const STEPS: { key: TaskStatus; label: string }[] = [
  { key: "TODO", label: "Chưa bắt đầu" },
  { key: "IN_PROGRESS", label: "Đang làm" },
  { key: "REVIEW", label: "Chờ xác nhận" },
  { key: "DONE", label: "Hoàn thành" },
];

export type ProgressDates = {
  assignedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  returnedAt: Date | null;
  completedAt: Date | null;
  dueDate: Date | null;
};

/** dd/mm theo giờ Việt Nam (mốc thời gian) */
const DM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
const dm = (d: Date) => DM.format(d);
/** dd/mm cho cột @db.Date (lưu UTC 00:00) */
const dmDate = (d: Date) => fmtDate(d).slice(0, 5);

/**
 * Số bước vẽ bằng SVG: căn giữa theo chiều cao chữ số (dy 0.35em ≈ nửa cap-height),
 * không phụ thuộc ascent/descent của font (Segoe UI làm số lệch khi căn bằng flex + line-height).
 */
function StepNumber({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 24 24" className="block size-full">
      <text x="12" y="12" dy="0.35em" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="600">
        {n}
      </text>
    </svg>
  );
}

export function TaskProgress({ status, returned, dates }: { status: TaskStatus; returned: boolean; dates: ProgressDates }) {
  if (status === "CANCELLED")
    return (
      <div className="card mb-6 px-5 py-4 text-sm font-medium text-slate-500 sm:px-6">Nhiệm vụ đã hủy</div>
    );

  const idx = STEPS.findIndex((s) => s.key === status);
  const allDone = status === "DONE";

  const sub = (i: number): string | null => {
    switch (STEPS[i].key) {
      case "TODO":
        return `Giao ${dm(dates.assignedAt)}`;
      case "IN_PROGRESS":
        return i <= idx && dates.startedAt ? `từ ${dm(dates.startedAt)}` : null;
      case "REVIEW":
        if (returned && dates.returnedAt) return `Trả lại ${dm(dates.returnedAt)}`;
        return i <= idx && dates.submittedAt ? `Báo cáo ${dm(dates.submittedAt)}` : null;
      case "DONE":
        if (allDone && dates.completedAt) return `Xong ${dm(dates.completedAt)}`;
        return dates.dueDate ? `Hạn ${dmDate(dates.dueDate)}` : null;
      default:
        return null;
    }
  };

  return (
    <div className="card mb-6 px-4 py-3.5 sm:px-6 sm:py-4">
      <ol className="flex" aria-label={`Tiến trình: bước ${idx + 1}/4`}>
        {STEPS.map((s, i) => {
          const last = i === STEPS.length - 1;
          const warn = returned && s.key === "REVIEW";
          const done = allDone || i < idx;
          const current = !allDone && i === idx;

          const circle = warn
            ? "border-red-500 bg-red-50 text-red-600"
            : done
              ? allDone
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-brand-600 bg-brand-600 text-white"
              : current
                ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100"
                : "border-slate-300 bg-white text-slate-400";
          const line = i < idx || allDone ? (allDone ? "bg-emerald-500" : "bg-brand-600") : "bg-slate-200";
          const title = warn
            ? "font-semibold text-red-700"
            : current
              ? "font-semibold text-brand-700"
              : done
                ? allDone && last
                  ? "font-semibold text-emerald-700"
                  : "font-semibold text-slate-800"
                : "font-medium text-slate-400";
          const note = sub(i);

          return (
            <li key={s.key} aria-current={current ? "step" : undefined} className={last ? "shrink-0" : "min-w-0 flex-1"}>
              <div className="flex items-center">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-semibold sm:size-7 ${circle}`}>
                  {warn ? <CornerUpLeft className="size-3 sm:size-3.5" strokeWidth={2.5} aria-hidden /> : done ? <Check className="size-3 sm:size-3.5" strokeWidth={3} aria-hidden /> : <StepNumber n={i + 1} />}
                </span>
                {!last && <span className={`mx-1.5 h-0.5 flex-1 rounded-full sm:mx-2 ${line}`} aria-hidden />}
              </div>
              <div className="mt-1.5 pr-1.5 sm:mt-2 sm:pr-3">
                <div className={`text-[11px] leading-tight sm:text-sm ${title}`}>{warn ? "Bị trả lại" : s.label}</div>
                {note && <div className={`mt-0.5 text-[10px] leading-tight sm:text-xs ${warn ? "text-red-600" : "text-slate-500"}`}>{note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
