"""Bangun intent_v1.csv dari dataset gabungan DS (dataset_intent_clean_pp4.csv).

Split CSV gabungan adalah split resmi (keputusan 2026-11-26). Baris test_beku tidak
diubah. Kebocoran train/test diperbaiki dengan membuang baris TRAIN yang merupakan
duplikat atau parafrase dari baris test_beku. Daftar di bawah dipilih manual dari
pasangan dengan kemiripan token (Jaccard) >= 0,45; pasangan yang hanya mirip pola
kalimat tetapi beda isi dibiarkan.

Jalankan dari root repo:  python data-science/scripts/build_intent_v1.py
Hanya library standar.
"""

import csv
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "datasets"
SRC = ROOT / "dataset_intent_clean_pp4.csv"
DST = ROOT / "intent_v1.csv"

CLASSES = {"cek_pesanan", "tanya_ongkir", "tanya_produk", "info_umum", "komplain", "di_luar_konteks"}
SPLITS = {"train", "test_beku"}

# baris train yang dibuang -> baris test_beku pasangannya
DROP_TRAIN = {
    "INT-491": "INT-236",  # duplikat persis (beda titik akhir)
    "INT-494": "INT-252",
    "INT-484": "INT-247",
    "INT-485": "INT-234",
    "INT-073": "INT-341",
    "INT-226": "INT-475",
    "INT-047": "INT-329",
    "INT-002": "INT-353",
    "INT-391": "INT-091",
    "INT-399": "INT-092",
    "INT-401": "INT-095",
    "INT-393": "INT-097",
    "INT-445": "INT-197",
    "INT-148": "INT-290",
    "INT-186": "INT-443",
}

MIN_PER_CLASS = 40


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w<> ]", "", text.lower())).strip()


def test_hash(rows: list[dict]) -> str:
    lines = sorted(f"{r['intent_id']}\t{r['text']}\t{r['intent']}" for r in rows if r["split"] == "test_beku")
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def main() -> int:
    with SRC.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in reader]

    by_id = {r["intent_id"]: r for r in rows}
    for train_id, test_id in DROP_TRAIN.items():
        assert by_id[train_id]["split"] == "train", train_id
        assert by_id[test_id]["split"] == "test_beku", test_id
        assert by_id[train_id]["intent"] == by_id[test_id]["intent"], (train_id, test_id)

    before = test_hash(rows)
    out = [r for r in rows if r["intent_id"] not in DROP_TRAIN]
    assert test_hash(out) == before, "test_beku berubah"

    errors = []
    for r in out:
        if r["intent"] not in CLASSES:
            errors.append(f"{r['intent_id']}: kelas {r['intent']!r}")
        if r["split"] not in SPLITS:
            errors.append(f"{r['intent_id']}: split {r['split']!r}")
        if not 1 <= len(r["text"]) <= 500:
            errors.append(f"{r['intent_id']}: panjang teks {len(r['text'])}")
    groups: dict[str, set] = {}
    for r in out:
        groups.setdefault(r["group_id"], set()).add(r["split"])
    errors += [f"grup {g} ada di dua split" for g, s in groups.items() if len(s) > 1]
    seen: dict[str, str] = {}
    for r in out:
        key = norm(r["text"])
        if key in seen and seen[key] != r["split"]:
            errors.append(f"{r['intent_id']}: kalimat sama di train dan test")
        seen.setdefault(key, r["split"])
    per_class = Counter(r["intent"] for r in out)
    errors += [f"kelas {c} hanya {n} baris" for c, n in per_class.items() if n < MIN_PER_CLASS]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    with DST.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(out)

    split = Counter((r["intent"], r["split"]) for r in out)
    print(f"{DST.name}: {len(out)} baris ({len(rows) - len(out)} train dibuang)")
    for c in sorted(CLASSES):
        print(f"  {c:16} train {split[(c, 'train')]:3}  test_beku {split[(c, 'test_beku')]:3}")
    print(f"sha256 test_beku: {before}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
