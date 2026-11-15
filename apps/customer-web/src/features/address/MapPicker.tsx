import { MapPicker as SharedMapPicker, type LatLng } from "@2m/map";

export type { LatLng };

interface Props {
  branch: LatLng & { radiusM: number };
  value: LatLng | null;
  onChange: (p: LatLng) => void;
}

// The address pin picker: the branch's service circle stays put while the customer places the pin.
export function MapPicker({ branch, value, onChange }: Props) {
  return (
    <SharedMapPicker
      area={branch}
      value={value}
      onChange={onChange}
      ariaLabel="Peta pin alamat"
      className="isolate h-72 w-full overflow-hidden rounded-lg border border-border lg:h-full lg:min-h-[26rem]"
    />
  );
}
