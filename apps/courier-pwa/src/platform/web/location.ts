import type { LocationProvider } from "../location";

export const webLocation: LocationProvider = {
  getCurrentPosition: () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        reject,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    }),
};
