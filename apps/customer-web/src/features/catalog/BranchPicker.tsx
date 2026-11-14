import { Link } from "react-router-dom";
import { useBranches } from "../../lib/queries";
import { IconChevron, IconPin } from "../../components/Icons";
import { ErrorCard, rise } from "../../components/States";

export function BranchPicker() {
  const { data, isLoading, isError } = useBranches();
  return (
    <main className="app-main">
      <h1 className="t-headline">Pilih cabang</h1>
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-[4.5rem]" />
          <div className="skeleton h-[4.5rem]" />
        </div>
      )}
      {isError && <ErrorCard message="Gagal memuat cabang." />}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((b, i) => (
            <li key={b.id} className="animate-rise" style={rise(i)}>
              <Link to={`/b/${b.id}`} className="list-row py-4">
                <span className="empty-state-icon">
                  <IconPin />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold tracking-tight">{b.name}</span>
                  <span className="t-label mt-0.5 block">Jangkauan {(b.service_radius_m / 1000).toFixed(1)} km</span>
                </span>
                <IconChevron className="row-arrow text-xl" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
