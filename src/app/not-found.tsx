import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-28 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        Nothing here
      </h1>
      <p className="mt-4 text-steel-400">
        That page does not exist, or has not been built yet. Most of the site
        arrives over the next few weeks.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
      >
        Back to the front
      </Link>
    </div>
  );
}
