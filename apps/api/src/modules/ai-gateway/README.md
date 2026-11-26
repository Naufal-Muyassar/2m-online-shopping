# ai-gateway

Satu-satunya pintu aplikasi ke ml-api. Route: `POST /api/v1/assistant/ask`, `GET /api/v1/assistant/history` (wajib login).

- Data pribadi disamarkan (`mask.ts`) sebelum dikirim ke ml-api dan sebelum disimpan. Penyamarannya heuristik: nama dan alamat milik akun, email, kode pesanan, nomor 8 digit ke atas, pola alamat. Nama orang lain yang tidak berpola bisa lolos.
- Batas harian (hari WIB) dihitung dari `llm_usage`; semua percobaan yang diteruskan dihitung, termasuk yang gagal.
- Timeout tidak diulang. Galat jaringan dan 5xx diulang sekali.

| Env | Default | Arti |
|---|---|---|
| `ML_API_URL`, `ML_API_KEY` | kosong | Kosong berarti `AI_UNAVAILABLE` |
| `ML_API_TIMEOUT_MS` | 8000 | Batas satu panggilan |
| `ASSISTANT_DAILY_LIMIT_PER_USER` | 20 | Pertanyaan per pengguna per hari |
| `ASSISTANT_DAILY_LIMIT_GLOBAL` | 500 | Pertanyaan semua pengguna per hari |

Kode galat: `AI_INPUT_TOO_LONG` (413), `AI_BUDGET_EXCEEDED` (429, `details.scope`: `user`, `global`, `service`), `AI_UNAVAILABLE` (503), `AI_TIMEOUT` (504).
