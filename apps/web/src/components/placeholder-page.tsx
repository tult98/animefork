export function PlaceholderPage({ name }: { name: string }) {
  return (
    <section className="px-(--pad) py-16" data-testid={`page:${name}`}>
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-muted">Not built yet.</p>
    </section>
  );
}
