import { redirect } from "next/navigation";
import { ArrowUpRight, ChartColumn, ChartPie, ClipboardCheck, ListChecks, ListTodo, Target, TrendingUp, Users } from "lucide-react";
import type { EmployeeType, Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { companyScope, companyView, isAdmin, isHRM, isManager, requireEmployeeUser, teamScope } from "@/lib/server/access";
import { getCurrentUser, type CurrentUser } from "@/lib/server/auth";
import { getSummary, loadUnits, lockedPlanIds, parseYq } from "@/lib/server/department-flow";
import { missingAttendanceMonths, monthLabel as attMonthLabel } from "@/lib/server/attendance";
import { ViewToggle } from "@/components/flow-ui";
import { today } from "@/lib/dates";
import { inQuarter, kpiGrade, periodLabel, provisionalKpi } from "@/lib/kpi";
import { employeeTypeLabel, taskStatusLabel } from "@/lib/labels";
import { GRADE_INFO } from "@/lib/review-templates";
import { OPEN_TASK } from "@/lib/server/tasks";
import { dueChip } from "@/lib/task-view";
import { Flash } from "@/components/ui";
import { ColumnChart, Donut, Gauge, HBarChart, LineChart, ProgressRing, SoftBarChart, type Segment } from "@/components/dashboard-charts";
import { AutoRefresh } from "@/components/live-refresh";
import { AlertBanner, CircleLink, DashCard, Greeting, Hl, OngoingTasks, PillLink, StatCard, type OngoingTask } from "./_components/dashboard-ui";
import { DashboardGrid } from "./_components/dashboard-grid";
import { resolveLayout, type DashView } from "./_components/dashboard-layout";

/** Bố cục đã lưu của người dùng cho 1 view (chưa kiểm tra — resolveLayout sẽ làm sạch) */
const savedLayout = (user: CurrentUser, view: DashView): unknown => {
  const all = user.dashboardLayout;
  return all && typeof all === "object" && !Array.isArray(all) ? (all as Record<string, unknown>)[view] : undefined;
};

/** KPI dưới mức này = dưới "Hoàn thành" */
const KPI_OK = 0.8;
const DAY = 86_400_000;
/** Số nhiệm vụ nạp cho thẻ "Nhiệm vụ đang chạy" (thẻ cao bao nhiêu hiện bấy nhiêu, còn lại cuộn) */
const ONGOING = 10;

/** Màu theo vai trò của dữ liệu (token trong globals.css) */
const C = {
  s1: "var(--viz-1)",
  s2: "var(--viz-2)",
  s3: "var(--viz-3)",
  s4: "var(--viz-4)",
  neutral: "var(--viz-neutral)",
  warning: "var(--st-warning)",
  // thang thứ bậc: nhạt = bước đầu, đậm = bước cuối / hạng cao
  seq: ["var(--seq-250)", "var(--seq-300)", "var(--seq-400)", "var(--seq-500)", "var(--seq-600)"],
};

/** Kỳ nào mới hơn: quy về tháng kết thúc kỳ để so được tháng với quý */
const periodKey = (p: { year: number; periodType: string; period: number }) => p.year * 12 + (p.periodType === "MONTH" ? p.period : p.period * 3);
/** Khóa tháng (year*12 + month) → tháng 1–12 / "m/yyyy" */
const monthOf = (k: number) => k - Math.floor((k - 1) / 12) * 12;
const monthYear = (k: number) => `${monthOf(k)}/${Math.floor((k - 1) / 12)}`;
/** Nhãn ngắn dưới cột: "T9" / "Q3" (năm nằm trong tooltip + mô tả thẻ) */
const shortPeriod = (p: { periodType: string; period: number }) => `${p.periodType === "MONTH" ? "T" : "Q"}${p.period}`;
const pct1 = (v: number) => `${Math.round(v * 1000) / 10}%`;
const round1 = (v: number) => Math.round(v * 1000) / 10;
/** "A, B, C và 2 người khác" */
const names = (list: string[], unit: string, n = 3) => (list.length <= n ? list.join(", ") : `${list.slice(0, n).join(", ")} và ${list.length - n} ${unit} khác`);

/** Nhiệm vụ đang mở, sắp đến hạn trước (chọn sẵn các trường cho thẻ "Nhiệm vụ đang chạy") */
const ONGOING_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  submittedAt: true,
  assignee: { select: { fullName: true } },
} satisfies Prisma.TaskSelect;
type OngoingRow = Prisma.TaskGetPayload<{ select: typeof ONGOING_SELECT }>;

/** Mỗi dòng chỉ giữ tên việc, người làm và 1 nhãn hạn ngắn (không xuống dòng) */
function toOngoing(rows: OngoingRow[], now: Date): OngoingTask[] {
  return rows.map((t) => {
    const due = dueChip(t, now);
    const label = !t.dueDate ? "Không hạn" : due.late ? cap(due.note!) : due.note === "hôm nay" ? "Hạn hôm nay" : `Hạn ${due.date.slice(0, 5)}`;
    return { id: t.id, title: t.title, assignee: t.assignee.fullName, due: { label, tone: due.tone } };
  });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Nhãn bước phiếu KPI rút gọn cho chú giải donut (không xuống dòng) */
const KPI_STEP_SHORT: Record<string, string> = { DRAFT: "Đang cập nhật", SUBMITTED: "Chờ xác nhận", MANAGER_APPROVED: "Đã xác nhận", LOCKED: "Đã khóa" };

/**
 * Trang Tổng quan — lời chào, banner việc cần chú ý, 4 chỉ số, nhiệm vụ đang chạy và các biểu đồ.
 * Số liệu tự cập nhật mỗi 30 giây.
 */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; err?: string }> }) {
  // Admin không có trang Tổng quan nghiệp vụ → vào thẳng Quản trị hệ thống (vd ngay sau khi đăng nhập)
  const me = await getCurrentUser();
  if (me && isAdmin(me)) redirect("/admin");
  const user = await requireEmployeeUser();
  const sp = await searchParams;
  const hrm = isHRM(user);
  // HRM: công tắc "Phòng tôi / Toàn công ty" (mặc định Toàn công ty); ở "Phòng tôi" giống hệt một Quản lý
  const company = companyView(user, sp.view);
  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={30} />
      <Greeting name={user.employee?.fullName ?? user.email} right={hrm ? <ViewToggle company={company} hrefMine="/?view=mine" hrefCompany="/" /> : undefined} />
      {sp.ok || sp.err ? <Flash ok={sp.ok} err={sp.err} /> : null}
      {hrm && company && <HrmInbox />}
      {company ? <Overview user={user} company /> : isManager(user) || hrm ? <Overview user={user} company={false} /> : <Personal user={user} />}
    </div>
  );
}

/** HRM — banner "Cần xử lý": tháng chưa import chấm công, phòng chưa gửi bản cuối KPI quý vừa kết thúc */
async function HrmInbox() {
  const missing = missingAttendanceMonths();
  const { units } = await loadUnits();
  const q = parseYq(undefined);
  const notSent = units.filter((u) => getSummary(u.id, q.year, q.quarter)?.status !== "SENT");
  if (!missing.length && !notSent.length)
    return (
      <AlertBanner ok title="Mọi việc đã xong">
        Đã import đủ chấm công và các phòng đã gửi bản cuối {q.label}.
      </AlertBanner>
    );
  return (
    <>
      {missing.length > 0 && (
        <AlertBanner title="Chấm công chưa đầy đủ" href="/attendance" cta="Import chấm công">
          Còn <Hl>{missing.length} tháng</Hl> chưa import chấm công: <Hl>{names(missing.map(attMonthLabel), "tháng", 4)}</Hl>.
        </AlertBanner>
      )}
      {notSent.length > 0 && (
        <AlertBanner title={`Bản cuối KPI ${q.label}`} href={`/heads?yq=${q.value}`}>
          <Hl>{names(notSent.map((u) => u.name), "phòng")}</Hl> chưa gửi bản cuối KPI {q.label}.
        </AlertBanner>
      )}
    </>
  );
}

// ───────────────────────── HRM: toàn công ty · Quản lý (và HRM "Phòng tôi"): nhóm của mình ─────────────────────────

async function Overview({ user, company }: { user: CurrentUser; company: boolean }) {
  const view: DashView = company ? "company" : "team";
  const now = today();
  const scope: Prisma.EmployeeWhereInput = company ? companyScope() : teamScope(user);
  const inScope = { employee: scope };
  const WEEKS = 8;
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const since = new Date(monday - (WEEKS - 1) * 7 * DAY);

  const [employees, plans, openTasks, lateTasks, cycle, recentTasks, ongoing] = await Promise.all([
    db.employee.findMany({ where: { AND: [scope, { status: { not: "RESIGNED" } }] }, select: { id: true, employeeType: true, departmentId: true, fullName: true, department: { select: { name: true } } } }),
    db.kpiPlan.findMany({
      where: { ...inScope, year: { gte: now.getUTCFullYear() - 1 } },
      select: { id: true, employeeId: true, status: true, year: true, periodType: true, period: true, items: { select: { actual: true, target: true, weight: true, formula: true } } },
    }),
    db.task.count({ where: { assignee: scope, status: { in: [...OPEN_TASK] } } }),
    db.task.count({ where: { assignee: scope, status: { in: [...OPEN_TASK] }, dueDate: { lt: now } } }),
    db.reviewCycle.findFirst({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, include: { reviews: { where: inScope, select: { status: true, grade: true } } } }),
    db.task.findMany({ where: { assignee: scope, OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }] }, select: { createdAt: true, completedAt: true, status: true } }),
    db.task.findMany({
      where: { assignee: scope, status: { in: [...OPEN_TASK] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: ONGOING,
      select: ONGOING_SELECT,
    }),
  ]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const active = plans.filter((p) => byId.has(p.employeeId));

  // KPI quý hiện tại, tạm tính theo công thức dùng chung (chỉ chỉ số đã cập nhật) — mỗi người 1 điểm
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  const qy = now.getUTCFullYear();
  const perPerson = employees
    .map((e) => ({ e, k: provisionalKpi(active.filter((p) => p.employeeId === e.id && inQuarter(p, qy, q)).flatMap((p) => p.items)) }))
    .filter((x) => x.k.total > 0);
  const scored = perPerson.filter((x) => x.k.score !== null);
  const kpiAvg = scored.length ? scored.reduce((s, x) => s + x.k.score!, 0) / scored.length : null;
  const belowList = scored.filter((x) => x.k.score! < KPI_OK).map((x) => x.e.fullName);
  const below = belowList.length;
  const updated = perPerson.reduce((s, x) => s + x.k.updated, 0);
  const totalItems = perPerson.reduce((s, x) => s + x.k.total, 0);

  const kpiRows = company
    ? Object.values(
        scored.reduce<Record<string, { label: string; sum: number; n: number; u: number; t: number; href: string }>>((acc, { e, k }) => {
          const key = e.departmentId ?? "none";
          acc[key] ??= { label: e.department?.name ?? "Chưa có phòng ban", sum: 0, n: 0, u: 0, t: 0, href: e.departmentId ? `/employees?dept=${e.departmentId}` : "/employees" };
          acc[key].sum += k.score!;
          acc[key].n++;
          acc[key].u += k.updated;
          acc[key].t += k.total;
          return acc;
        }, {}),
      ).map((d) => ({ label: d.label, value: Math.round((d.sum / d.n) * 1000) / 10, href: d.href, hint: `trung bình ${d.n} người · ${d.u}/${d.t} chỉ số đã cập nhật` }))
    : scored.map(({ e, k }) => ({ label: e.fullName, value: Math.round(k.score! * 1000) / 10, href: `/employees/${e.id}?tab=performance`, hint: `${k.updated}/${k.total} chỉ số đã cập nhật` }));
  kpiRows.sort((a, b) => b.value - a.value);

  // Xu hướng KPI 12 tháng (theo tháng kết thúc kỳ), tạm tính theo công thức dùng chung
  const curKey = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const months = Array.from({ length: 12 }, (_, i) => curKey - 11 + i);
  const trend = months.map((k) => {
    const ofMonth = active.filter((p) => periodKey(p) === k);
    const score = provisionalKpi(ofMonth.flatMap((p) => p.items)).score;
    return {
      label: `T${monthOf(k)}`,
      title: `Tháng ${monthYear(k)}`,
      value: score === null ? null : round1(score),
      rows: score === null ? undefined : [
        { label: "KPI trung bình", value: pct1(score) },
        { label: "Xếp loại", value: kpiGrade(score)?.label ?? "—" },
        { label: "Số phiếu", value: String(ofMonth.length) },
      ],
    };
  });

  // Phiếu KPI năm nay theo bước ký
  // "Đã khóa" suy ra từ bảng tổng hợp đã xác nhận (không lưu database)
  const KPI_STEPS = ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "LOCKED"] as const;
  const thisYear = active.filter((p) => p.year === now.getUTCFullYear());
  const locked = await lockedPlanIds(thisYear);
  const stepOf = (p: (typeof thisYear)[number]) => (locked.has(p.id) ? "LOCKED" : p.status);
  const kpiPipeline: Segment[] = KPI_STEPS.map((s, i) => ({
    key: s,
    label: KPI_STEP_SHORT[s],
    value: thisYear.filter((p) => stepOf(p) === s).length,
    color: [C.seq[0], C.seq[2], C.seq[3], C.seq[4]][i],
    href: `/kpi/plans?status=${s}`,
  }));

  // Nhiệm vụ theo tuần
  const weeks = Array.from({ length: WEEKS }, (_, i) => since.getTime() + i * 7 * DAY);
  const inWeek = (d: Date | null, w: number) => !!d && d.getTime() >= w && d.getTime() < w + 7 * DAY;
  const weekLabel = (w: number) => {
    const d = new Date(w);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const reviewTotal = cycle?.reviews.length ?? 0;
  const reviewDone = cycle?.reviews.filter((r) => r.status === "COMPLETED").length ?? 0;
  const TYPES: EmployeeType[] = ["OFFICIAL", "PROBATION", "INTERN", "COLLABORATOR"];
  const official = employees.filter((e) => e.employeeType === "OFFICIAL").length;

  return (
    <>
      {/* Banner cho Quản lý (HRM toàn công ty đã có banner "Cần xử lý" riêng) */}
      {!company &&
        (below || lateTasks ? (
          <AlertBanner title="Cần chú ý trong nhóm" href={below ? "/kpi/plans" : "/tasks?view=all&show=overdue"}>
            {below > 0 && (
              <>
                KPI quý {q} của <Hl>{names(belowList, "người")}</Hl> đang dưới 80%.{" "}
              </>
            )}
            {lateTasks > 0 && (
              <>
                Nhóm có <Hl>{lateTasks} nhiệm vụ</Hl> đã quá hạn.
              </>
            )}
          </AlertBanner>
        ) : (
          <AlertBanner ok title="Nhóm đang ổn định">
            Không có nhiệm vụ quá hạn và chưa ai dưới 80% KPI quý {q}.
          </AlertBanner>
        ))}

      {/* 4 chỉ số quan trọng nhất */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label={company ? "Nhân sự đang làm" : "Nhân viên trong nhóm"} value={String(employees.length)} sub={`${official} chính thức`} href="/employees" />
        <StatCard
          icon={Target}
          label={`KPI quý ${q} tạm tính`}
          value={kpiAvg === null ? "—" : pct1(kpiAvg)}
          sub={kpiAvg === null ? "Chưa có số liệu trong quý" : `${kpiGrade(kpiAvg)?.label} · ${updated}/${totalItems} chỉ số · ${below} người dưới 80%`}
          tone={kpiAvg === null ? "gray" : kpiAvg >= KPI_OK ? "blue" : "amber"}
          href="/kpi/plans"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Tiến độ đánh giá"
          value={reviewTotal ? `${Math.round((reviewDone / reviewTotal) * 100)}%` : "—"}
          sub={reviewTotal ? `${reviewDone}/${reviewTotal} phiếu hoàn tất` : "Chưa có kỳ đang mở"}
          href={cycle && company ? `/reviews/cycles/${cycle.id}` : "/reviews"}
        />
        <StatCard
          icon={ListTodo}
          label="Nhiệm vụ quá hạn"
          value={String(lateTasks)}
          sub={`trên tổng ${openTasks} nhiệm vụ đang mở`}
          tone={lateTasks > 0 ? "red" : "green"}
          href="/tasks?view=all&show=overdue"
        />
      </div>

      {/* Các thẻ dưới đây kéo thả được (thứ tự + độ rộng lưu theo tài khoản, xem dashboard-layout.ts) */}
      <DashboardGrid
        view={view}
        initial={resolveLayout(view, savedLayout(user, view))}
        cards={[
          {
            id: "tasks",
            title: "Nhiệm vụ đang chạy",
            node: (
              <DashCard icon={ListChecks} title="Nhiệm vụ đang chạy" subtitle="Sắp đến hạn trước" actions={<CircleLink href="/tasks?view=all" icon={ArrowUpRight} label="Xem tất cả nhiệm vụ" />}>
                <OngoingTasks rows={toOngoing(ongoing, now)} emptyText="Không có nhiệm vụ đang mở" />
              </DashCard>
            ),
          },
          {
            id: "kpiTrend",
            title: "Xu hướng KPI 12 tháng",
            node: (
              <DashCard
                icon={ChartColumn}
                title="Xu hướng KPI 12 tháng"
                subtitle={`${company ? "Trung bình toàn công ty" : "Trung bình nhóm"}, ${monthYear(months[0])} đến ${monthYear(months[11])}`}
                actions={<PillLink href="/kpi/plans">Xem chi tiết</PillLink>}
              >
                <SoftBarChart bars={trend} max={100} unit="%" target={{ value: KPI_OK * 100, label: "Mốc Hoàn thành 80%" }} emptyText="Không có dữ liệu KPI trong 12 tháng gần nhất" />
              </DashCard>
            ),
          },
          {
            id: "kpiPlans",
            title: `Phiếu KPI năm ${now.getUTCFullYear()}`,
            node: (
              <DashCard icon={ChartPie} title={`Phiếu KPI năm ${now.getUTCFullYear()}`} subtitle="Theo bước ký" actions={<CircleLink href="/kpi/plans" icon={ArrowUpRight} label="Xem phiếu KPI" />}>
                <Donut segments={kpiPipeline} centerLabel="phiếu KPI" emptyText="Chưa có phiếu KPI trong năm" />
              </DashCard>
            ),
          },
          {
            id: "staffMix",
            title: "Cơ cấu nhân sự",
            node: (
              <DashCard icon={Users} title="Cơ cấu nhân sự" subtitle="Theo loại hợp đồng" actions={<CircleLink href="/employees" icon={ArrowUpRight} label="Xem nhân viên" />}>
                <Donut
                  centerLabel="nhân sự"
                  segments={TYPES.map((t, i) => ({ key: t, label: employeeTypeLabel[t], value: employees.filter((e) => e.employeeType === t).length, color: [C.s1, C.s2, C.s3, C.s4][i], href: `/employees?type=${t}` }))}
                />
              </DashCard>
            ),
          },
          {
            id: "review",
            title: cycle ? cycle.name : "Kỳ đánh giá",
            node: (
              <DashCard
                icon={ClipboardCheck}
                title={cycle ? cycle.name : "Kỳ đánh giá"}
                subtitle="Tiến độ và xếp hạng"
                actions={cycle ? <CircleLink href={company ? `/reviews/cycles/${cycle.id}` : "/reviews"} icon={ArrowUpRight} label="Xem kỳ đánh giá" /> : undefined}
              >
                {cycle && reviewTotal > 0 ? (
                  <div className="flex flex-col items-center justify-center gap-4">
                    <ProgressRing size={124} done={reviewDone} total={reviewTotal} label="Phiếu đã hoàn tất" />
                    <div className="w-full">
                      <ColumnChart
                        height={96}
                        cols={Object.keys(GRADE_INFO).map((g, i) => ({ label: `Hạng ${g}`, sub: GRADE_INFO[g].range, value: cycle.reviews.filter((r) => r.grade === g).length, color: C.seq[4 - i] }))}
                        unit=" người"
                        emptyText="Chưa có kết quả xếp hạng"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">Không có kỳ đánh giá đang mở.</p>
                )}
              </DashCard>
            ),
          },
          {
            id: "kpiByUnit",
            title: company ? "KPI theo phòng ban" : "KPI nhân viên",
            node: (
              <DashCard icon={Target} title={company ? "KPI theo phòng ban" : "KPI nhân viên"} subtitle={`Quý ${q}/${qy}, tạm tính`}>
                <HBarChart rows={kpiRows} unit="%" max={100} target={{ value: KPI_OK * 100, label: "Mốc Hoàn thành" }} emptyText="Chưa có số liệu KPI trong quý" />
              </DashCard>
            ),
          },
          {
            id: "tasksWeekly",
            title: `Nhiệm vụ ${WEEKS} tuần gần đây`,
            node: (
              <DashCard icon={TrendingUp} title={`Nhiệm vụ ${WEEKS} tuần gần đây`} subtitle="Được giao và hoàn thành theo tuần" actions={<PillLink href="/tasks?view=all">Xem chi tiết</PillLink>}>
                <LineChart
                  fill
                  height={150}
                  labels={weeks.map(weekLabel)}
                  series={[
                    { key: "created", label: "Được giao", color: C.s1, values: weeks.map((w) => recentTasks.filter((t) => inWeek(t.createdAt, w)).length) },
                    { key: "done", label: "Hoàn thành", color: C.s2, values: weeks.map((w) => recentTasks.filter((t) => t.status === "DONE" && inWeek(t.completedAt, w)).length) },
                  ]}
                  emptyText={`Không có dữ liệu nhiệm vụ trong ${WEEKS} tuần gần nhất`}
                />
              </DashCard>
            ),
          },
        ]}
      />
    </>
  );
}

// ───────────────────────── Nhân viên: số liệu của bản thân ─────────────────────────

async function Personal({ user }: { user: CurrentUser }) {
  const employeeId = user.employeeId;
  if (!employeeId) {
    return (
      <DashCard title="Tổng quan">
        <p className="py-8 text-center text-sm text-slate-500">Tài khoản chưa được liên kết với hồ sơ nhân viên.</p>
      </DashCard>
    );
  }
  const now = today();
  const year = now.getUTCFullYear();
  const [myPlans, taskGroups, lateTasks, ongoing] = await Promise.all([
    db.kpiPlan.findMany({ where: { employeeId }, select: { periodType: true, period: true, year: true, items: { select: { actual: true, target: true, weight: true, formula: true } } } }),
    db.task.groupBy({ by: ["status"], where: { assigneeId: employeeId, status: { in: [...OPEN_TASK] } }, _count: true }),
    db.task.count({ where: { assigneeId: employeeId, status: { in: [...OPEN_TASK] }, dueDate: { lt: now } } }),
    db.task.findMany({
      where: { assigneeId: employeeId, status: { in: [...OPEN_TASK] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: ONGOING,
      select: ONGOING_SELECT,
    }),
  ]);
  // Mỗi phiếu tính % tạm tính theo công thức dùng chung; chỉ lấy phiếu đã có số liệu
  const recent = myPlans
    .map((p) => ({ ...p, k: provisionalKpi(p.items) }))
    .filter((p) => p.k.score !== null)
    .sort((a, b) => periodKey(a) - periodKey(b))
    .slice(-12);
  const last = recent.at(-1);
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  const quarterK = provisionalKpi(myPlans.filter((p) => inQuarter(p, year, q)).flatMap((p) => p.items));
  const taskCount = (s: string) => taskGroups.find((g) => g.status === s)?._count ?? 0;
  const openTasks = taskGroups.reduce((s, g) => s + g._count, 0);

  return (
    <>
      {lateTasks > 0 ? (
        <AlertBanner title="Nhiệm vụ quá hạn" href="/tasks">
          Bạn có <Hl>{lateTasks} nhiệm vụ</Hl> đã quá hạn, cần xử lý hoặc báo cáo sớm.
        </AlertBanner>
      ) : quarterK.score !== null && quarterK.score < KPI_OK ? (
        <AlertBanner title={`KPI quý ${q}`} href="/kpi">
          KPI quý {q} tạm tính của bạn đang <Hl>{pct1(quarterK.score)}</Hl>, dưới mốc 80%.
        </AlertBanner>
      ) : (
        <AlertBanner ok title="Mọi thứ đang đúng tiến độ">
          Bạn không có nhiệm vụ quá hạn.
        </AlertBanner>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={Target}
          label={`KPI quý ${q} tạm tính`}
          value={quarterK.score === null ? "—" : pct1(quarterK.score)}
          sub={quarterK.total ? `${quarterK.updated}/${quarterK.total} chỉ số đã cập nhật` : "Chưa có phiếu trong quý"}
          tone={quarterK.score === null ? "gray" : quarterK.score >= KPI_OK ? "blue" : "amber"}
          href="/kpi"
        />
        <StatCard
          icon={Target}
          label="KPI kỳ gần nhất"
          value={last ? pct1(last.k.score!) : "—"}
          sub={last ? `${periodLabel(last.periodType, last.period, last.year)} · ${last.k.updated}/${last.k.total} chỉ số` : "Chưa có dữ liệu"}
          tone={!last ? "gray" : last.k.score! >= KPI_OK ? "blue" : "amber"}
          href="/kpi"
        />
        <StatCard icon={ListTodo} label="Nhiệm vụ đang mở" value={String(openTasks)} sub={lateTasks ? `${lateTasks} quá hạn` : "Không có nhiệm vụ quá hạn"} tone={lateTasks ? "red" : "green"} href="/tasks" />
      </div>

      <DashboardGrid
        view="personal"
        initial={resolveLayout("personal", savedLayout(user, "personal"))}
        cards={[
          {
            id: "myTasks",
            title: "Nhiệm vụ của tôi",
            node: (
              <DashCard icon={ListChecks} title="Nhiệm vụ của tôi" subtitle="Sắp đến hạn trước" actions={<CircleLink href="/tasks" icon={ArrowUpRight} label="Xem tất cả nhiệm vụ" />}>
                <OngoingTasks rows={toOngoing(ongoing, now)} emptyText="Không có nhiệm vụ đang mở" />
              </DashCard>
            ),
          },
          {
            id: "myKpi",
            title: "Kết quả KPI theo kỳ",
            node: (
              <DashCard
                icon={ChartColumn}
                title="Kết quả KPI theo kỳ"
                subtitle={recent.length ? `KPI cá nhân, ${periodLabel(recent[0].periodType, recent[0].period, recent[0].year)} đến ${periodLabel(last!.periodType, last!.period, last!.year)}` : "KPI cá nhân, tạm tính"}
                actions={<PillLink href="/kpi">Xem chi tiết</PillLink>}
              >
                <SoftBarChart
                  bars={recent.map((p) => ({
                    label: shortPeriod(p),
                    title: periodLabel(p.periodType, p.period, p.year),
                    value: round1(p.k.score!),
                    rows: [
                      { label: "KPI", value: pct1(p.k.score!) },
                      { label: "Xếp loại", value: kpiGrade(p.k.score)?.label ?? "—" },
                      { label: "Chỉ số", value: `${p.k.updated}/${p.k.total}` },
                    ],
                  }))}
                  max={100}
                  unit="%"
                  target={{ value: KPI_OK * 100, label: "Mốc Hoàn thành 80%" }}
                  emptyText="Chưa có kỳ KPI hoàn tất"
                />
              </DashCard>
            ),
          },
          {
            id: "myTaskStatus",
            title: "Nhiệm vụ cá nhân",
            node: (
              <DashCard icon={ChartPie} title="Nhiệm vụ cá nhân" subtitle="Theo trạng thái" actions={<CircleLink href="/tasks" icon={ArrowUpRight} label="Xem nhiệm vụ" />}>
                <Donut
                  centerLabel="đang mở"
                  emptyText="Không có nhiệm vụ đang mở"
                  segments={[
                    { key: "TODO", label: taskStatusLabel.TODO, value: taskCount("TODO"), color: C.seq[0] },
                    { key: "IN_PROGRESS", label: taskStatusLabel.IN_PROGRESS, value: taskCount("IN_PROGRESS"), color: C.seq[2] },
                    { key: "REVIEW", label: taskStatusLabel.REVIEW, value: taskCount("REVIEW"), color: C.seq[4] },
                  ]}
                />
              </DashCard>
            ),
          },
          {
            id: "kpiLatest",
            title: "KPI kỳ gần nhất",
            node: (
              <DashCard icon={Target} title="KPI kỳ gần nhất" subtitle={`So với mốc ${KPI_OK * 100}%`}>
                <div className="flex h-full items-center justify-center py-2">
                  <Gauge value={last?.k.score ?? null} target={KPI_OK} label={last ? `${periodLabel(last.periodType, last.period, last.year)} · ${last.k.updated}/${last.k.total} chỉ số` : ""} />
                </div>
              </DashCard>
            ),
          },
        ]}
      />
    </>
  );
}
