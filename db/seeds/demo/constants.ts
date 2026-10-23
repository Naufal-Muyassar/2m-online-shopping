// EDIT BEFORE DEMO: placeholder coordinates and credentials.
export const BRANCH = {
  name: "Cabang Demo",
  lat: -6.2,
  lng: 106.8166,
  serviceRadiusM: 5000,
  erpBranchId: "DEMO-01",
  courierCapacity: 3,
};

export const DEMO_PASSWORD = "demo1234";

export const USERS = {
  superAdmin: { name: "Super Admin", phone: "081200000001", email: "super@2m.local" },
  branchAdmin: { name: "Admin Cabang", phone: "081200000002", email: "admin@2m.local" },
  couriers: [
    { name: "Kurir Satu", phone: "081200000011", minutesIdle: 30, motorCode: "M1", motorCluster: "A" },
    { name: "Kurir Dua", phone: "081200000012", minutesIdle: 20, motorCode: "M3", motorCluster: "B" },
    { name: "Kurir Tiga", phone: "081200000013", minutesIdle: 10, motorCode: "M5", motorCluster: "A" },
  ],
  customers: [
    {
      name: "Budi Pelanggan",
      phone: "081200000021",
      address: { street: "Jl. Melati No. 12", rtRw: "003/005", dLat: 0.008, dLng: 0.006, receiver: "Budi" },
    },
    {
      name: "Siti Pelanggan",
      phone: "081200000022",
      address: { street: "Jl. Kenanga No. 7", rtRw: "001/002", dLat: -0.01, dLng: 0.012, receiver: "Siti" },
    },
  ],
};

export const DELIVERY_FEE = 8000;

// Low and out-of-stock states stay visible in the demo: three products with 3 units, one with none.
export const DEMO_STOCK_OVERRIDES: Readonly<Record<string, number>> = {
  "GAL-19L": 3,
  "TLR-TRAY": 3,
  "SUSU-UHT": 3,
  "TSU-4": 0,
};

// Local dev origins (fixed ports, see each vite.config.ts).
export const DEMO_URLS = {
  api: "http://localhost:3000",
  customer: "http://localhost:5171",
  courier: "http://localhost:5172",
  admin: "http://localhost:5173",
  minio: "http://localhost:9001",
};

// [sku, name, unit, category, weight_kg, price]
export const PRODUCTS: ReadonlyArray<readonly [string, string, string, string, number, number]> = [
  ["BRS-5KG", "Beras Premium 5 kg", "pak", "beras", 5, 72000],
  ["BRS-10KG", "Beras Medium 10 kg", "karung", "beras", 10, 135000],
  ["GAL-19L", "Air Galon 19 L", "galon", "minuman", 19, 22000],
  ["MYK-2L", "Minyak Goreng 2 L", "pouch", "minyak", 1.8, 38000],
  ["MYK-1L", "Minyak Goreng 1 L", "pouch", "minyak", 0.9, 20000],
  ["MIE-GRG", "Mie Instan Goreng", "bungkus", "mie", 0.085, 3500],
  ["MIE-KUAH", "Mie Instan Kuah", "bungkus", "mie", 0.075, 3200],
  ["TLR-1KG", "Telur Ayam 1 kg", "kg", "telur", 1, 29000],
  ["TLR-TRAY", "Telur Ayam 1 Tray", "tray", "telur", 2, 56000],
  ["GLP-1KG", "Gula Pasir 1 kg", "kg", "bumbu", 1, 17000],
  ["GRM-250", "Garam Dapur 250 g", "pak", "bumbu", 0.25, 4000],
  ["TPG-1KG", "Tepung Terigu 1 kg", "kg", "tepung", 1, 13000],
  ["KCP-275", "Kecap Manis 275 ml", "botol", "bumbu", 0.35, 14000],
  ["SAS-340", "Saus Sambal 340 ml", "botol", "bumbu", 0.4, 12000],
  ["SUSU-UHT", "Susu UHT 1 L", "kotak", "minuman", 1.05, 18000],
  ["KOPI-165", "Kopi Bubuk 165 g", "pak", "minuman", 0.17, 11000],
  ["TEH-25", "Teh Celup isi 25", "kotak", "minuman", 0.06, 7500],
  ["SRD-KLG", "Sarden Kaleng 155 g", "kaleng", "kaleng", 0.2, 11500],
  ["KRG-KLG", "Kornet Kaleng 198 g", "kaleng", "kaleng", 0.25, 27000],
  ["SBN-BTG", "Sabun Mandi Batang", "pcs", "rumah tangga", 0.09, 4500],
  ["SBN-CCR", "Sabun Cuci Piring 800 ml", "pouch", "rumah tangga", 0.85, 15000],
  ["DTJ-800", "Deterjen Bubuk 800 g", "pak", "rumah tangga", 0.82, 19000],
  ["SMP-170", "Sampo Sachet isi 12", "renteng", "rumah tangga", 0.12, 9000],
  ["TSU-4", "Tisu Gulung isi 4", "pak", "rumah tangga", 0.4, 16000],
  ["BWM-500", "Bawang Merah 500 g", "pak", "sayur", 0.5, 22000],
  ["BWP-500", "Bawang Putih 500 g", "pak", "sayur", 0.5, 20000],
  ["CBE-250", "Cabai Rawit 250 g", "pak", "sayur", 0.25, 18000],
  ["KNT-1KG", "Kentang 1 kg", "kg", "sayur", 1, 19000],
  ["BSK-100", "Biskuit Kelapa 100 g", "pak", "snack", 0.1, 6000],
  ["KRP-200", "Kerupuk Udang 200 g", "pak", "snack", 0.2, 10000],
];

// customer = index into USERS.customers
export const DEMO_ORDERS: ReadonlyArray<{ customer: number; items: ReadonlyArray<readonly [string, number]> }> = [
  { customer: 0, items: [["BRS-5KG", 1], ["MYK-2L", 1], ["TLR-1KG", 2], ["MIE-GRG", 10]] },
  { customer: 1, items: [["GAL-19L", 2], ["GLP-1KG", 2], ["KOPI-165", 1]] },
  { customer: 0, items: [["BRS-10KG", 1], ["MYK-1L", 2], ["TLR-TRAY", 1], ["DTJ-800", 1]] },
];
