"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Feedback";
import { ApiClientError, api } from "@/lib/api-client";

export function DeleteJobButton({ jobId, label }: { jobId: string; label: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/api/v1/history/${jobId}`);
      push({ tone: "ok", title: "Job deleted", description: "Its metadata and stored artifacts were removed." });
      router.push("/app/history");
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : "The job could not be deleted.";
      push({ tone: "danger", title: "Delete failed", description: message });
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} leading={<Trash2 className="size-3.5" aria-hidden />}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this job?"
        description={`“${label}” and its stored artifacts will be removed from this session's history. This cannot be undone.`}
        confirmLabel="Delete job"
        tone="danger"
        loading={busy}
        onCancel={() => setOpen(false)}
        onConfirm={remove}
      />
    </>
  );
}
