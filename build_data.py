"""Export a browser-readable edition from the verified research package."""

from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import json
import re
import sys
from urllib.parse import urlsplit

SCHOOL_SITES = {
    "哈尔滨工业大学": "https://www.hit.edu.cn/",
    "国防科技大学": "https://www.nudt.edu.cn/",
    "西北农林科技大学": "https://www.nwsuaf.edu.cn/",
    "兰州大学": "https://www.lzu.edu.cn/",
    "湖南大学": "https://www.hnu.edu.cn/",
    "中国人民大学": "https://www.ruc.edu.cn/",
    "中国海洋大学": "https://www.ouc.edu.cn/",
    "东南大学": "https://www.seu.edu.cn/",
    "山东大学": "https://www.sdu.edu.cn/",
    "中山大学": "https://www.sysu.edu.cn/",
    "北京师范大学": "https://www.bnu.edu.cn/",
    "南京大学": "https://www.nju.edu.cn/",
    "厦门大学": "https://www.xmu.edu.cn/",
    "大连理工大学": "https://www.dlut.edu.cn/",
    "西安交通大学": "https://www.xjtu.edu.cn/",
    "东北大学": "https://www.neu.edu.cn/",
    "北京大学": "https://www.pku.edu.cn/",
    "西北工业大学": "https://www.nwpu.edu.cn/",
    "中国农业大学": "https://www.cau.edu.cn/",
    "同济大学": "https://www.tongji.edu.cn/",
    "华中科技大学": "https://www.hust.edu.cn/",
    "四川大学": "https://www.scu.edu.cn/",
    "南开大学": "https://www.nankai.edu.cn/",
}


def read_rows(package, name):
    with (package / "data" / f"{name}.jsonl").open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream]


def by_speech(rows):
    result = defaultdict(list)
    for row in rows:
        result[row["gt_id"]].append(row)
    return result


def browser_json(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def source_url(link):
    if not link or any(c.isspace() for c in link):
        return None
    try:
        parsed = urlsplit(link)
        return link if parsed.scheme in ("https", "http") and parsed.hostname else None
    except ValueError:
        return None


def export(package):
    target = Path(__file__).parent / "data"
    document_target = target / "documents"
    document_target.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
    book = json.loads((package / "docs/codebook.G1.1.json").read_text(encoding="utf-8"))
    sources = {row["gt_id"]: row for row in read_rows(package, "sources")}
    segments = by_speech(read_rows(package, "segments"))
    markers = by_speech(read_rows(package, "markers"))
    relations = by_speech(row for row in read_rows(package, "relations") if row["active"])

    catalog = []
    fragments = []
    written = set()
    for doc in read_rows(package, "documents"):
        key = doc["gt_id"]
        if not re.fullmatch(r"GT\d{4}[A-Z]?", key):
            raise ValueError(f"无效的致辞编号 {key}")
        source = sources[key]
        school_url = SCHOOL_SITES.get(doc["school"])
        if doc["collection_status"] == "missing" and not school_url:
            raise ValueError(f"缺少学校网址 {doc['school']}")

        item = {
            "id": key, "school": doc["school"], "cohort": doc["cohort_year"],
            "year": doc["speech_year"], "yearStatus": doc["speech_year_status"],
            "speaker": doc["speaker"], "audience": doc["audience"],
            "count": doc["nonspace_character_count"], "status": doc["collection_status"],
            "schoolUrl": school_url,
        }
        catalog.append(item)
        if not doc["text_path"]:
            continue

        raw = (package / doc["text_path"]).read_bytes()
        if sha256(raw).hexdigest() != doc["text_sha256"]:
            raise ValueError(f"正文校验失败 {key}")
        text = raw.decode("utf-8")
        detail = {
            "text": text,
            "source": {
                "title": source["recorded_source_title"], "collectionUrl": source_url(source["collection_url"]),
                "verifiedUrl": source_url(source["verification_url"]), "verification": source["verification_status"],
                "basis": source["basis_note"], "yearBasis": doc["speech_year_basis"],
            },
            "segments": [], "markers": [], "relations": [],
        }
        for row in segments[key]:
            start, end = row["start"], row["end"]
            assert text[start:end] == row["text"]
            detail["segments"].append({
                "id": row["segment_id"], "code": row["step_code"], "move": row["move_code"],
                "instance": row["move_instance_id"], "start": start, "end": end,
                "evidence": row["evidence"], "review": row["review_status"], "status": row["segment_status"],
            })
            fragments.append([key, row["segment_id"], row["step_code"], row["text"]])
        for row in markers[key]:
            start, end = row["start"], row["end"]
            assert text[start:end] == row["text"]
            detail["markers"].append({
                "id": row["marker_id"], "code": row["marker_code"], "start": start, "end": end,
                "quote": row["text"], "scope": row["scope"], "evidence": row["evidence"],
                "review": row["code_review"], "scopeReview": row["scope_review"],
            })
            fragments.append([key, row["marker_id"], row["marker_code"], row["text"]])
        for row in relations[key]:
            detail["relations"].append({
                "source": row["source_id"], "target": row["target_id"], "type": row["relation_type"],
            })

        filename = document_target / f"{key}.js"
        filename.write_text(f"window.speechData[{browser_json(key)}]={browser_json(detail)};\n", encoding="utf-8")
        written.add(filename.name)

    for exported in document_target.glob("GT*.js"):
        if exported.name not in written:
            exported.unlink()

    codes = {row["code"]: row["name"] for row in book["steps"] + book["org"]}
    moves = {
        row["parent"].split(" ", 1)[0]: row["parent"].split(" ", 1)[1] for row in book["steps"]
    }
    catalog.sort(key=lambda row: (-row["cohort"], row["id"]))
    order = {row["id"]: index for index, row in enumerate(catalog)}
    fragments.sort(key=lambda row: (order[row[0]], row[1]))
    counts = manifest["counts"]
    assert len(catalog) == counts["all_records"]
    assert len(written) == counts["main"] + counts["supplement"]
    assert len(fragments) == counts["segments"] + counts["markers"]

    index = {
        "version": manifest["version"], "documents": catalog, "codes": codes,
        "moves": moves, "statistics": counts,
    }
    (target / "catalog.js").write_text(f"window.corpus={browser_json(index)};\n", encoding="utf-8")
    (target / "fragments.js").write_text(f"window.fragments={browser_json(fragments)};\n", encoding="utf-8")
    print(f"{len(catalog)} 条目录，{len(written)} 篇全文，{len(fragments)} 条片段与标记")


if __name__ == "__main__":
    export(Path(sys.argv[1]).resolve())
