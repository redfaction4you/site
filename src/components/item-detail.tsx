import Image from "next/image";
import Link from "next/link";

import type { CatalogueItem, KindMeta } from "@/lib/catalogue";
import { formatBytes, publicUrl, storageConfigured } from "@/lib/storage";
import { CompatBadge } from "@/components/compat-badge";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[0.6875rem] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-steel-200">{children}</dd>
    </div>
  );
}

/**
 * A detail page for any catalogue item.
 *
 * The download is the point of the page, so it is the first thing under the
 * title and it states size and checksum up front. Everything else, gallery,
 * compatibility, provenance, supports the decision to click it.
 */
export function ItemDetail({ item, meta }: { item: CatalogueItem; meta: KindMeta }) {
  const primary = item.files[0] ?? null;
  const primaryUrl = primary ? publicUrl(primary.storageKey) : null;
  const compat = item.mapMeta;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">
        <Link href={meta.route} className="hover:text-rust-300">
          {meta.title}
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {item.title}
      </h1>

      <p className="mt-3 text-sm text-steel-400">
        by {item.authorName ?? "an unknown author"}
        {item.releasedOn ? ` · released ${item.releasedOn}` : ""}
      </p>

      {item.summary ? (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
          {item.summary}
        </p>
      ) : null}

      {/* --- Download --- */}
      <div className="panel mt-8 p-6">
        {primary && primaryUrl ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-steel-200">{primary.filename}</p>
              <p className="mt-1 text-xs text-steel-500">
                {formatBytes(primary.sizeBytes)} · SHA-256{" "}
                <span className="font-mono">{primary.sha256.slice(0, 16)}…</span>
              </p>
            </div>
            <a
              href={primaryUrl}
              download
              className="rounded-sm bg-rust-500 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
            >
              Download
            </a>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-steel-400">
            {storageConfigured
              ? "This entry has no file attached yet."
              : "File storage is not configured on this deployment, so downloads are unavailable. The catalogue entry is intact; only the link is missing."}
          </p>
        )}

        {item.files.length > 1 ? (
          <ul className="mt-5 space-y-2 border-t border-basalt-700 pt-4">
            {item.files.slice(1).map((file) => {
              const url = publicUrl(file.storageKey);
              return (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="font-mono text-steel-300">{file.filename}</span>
                  <span className="shrink-0 text-xs text-steel-500">
                    {formatBytes(file.sizeBytes)}
                    {url ? (
                      <>
                        {" · "}
                        <a
                          href={url}
                          download
                          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
                        >
                          download
                        </a>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* --- Compatibility --- */}
      {meta.hasLevels ? (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-steel-100">
            What can load this
          </h2>
          <div className="mt-3">
            <CompatBadge
              playsOn={compat?.playsOn ?? []}
              confidence={compat?.detectionConfidence ?? null}
              rflVersion={compat?.rflVersion ?? null}
              verbose
            />
          </div>

          {compat?.warnings?.length ? (
            <div className="panel mt-4 border-oxide-400/30 p-4">
              <p className="font-display text-[0.6875rem] uppercase tracking-widest text-oxide-400">
                Noted at upload
              </p>
              <ul className="mt-2 space-y-1 text-sm text-steel-400">
                {compat.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {compat?.levels?.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-display text-xs uppercase tracking-widest text-steel-500 hover:text-steel-300">
                {compat.levels.length} level
                {compat.levels.length === 1 ? "" : "s"} inside
              </summary>
              <ul className="mt-3 space-y-1.5 text-sm">
                {compat.levels.map((level) => (
                  <li key={level.path} className="flex justify-between gap-4">
                    <span className="font-mono text-steel-300">{level.path}</span>
                    <span className="shrink-0 text-xs text-steel-500">
                      version {level.version}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* --- Description --- */}
      {item.description ? (
        <section className="mt-10 max-w-2xl">
          <h2 className="font-display text-lg font-bold text-steel-100">About</h2>
          <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-steel-300">
            {item.description}
          </div>
        </section>
      ) : null}

      {/* --- Gallery --- */}
      {item.screenshots.length ? (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-steel-100">Screenshots</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {item.screenshots.map((shot) => {
              const url = publicUrl(shot.storageKey);
              if (!url) return null;
              return (
                <li key={shot.id}>
                  <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850">
                    <Image
                      src={url}
                      alt={shot.caption ?? ""}
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  {shot.caption ? (
                    <p className="mt-1.5 text-xs text-steel-500">{shot.caption}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* --- Provenance --- */}
      <section className="mt-12 border-t border-basalt-700 pt-6">
        <dl className="grid gap-5 sm:grid-cols-3">
          <Field label="Author">{item.authorName ?? "Unknown"}</Field>
          <Field label="Archived">
            {item.createdAt.toISOString().slice(0, 10)}
          </Field>
          <Field label="Downloads">{item.downloadCount.toLocaleString()}</Field>
        </dl>

        {item.tags.length ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`${meta.route}?tag=${encodeURIComponent(tag)}`}
                  className="rounded-sm border border-basalt-700 bg-basalt-850 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-steel-400 hover:text-steel-200"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
