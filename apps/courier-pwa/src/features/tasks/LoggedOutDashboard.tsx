import { SideBarNavigation } from "@/components/SideBarNavigation";
import { FaArrowUp, FaBoxOpen, FaUser } from "react-icons/fa";

export function LoggedOutDashboard() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col p-4">
      <header className="flex items-center gap-3">
        <SideBarNavigation isLoggedIn={false} pending={false} onToggleStatus={() => undefined} />
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">2M Kurir</p>
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-10 text-center" aria-labelledby="login-prompt-title">
        <div className="mb-5 flex size-20 items-center justify-center rounded-full bg-secondary text-4xl text-muted-foreground">
          <FaBoxOpen aria-hidden="true" />
        </div>
        <h2 id="login-prompt-title" className="max-w-xs text-2xl font-bold">
          Siap mulai bertugas?
        </h2>
        <p className="mt-2 max-w-sm text-base text-muted-foreground">
          Masuk ke akun kurir untuk melihat pesanan dan mengaktifkan status bekerja.
        </p>

        <div className="mt-8 w-full max-w-sm rounded-lg border border-border p-4 text-left">
          <h3 className="mb-3 font-semibold">Cara masuk</h3>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-bold">1</span>
              <span className="pt-1">Ketuk ikon profil di pojok kiri atas.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-bold">2</span>
              <span className="pt-1">Pilih <strong>Profil</strong> dari menu.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-bold">3</span>
              <span className="pt-1">Tekan <strong>Masuk</strong>, lalu isi nomor telepon dan kata sandi.</span>
            </li>
          </ol>
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-foreground">
          <FaArrowUp aria-hidden="true" />
          <FaUser aria-hidden="true" />
          <span>Mulai dari ikon profil di atas</span>
        </div>
      </section>
    </main>
  );
}