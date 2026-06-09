#!/usr/bin/env python3
"""清理 __processed__ 目录中的重复 .fit 文件"""
import os, hashlib

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(PROJECT, "__processed__")

if __name__ == "__main__":
    if not os.path.isdir(PROCESSED_DIR):
        print("📭 __processed__/ 目录不存在")
        sys.exit(0)

    by_hash = {}
    for f in sorted(os.listdir(PROCESSED_DIR)):
        fpath = os.path.join(PROCESSED_DIR, f)
        if not os.path.isfile(fpath) or not f.endswith(".fit"):
            continue
        with open(fpath, "rb") as fh:
            h = hashlib.md5(fh.read()).hexdigest()
        if h in by_hash:
            os.remove(fpath)
            print(f"  🗑️ 删除重复: {f} = {by_hash[h]}")
        else:
            by_hash[h] = f
    print(f"✅ 清理完成，剩余 {len(by_hash)} 个文件")
