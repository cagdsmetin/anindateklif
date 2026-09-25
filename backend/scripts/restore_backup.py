"""Gecelik yedekten veritabanını geri yükler.

Yedek dosyası: Railway'de db-backups bucket'ı → Files → daily/YYYY-MM-DD.jsonl.gz
(ya da monthly/YYYY-MM.jsonl.gz) indirilir.

Kullanım:
    python scripts/restore_backup.py YEDEK.jsonl.gz --mongo-url MONGO_URL --db DB_ADI [--drop] [--only koleksiyon1,koleksiyon2]

Varsayılan olarak mevcut koleksiyonlara dokunmaz; aynı _id'li belge varsa
atlar. --drop verilirse yedekteki her koleksiyon önce boşaltılır, yani o
koleksiyonlardaki güncel veri tamamen yedekteki hâle döner. Önce boş bir
test veritabanına (--db anindateklif_restore_test) yükleyip kontrol etmek
en güvenli yoldur.
"""
import argparse
import gzip
import sys
from collections import defaultdict

from bson import json_util
from pymongo import MongoClient
from pymongo.errors import BulkWriteError


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--mongo-url", required=True)
    ap.add_argument("--db", required=True)
    ap.add_argument("--drop", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    db = MongoClient(args.mongo_url)[args.db]
    batches = defaultdict(list)
    counts = defaultdict(int)
    dropped = set()

    def flush(name):
        docs = batches.pop(name, [])
        if not docs:
            return
        if args.drop and name not in dropped:
            db[name].delete_many({})
            dropped.add(name)
        try:
            db[name].insert_many(docs, ordered=False)
        except BulkWriteError as e:
            dup = sum(1 for w in e.details.get("writeErrors", []) if w.get("code") == 11000)
            other = len(e.details.get("writeErrors", [])) - dup
            if other:
                raise
        counts[name] += len(docs)

    with gzip.open(args.file, "rt", encoding="utf-8") as fh:
        for line in fh:
            row = json_util.loads(line)
            name = row["c"]
            if only and name not in only:
                continue
            batches[name].append(row["d"])
            if len(batches[name]) >= 1000:
                flush(name)
    for name in list(batches):
        flush(name)

    for name in sorted(counts):
        print(f"{name}: {counts[name]}")
    print(f"Toplam {sum(counts.values())} belge işlendi.", file=sys.stderr)


if __name__ == "__main__":
    main()
