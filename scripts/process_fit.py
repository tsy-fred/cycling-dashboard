#!/usr/bin/env python3
"""
process_fit.py — 批量处理 .fit 文件

用法：
  python3 scripts/process_fit.py <路径>     # 处理指定文件或目录
  python3 scripts/process_fit.py ./fit      # 处理 fit/ 目录
  python3 scripts/process_fit.py --check    # 仅检查不更新
"""

import json
import os
import sys
import math
from datetime import datetime, timezone

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(PROJECT_DIR, "data", "rides.json")
PARSE_SCRIPT = os.path.join(PROJECT_DIR, "scripts", "parse_fit.py")


def parse_file(fit_path):
    import subprocess
    result = subprocess.run([sys.executable, PARSE_SCRIPT, fit_path], capture_output=True, text=True)
    if result.returncode != 0:
        return {"error": result.stderr.strip() or result.stdout.strip()}
    return json.loads(result.stdout)


def main():
    args = sys.argv[1:]
    if not args:
        print("用法: python3 scripts/process_fit.py <文件或目录路径>", file=sys.stderr)
        sys.exit(1)

    check_only = "--check" in args
    paths = [a for a in args if not a.startswith("--")]

    fit_files = []
    for p in paths:
        if os.path.isfile(p) and p.endswith(".fit"):
            fit_files.append(p)
        elif os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                if f.endswith(".fit"):
                    fit_files.append(os.path.join(p, f))

    if not fit_files:
        print("📭 未找到 .fit 文件")
        return

    print(f"📂 待处理 {len(fit_files)} 个文件\n")
    parsed = []
    errors = []

    for fpath in fit_files:
        fname = os.path.basename(fpath)
        print(f"  🔄 {fname}...", end=" ")
        result = parse_file(fpath)
        if "error" in result:
            print(f"❌ {result['error']}")
            errors.append(fname)
        else:
            print(f"✓ {result['distance_km']}km")
            result["filename"] = fname
            parsed.append(result)

    if errors:
        print(f"\n❌ {len(errors)} 个文件解析失败")
    if parsed:
        print(f"\n✅ {len(parsed)} 个文件解析成功")
        print("请在看板页面中上传使用，或手动查看解析结果。")


if __name__ == "__main__":
    main()
