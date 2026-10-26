import { Link } from "react-router-dom";
import { useBranches } from "../../lib/queries";
import { IconChevron, IconPin } from "../../components/Icons";
import { ErrorCard, rise } from "../../components/States";

export function BranchPicker() {
  const { data, isLoading, isError } = useBranches();
  return (
    <main className="app-main">
      <h1 className="text-2xl font-bold">Pilih cabang</h1>
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-20 rounded-lg" />
          <div className="skeleton h-20 rounded-lg" />
        </div>
      )}
      {isError && <ErrorCard message="Gagal memuat cabang." />}
      <ul className="space-y-3">
        {data?.map((b, i) => (
          <li key={b.id}>
            <Link to={`/b/${b.id}`} className="card card-link flex animate-rise items-center gap-3" style={rise(i)}>
              <span className="empty-state-icon shrink-0">
                <IconPin />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{b.name}</span>
                <span className="block text-sm text-muted-foreground">Jangkauan {(b.service_radius_m / 1000).toFixed(1)} km</span>
              </span>
              <IconChevron className="shrink-0 text-xl text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
