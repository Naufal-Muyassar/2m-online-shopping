import { Link } from "react-router-dom";
import { useBranches } from "../../lib/queries";

export function BranchPicker() {
  const { data, isLoading, isError } = useBranches();
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Pilih cabang</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {isError && <p className="text-sm text-destructive">Gagal memuat cabang.</p>}
      <ul className="space-y-2">
        {data?.map((b) => (
          <li key={b.id}>
            <Link to={`/b/${b.id}`} className="block rounded-lg border p-4 hover:bg-secondary">
              <span className="font-medium">{b.name}</span>
              <span className="block text-sm text-muted-foreground">Jangkauan {(b.service_radius_m / 1000).toFixed(1)} km</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
