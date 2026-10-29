import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Feedback";
import { statusToneFor } from "@/lib/status";
import { StatStrip, TableShell, Td, Th } from "@/components/ui/Layout";
import { DeleteJobButton } from "@/features/history/DeleteJobButton";
import { getJobDetail } from "@/server/services/storageService";
import { readGuestSession } from "@/lib/session-server";
import { formatBytes, formatDateTime, formatDimensions, formatNumber, formatSavingsPercent } from "@/lib/format";
import { notFound } from "next/navigation";

export const metadata = { title: "Job details" };
export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sessionId, shortCode } = await readGuestSession();
  if (!sessionId) notFound();

  const detail = await getJobDetail(sessionId, id);
  if (!detail) notFound();

  const { job, items } = detail;
  const savingsPercent = Number(job.inputBytes) > 0 ? (Number(job.savedBytes) / Number(job.inputBytes)) * 100 : null;

  return (
    <WorkspaceShell title="Job details" context={job.label}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Link
          href="/app/history"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to history
        </Link>

        <header className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-2xs tracking-[0.12em] text-muted uppercase">{job.kind}</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.015em] text-ink">{job.label}</h1>
              <p className="mt-1.5 text-sm text-muted">
                {formatDateTime(job.createdAt)}
                {job.note ? <span className="font-mono text-xs"> · {job.note}</span> : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={statusToneFor(job.status)}>{job.status}</StatusBadge>
              <DeleteJobButton jobId={job.id} label={job.label} />
            </div>
          </div>
          <div className="rule-ticks h-[5px] w-full" aria-hidden />
        </header>

        <StatStrip
          items={[
            { label: "Files", value: formatNumber(job.fileCount) },
            { label: "Input", value: job.inputBytes > 0 ? formatBytes(Number(job.inputBytes)) : "—" },
            { label: "Output", value: job.outputBytes > 0 ? formatBytes(Number(job.outputBytes)) : "—" },
            {
              label: "Saved",
              value: job.savedBytes > 0 ? formatBytes(Number(job.savedBytes)) : "—",
              hint: savingsPercent !== null ? formatSavingsPercent(savingsPercent) : undefined,
            },
          ]}
        />

        <section aria-labelledby="job-items" className="border border-line bg-surface">
          <h2 id="job-items" className="border-b border-line px-4 py-3 text-sm font-semibold text-ink sm:px-5">
            Per-file results
          </h2>
          <TableShell minWidth={860}>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Status</Th>
                <Th numeric>Input</Th>
                <Th numeric>Output</Th>
                <Th numeric>Saved</Th>
                <Th numeric>Dimensions</Th>
                <Th>Format</Th>
                <Th numeric>Download</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td mono>
                    <span className="block max-w-[14rem] truncate" title={item.filename}>
                      {item.filename}
                    </span>
                    {item.outputFilename && item.outputFilename !== item.filename ? (
                      <span className="block max-w-[14rem] truncate text-2xs text-muted" title={item.outputFilename}>
                        → {item.outputFilename}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge tone={statusToneFor(item.status)}>{item.status}</StatusBadge>
                  </Td>
                  <Td numeric>{item.inputBytes > 0 ? formatBytes(Number(item.inputBytes)) : "—"}</Td>
                  <Td numeric>{item.outputBytes > 0 ? formatBytes(Number(item.outputBytes)) : "—"}</Td>
                  <Td numeric>
                    {Number(item.savedBytes) === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className={Number(item.savedBytes) > 0 ? "text-ok" : "text-danger"}>
                        {formatBytes(Number(item.savedBytes))}
                        <span className="ml-1.5 text-muted">
                          {formatSavingsPercent(item.savingsPercent === null ? null : Number(item.savingsPercent))}
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td numeric>{formatDimensions(item.inputWidth, item.inputHeight)}</Td>
                  <Td mono>{item.outputFormat ?? "—"}</Td>
                  <Td numeric>
                    {item.artifactId ? (
                      <a
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover hover:underline"
                        href={`/api/v1/artifacts/${item.artifactId}`}
                        download
                      >
                        <Download className="size-3.5" aria-hidden />
                        Save
                      </a>
                    ) : (
                      <span className="text-muted">{item.message ? "no file" : "—"}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <p className="border-t border-line px-4 py-3 text-2xs leading-relaxed text-muted sm:px-5">
            Stored files expire 24 hours after the job ran. When a download link is gone, re-run the job from the
            tool that created it.
          </p>
        </section>

        <ButtonLink href="/app/images" variant="secondary" size="sm" className="w-fit">
          Optimize another image
        </ButtonLink>
      </div>
    </WorkspaceShell>
  );
}
