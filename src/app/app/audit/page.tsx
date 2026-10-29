import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { PageHeader } from "@/components/ui/Layout";
import { WebsiteAudit } from "@/features/audit/WebsiteAudit";

export const metadata = { title: "Website Audit" };

export default function WebsiteAuditPage() {
  return (
    <WorkspaceShell title="Website Audit" context="Document-level lab fetch of a public URL — not a Chrome session">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Lab measurement"
          title="Website Performance Audit"
          description="Submit a public http(s) URL. We resolve DNS, reject private hosts, fetch the HTML, and inspect linked assets. Core Web Vitals are included only when PageSpeed Insights is configured."
        />
        <WebsiteAudit />
      </div>
    </WorkspaceShell>
  );
}
