import Link from "next/link";
import { ProductMark } from "@/components/brand/ProductMark";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md border border-line bg-surface p-7">
        <ProductMark size={26} />
        <p className="mt-6 font-mono text-2xs tracking-[0.14em] text-muted uppercase">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-ink">This page does not exist</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The link may be stale — result links expire 24 hours after a job runs.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-md border border-accent bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Go to the workspace
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Product overview
          </Link>
        </div>
      </div>
    </div>
  );
}
