import Link from "next/link";
import { ArrowUpRight, Clock, FileCode2, Globe, ImageDown, ScanSearch, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { EmptyState, StatusBadge } from "@/components/ui/Feedback";
import { statusToneFor } from "@/lib/status";
import { InlineNote, PageHeader, TableShell, Td, Th } from "@/components/ui/Layout";
import { listHistory } from "@/server/services/storageService";
import { readGuestSession, sessionLabel } from "@/lib/session-server";
import { formatBytes, formatNumber, formatRelativeTime, formatSavingsPercent } from "@/lib/format";
import type { historyQuerySchema } from "@/server/validators";
import type { z } from "zod";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

const KINDS = [
  { value: "all", label: "All types" },
  { value: "image.optimize", label: "Images" },
  { value: "css.font-display", label: "CSS" },
  { value: "asset.analyze", label: "Analysis" },
  { value: "site.audit", label: "Audit" },
];
const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "saved", label: "Most bytes saved" },
];

function buildQuery(base: z.infer<typeof historyQuerySchema>, patch: Partial<z.infer<typeof historyQuerySchema>>) {
  const params = new URLSearchParams();
  const next = { ...base, ...patch };
  if (next.q) params.set("q", next.q);
  if (next.kind !== "all") params.set("kind", next.kind);
  if (next.status !== "all") params.set("status", next.status);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page !== 1) params.set("page", String(next.page));
  if (next.pageSize !== 10) params.set("pageSize", String(next.pageSize));
  const query = params.toString();
  return query ? `/app/history?${query}` : "/app/history";
}

const ICONS: Record<string, typeof ImageDown> = {
  "image.optimize": ImageDown,
  "css.font-display": FileCode2,
  "asset.analyze": ScanSearch,
  "site.audit": Globe,
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = {
    q: first("q") || undefined,
    kind: (first("kind") ?? "all") as z.infer<typeof historyQuerySchema>["kind"],
    status: (first("status") ?? "all") as z.infer<typeof historyQuerySchema>["status"],
    sort: (first("sort") ?? "newest") as z.infer<typeof historyQuerySchema>["sort"],
    page: Math.max(1, Number(first("page") ?? 1) || 1),
    pageSize: Math.min(50, Math.max(5, Number(first("pageSize") ?? 10) || 10)),
  };

  const { sessionId, shortCode } = await readGuestSession();
  let page: Awaited<ReturnType<typeof listHistory>>;
  let storageDown = false;
  try {
    page = sessionId
      ? await listHistory(sessionId, query)
      : { entries: [], total: 0, page: 1, pageSize: query.pageSize, pageCount: 1 };
  } catch {
    page = { entries: [], total: 0, page: 1, pageSize: query.pageSize, pageCount: 1 };
    storageDown = true;
  }

  return (
    <WorkspaceShell title="History" context={sessionLabel(shortCode)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Records"
          title="Optimization history"
          description="Metadata and result links for every job in this session. Stored bytes expire after 24 hours."
        />

        {storageDown ? (
          <div className="border border-warn-border bg-warn-soft px-3.5 py-3 text-xs leading-relaxed text-warn">
            History storage is unreachable right now, so no records can be listed. New jobs will still be
            processed; persistence resumes once the database is back.
          </div>
        ) : null}

        {/* Filters — a plain GET form, so it works without JavaScript. */}
        <form method="get" action="/app/history" className="border border-line bg-surface p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label htmlFor="history-search" className="mb-1.5 block text-xs font-medium text-ink">
                Search job name
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
                <input
                  id="history-search"
                  name="q"
                  defaultValue={query.q ?? ""}
                  placeholder="e.g. images → WEBP"
                  className="h-9.5 w-full rounded-md border border-line-strong bg-surface pr-2.5 pl-8 text-sm text-ink placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
                />
              </div>
            </div>
            {[
              { name: "kind", label: "Type", options: KINDS, value: query.kind },
              { name: "status", label: "Status", options: STATUSES, value: query.status },
              { name: "sort", label: "Sort", options: SORTS, value: query.sort },
            ].map((select) => (
              <div key={select.name} className="min-w-0">
                <label htmlFor={`history-${select.name}`} className="mb-1.5 block text-xs font-medium text-ink">
                  {select.label}
                </label>
                <select
                  id={`history-${select.name}`}
                  name={select.name}
                  defaultValue={select.value}
                  className="h-9.5 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none lg:w-36"
                >
                  {select.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="submit" className={buttonClass({ variant: "primary", size: "md" })}>
                Apply
              </button>
              <Link href="/app/history" className={buttonClass({ variant: "ghost", size: "md" })}>
                Reset
              </Link>
            </div>
          </div>
        </form>

        <section aria-labelledby="history-table">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="history-table" className="text-sm font-semibold text-ink">
              {formatNumber(page.total)} job{page.total === 1 ? "" : "s"}
            </h2>
            <span className="text-2xs text-muted">
              Page {page.page} of {page.pageCount}
            </span>
          </div>

          <div className="border border-line bg-surface">
            {page.entries.length === 0 ? (
              <EmptyState
                icon={<Clock className="size-4" aria-hidden />}
                title="No matching jobs"
                description={
                  query.q || query.kind !== "all" || query.status !== "all"
                    ? "Nothing matches these filters. Reset them to see the full session history."
                    : "Run an optimization or analysis and it will be recorded here."
                }
                action={
                  <ButtonLink href="/app/images" variant="primary" size="sm">
                    Open the optimizer
                  </ButtonLink>
                }
              />
            ) : (
              <>
                <TableShell minWidth={820}>
                  <thead>
                    <tr>
                      <Th>Job</Th>
                      <Th>Type</Th>
                      <Th>Status</Th>
                      <Th numeric>Files</Th>
                      <Th numeric>Input</Th>
                      <Th numeric>Output</Th>
                      <Th numeric>Saved</Th>
                      <Th numeric>When</Th>
                      <Th numeric>Open</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.entries.map((entry) => {
                      const Icon = ICONS[entry.kind] ?? ScanSearch;
                      return (
                        <tr key={entry.id} className="transition-colors duration-150 hover:bg-surface-sunken/60">
                          <Td>
                            <span className="block max-w-[15rem] truncate text-ink" title={entry.label}>
                              {entry.label}
                            </span>
                            {entry.note ? <span className="block font-mono text-2xs text-muted">{entry.note}</span> : null}
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-soft">
                              <Icon className="size-3.5 text-faint" aria-hidden />
                              {KINDS.find((kind) => kind.value === entry.kind)?.label ?? entry.kind}
                            </span>
                          </Td>
                          <Td>
                            <StatusBadge tone={statusToneFor(entry.status)}>{entry.status}</StatusBadge>
                          </Td>
                          <Td numeric>{formatNumber(entry.fileCount)}</Td>
                          <Td numeric>{entry.inputBytes > 0 ? formatBytes(entry.inputBytes) : "—"}</Td>
                          <Td numeric>{entry.outputBytes > 0 ? formatBytes(entry.outputBytes) : "—"}</Td>
                          <Td numeric>
                            {entry.savedBytes === 0 ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className="text-ok">
                                {formatBytes(entry.savedBytes)}
                                <span className="ml-1.5 text-muted">{formatSavingsPercent(entry.savingsPercent)}</span>
                              </span>
                            )}
                          </Td>
                          <Td numeric>{formatRelativeTime(entry.createdAt)}</Td>
                          <Td numeric>
                            <Link
                              href={`/app/history/${entry.id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover hover:underline"
                              aria-label={`Open ${entry.label}`}
                            >
                              Details
                              <ArrowUpRight className="size-3.5" aria-hidden />
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>

                {page.pageCount > 1 ? (
                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                    <span className="text-2xs text-muted">
                      Showing {(page.page - 1) * page.pageSize + 1}–
                      {Math.min(page.page * page.pageSize, page.total)} of {formatNumber(page.total)}
                    </span>
                    <div className="flex gap-2">
                      {page.page > 1 ? (
                        <Link
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                          href={buildQuery(query, { page: page.page - 1 })}
                          rel="prev"
                        >
                          Previous
                        </Link>
                      ) : (
                        <span className={buttonClass({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-50" })}>
                          Previous
                        </span>
                      )}
                      {page.page < page.pageCount ? (
                        <Link
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                          href={buildQuery(query, { page: page.page + 1 })}
                          rel="next"
                        >
                          Next
                        </Link>
                      ) : (
                        <span className={buttonClass({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-50" })}>
                          Next
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <InlineNote>
          Artifacts (the produced files) are retained for 24 hours from creation. Job metadata stays for the life of
          the session cookie. This history is never shared between sessions.
        </InlineNote>
      </div>
    </WorkspaceShell>
  );
}
