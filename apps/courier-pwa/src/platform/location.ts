export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface LocationProvider {
  getCurrentPosition(opts?: { maximumAge?: number }): Promise<GeoFix>;
}
