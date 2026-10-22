import { location, type GeoFix } from "@/platform";

export class LocationError extends Error {}

// Every status action needs a fresh fix; denied or timed out blocks the action.
export async function getFreshFix(): Promise<GeoFix> {
  try {
    return await location.getCurrentPosition();
  } catch (err) {
    const code = (err as GeolocationPositionError | undefined)?.code;
    if (code === 1) {
      throw new LocationError("Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser, lalu coba lagi.");
    }
    throw new LocationError("Lokasi tidak ditemukan (waktu habis). Pastikan GPS aktif lalu coba lagi.");
  }
}
