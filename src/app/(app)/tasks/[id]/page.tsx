// Chi tiết nhiệm vụ: quyền + thao tác dùng tasks/actions.ts và lib/server/tasks.ts.
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { today, toInputDate } from "@/lib/dates";
import { canViewTask, taskRoles } from "@/lib/server/tasks";
import { requireEmployeeUser } from "@/lib/server/access";
import { Flash } from "@/components/ui";
import { moveTask, updateTask } from "../actions";
import { TaskHeader } from "./_components/task-header";
import { TaskProgress } from "./_components/task-progress";
import { TaskRequirement } from "./_components/task-requirement";
import { TaskResult } from "./_components/task-result";
import { TaskActivity } from "./_components/task-activity";
import { TaskInfo } from "./_components/task-info";
import { TaskActions, type ActionMode } from "./_components/task-actions";
import { TaskManage } from "./_components/task-manage";
import { fmtWhen, buildEvents, dueChip, priorityChip, returnedInfo, viewStatusLabel, viewStatusTone, type ViewStatus } from "@/lib/task-view";
import { CornerUpLeft } from "lucide-react";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireEmployeeUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canViewTask(user, id))) notFound();

  const t = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { include: { department: true } },
      collaborators: { select: { fullName: true } },
      createdBy: { include: { employee: true } },
      comments: { include: { author: { include: { employee: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!t) notFound();

  const now = today();
  const { isAssignee, isReviewer } = taskRoles(user, t);
  const giver = t.createdBy?.employee?.fullName ?? t.createdBy?.email ?? "—";
  const events = buildEvents(
    t,
    giver,
    t.assignee.fullName,
    t.comments.map((c) => ({ id: c.id, content: c.content, createdAt: c.createdAt, authorName: c.author?.employee?.fullName ?? c.author?.email ?? "Hệ thống" })),
  );
  const returned = returnedInfo(t.status, events);
  const lastSubmit = [...events].reverse().find((e) => e.kind === "submit");
  const approveEvent = [...events].reverse().find((e) => e.kind === "approve");
  const view: ViewStatus = returned ? "RETURNED" : t.status;
  const open = t.status !== "DONE" && t.status !== "CANCELLED";
  const move = moveTask.bind(null, t.id);

  // Nút chính theo vai trò + trạng thái (server vẫn kiểm tra quyền trong moveTask)
  let mode: ActionMode = "none";
  if (isAssignee) {
    if (t.status === "TODO") mode = "start";
    else if (t.status === "IN_PROGRESS") mode = returned ? "rereport" : "report";
    else if (t.status === "REVIEW") mode = "waiting";
  } else if (isReviewer && t.status === "REVIEW") mode = "review";

  return (
    <div className="mx-auto max-w-6xl">
      <TaskHeader
        title={t.title}
        status={{ label: viewStatusLabel[view], tone: viewStatusTone[view] }}
        priority={{ ...priorityChip[t.priority], high: t.priority === "HIGH" }}
        due={dueChip(t, now)}
        action={
          <TaskActions
            key={`${t.status}-${events.length}`}
            mode={mode}
            move={move}
            taskTitle={t.title}
            giver={giver}
            assignee={t.assignee.fullName}
            resultNote={t.resultNote}
            returnReason={returned?.text ?? null}
          />
        }
      />
      <TaskProgress
        status={t.status}
        returned={!!returned}
        dates={{
          assignedAt: t.createdAt,
          startedAt: events.find((e) => e.kind === "start")?.at ?? null,
          submittedAt: t.submittedAt ?? lastSubmit?.at ?? null,
          returnedAt: returned?.at ?? null,
          completedAt: t.completedAt,
          dueDate: t.dueDate,
        }}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid gap-5 min-[900px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 min-[900px]:col-span-2">
          {returned && (
            <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <CornerUpLeft size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-red-800">
                  {isAssignee ? "Nhiệm vụ bị trả lại — cần làm tiếp và báo cáo lại" : "Nhiệm vụ đã bị trả lại để làm tiếp"}
                </div>
                <p className="mt-1 whitespace-pre-line text-red-900">{returned.text ?? "Không ghi lý do"}</p>
                <div className="mt-1 text-xs text-red-700">
                  {returned.by} · {fmtWhen(returned.at)}
                </div>
              </div>
            </div>
          )}
          <TaskRequirement description={t.description} />
          <TaskResult
            note={t.resultNote}
            reportedAt={t.submittedAt ?? lastSubmit?.at ?? null}
            returned={!!returned}
            approved={t.status === "DONE" ? { by: approveEvent?.by ?? giver, at: t.completedAt, note: approveEvent?.text ?? null } : null}
          />
          <TaskActivity events={events} />
        </div>

        <aside className="min-w-0">
          <TaskInfo
            giver={{ name: giver, sub: t.createdBy?.employee?.position ?? null }}
            assignee={{ name: t.assignee.fullName, sub: t.assignee.department?.name ?? null }}
            assignedAt={t.createdAt}
            dueDate={t.dueDate}
            completedAt={t.status === "DONE" ? t.completedAt : null}
            collaborators={t.collaborators.map((c) => c.fullName)}
            kpi={null}
            manage={
              isReviewer && open ? (
                <TaskManage
                  task={{ title: t.title, description: t.description, dueDate: toInputDate(t.dueDate), priority: t.priority }}
                  today={toInputDate(now)}
                  update={updateTask.bind(null, t.id)}
                  move={move}
                />
              ) : undefined
            }
          />
        </aside>
      </div>
    </div>
  );
}
