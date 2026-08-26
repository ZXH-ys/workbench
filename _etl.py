import xlrd, csv, os

BASE = r"D:/桌面/工作台测试数据/学生成绩/26.4.21期中"
HE = os.path.join(BASE, "折合后全县排名(全部）(2).xls")
OUT = os.path.join(BASE, "merged_26.4.21期中_导入用.csv")

SUBJ = ["语文", "数学", "英语", "政治", "物理"]

def cell_num(v):
    if v == "" or v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None

def fmt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return int(v)
    return v

# ---- parse single xls (full school) ----
wb = xlrd.open_workbook(HE, encoding_override="gbk")
sh = wb.sheet_by_index(0)
rows = []
for r in range(1, sh.nrows):
    name = str(sh.cell_value(r, 1)).replace("\n", "").strip()
    if not name:
        continue
    yb = cell_num(sh.cell_value(r, 3))  # 原班级
    rec = {
        "姓名": name,
        "班级": f"{int(yb)}班" if yb is not None else "",
        "语文": cell_num(sh.cell_value(r, 4)),
        "数学": cell_num(sh.cell_value(r, 5)),
        "英语": cell_num(sh.cell_value(r, 6)),
        "政治": cell_num(sh.cell_value(r, 7)),
        "物理": cell_num(sh.cell_value(r, 8)),
        "总分": cell_num(sh.cell_value(r, 9)),
        "校次": cell_num(sh.cell_value(r, 10)),
        "县次": cell_num(sh.cell_value(r, 11)),
    }
    rows.append(rec)

# ---- compute single-subject 校次 across all students with a score ----
def compute_ranks(idx):
    pairs = [(i, rows[i][SUBJ[idx]]) for i in range(len(rows)) if rows[i][SUBJ[idx]] is not None]
    pairs.sort(key=lambda x: -x[1])
    res = [None] * len(rows)
    i = 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][1] == pairs[i][1]:
            j += 1
        rk = i + 1
        for k in range(i, j + 1):
            res[pairs[k][0]] = rk
        i = j + 1
    return res

ranks = {s: compute_ranks(i) for i, s in enumerate(SUBJ)}
for i, rec in enumerate(rows):
    for s in SUBJ:
        rec[s + "校次"] = ranks[s][i]

# ---- write CSV (utf-8-sig for Excel) ----
cols = ["姓名", "班级", "语文", "数学", "英语", "政治", "物理", "总分", "校次", "县次",
        "语文校次", "数学校次", "英语校次", "政治校次", "物理校次"]
with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for rec in rows:
        w.writerow({c: fmt(rec.get(c)) for c in cols})

# ---- report ----
print("总行数:", len(rows))
print("班级分布:", {c: sum(1 for r in rows if r["班级"] == c) for c in sorted(set(r["班级"] for r in rows))})
print("9班:", sum(1 for r in rows if r["班级"] == "9班"), " 10班:", sum(1 for r in rows if r["班级"] == "10班"))
print("样例 秦瑞泽 -> 语文", rows[0]["语文"], "语文校次", rows[0]["语文校次"], "总分校次", rows[0]["校次"], "县次", rows[0]["县次"])
print("已写出:", OUT)
