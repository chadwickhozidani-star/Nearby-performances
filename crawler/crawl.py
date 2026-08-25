# -*- coding: utf-8 -*-
"""
演唱会雷达 - 每日爬虫主脚本

- 数据源：大麦网 H5 端 mtop 接口（免费、无鉴权、纯 Python 调用）
- 逻辑：
  1. 获取城市列表（全部 + 热门）
  2. 对每个目标城市 × 演出分类，抓取演出列表
  3. 过滤"未来三个月"内的演出
  4. 去重合并，写入 data/events.json + data/meta.json

用法：
  python crawl.py                # 抓取全部热门城市（默认）
  python crawl.py --cities 北京 上海   # 指定城市
  python crawl.py --categories 演唱会 音乐节   # 指定分类
"""
import argparse
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from damai import DamaiClient, CATEGORIES, CATEGORY_PATTERN
import notify

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

# 默认抓取的热门城市（可按需调整）
DEFAULT_CITIES = [
    "北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "武汉",
    "天津", "沈阳", "西安", "苏州", "重庆", "长沙", "郑州", "青岛",
]

# 默认抓取分类（演出相关，排除体育/儿童/展览等，可按需调整）
DEFAULT_CATEGORIES = ["演唱会", "音乐节", "Livehouse", "话剧音乐剧", "脱口秀", "相声曲艺", "音乐会", "舞蹈舞剧", "沉浸式演出"]


def parse_show_time(show_time_str):
    """解析大麦 showTime 字符串，返回最早的日期 datetime 或 None。
    支持格式：2026.08.29 周六 19:00 / 2026.10.06-10.11 / 2026.08.29 / 08月26日 12:18开抢"""
    if not show_time_str:
        return None
    s = show_time_str.strip()
    m = re.search(r"(\d{4})[.年](\d{1,2})[.月](\d{1,2})", s)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    # 跨年格式：2026.12.30-2027.01.02
    m2 = re.search(r"(\d{4})[.](\d{1,2})[.](\d{1,2})\s*-\s*(\d{4})[.](\d{1,2})[.](\d{1,2})", s)
    if m2:
        try:
            return datetime(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
        except ValueError:
            return None
    return None


def in_next_three_months(show_time_str, now=None):
    """判断演出是否在未来三个月内（含已开演但仍在售的场次：用 showTime 起始日期判断）。"""
    now = now or datetime.now()
    dt = parse_show_time(show_time_str)
    if dt is None:
        # 无法解析日期的，保留（如"待定"），标记为未知
        return True, "unknown"
    end = now + timedelta(days=93)  # 约三个月
    # 演出开始日期在 [now-1天, now+93天] 内视为未来三个月
    if dt < now - timedelta(days=1):
        return False, "past"
    if dt > end:
        return False, "future"
    return True, "ok"


def dedup(items):
    """按演出 id 去重（同一演出可能出现在多个分类/多次请求中）。"""
    seen = {}
    for it in items:
        iid = it.get("id")
        if not iid:
            continue
        if iid not in seen:
            seen[iid] = it
    return list(seen.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cities", nargs="*", default=None, help="指定城市名列表，默认热门城市")
    parser.add_argument("--categories", nargs="*", default=None, help="指定分类列表，默认演出相关分类")
    parser.add_argument("--all-cities", action="store_true", help="抓取全部城市（耗时较长）")
    parser.add_argument("--output", default=None, help="输出目录，默认 ../data")
    args = parser.parse_args()

    global DATA_DIR
    if args.output:
        DATA_DIR = args.output
    os.makedirs(DATA_DIR, exist_ok=True)

    client = DamaiClient()
    print("[1/3] 获取城市列表 ...")
    cities_map, hot_cities = client.get_cities()
    print(f"      共 {len(cities_map)} 个城市，热门 {len(hot_cities)} 个")

    if args.all_cities:
        target_cities = list(cities_map.values())
    elif args.cities:
        target_cities = args.cities
    else:
        target_cities = DEFAULT_CITIES

    # 校验城市名
    name_to_id = {v: k for k, v in cities_map.items()}
    valid_cities = []
    for c in target_cities:
        if c in name_to_id:
            valid_cities.append((c, name_to_id[c]))
        else:
            print(f"  ! 未找到城市: {c}")
    if not valid_cities:
        print("没有有效的城市，退出")
        sys.exit(1)
    print(f"      实际抓取 {len(valid_cities)} 个城市: {[c[0] for c in valid_cities]}")

    categories = args.categories or DEFAULT_CATEGORIES
    print(f"[2/3] 抓取演出数据（分类: {categories}）...")

    all_items = []
    failed_parts = []
    now = datetime.now()
    for city_name, city_id in valid_cities:
        for cat in categories:
            cat_id = CATEGORIES[cat]
            try:
                items = client.get_category_items(city_id, cat_id)
            except Exception as e:
                print(f"  ! {city_name}/{cat} 抓取失败: {e}")
                failed_parts.append(f"{city_name}/{cat}")
                time.sleep(2)
                continue
            for it in items:
                it["city"] = city_name
                it["category"] = cat
            kept = []
            for it in items:
                ok, flag = in_next_three_months(it.get("showTime", ""), now)
                if ok:
                    it["_date_flag"] = flag
                    kept.append(it)
            print(f"  {city_name}/{cat}: 抓取 {len(items)} 条，三个月内 {len(kept)} 条")
            all_items.extend(kept)
            time.sleep(random.uniform(0.5, 1.5))  # 控制频率，避免触发风控

    # 去重
    unique = dedup(all_items)
    # 移除内部标记字段
    for it in unique:
        it.pop("_date_flag", None)
    print(f"[3/3] 合并去重后共 {len(unique)} 条")

    # 按日期排序（未知日期的放最后）
    def sort_key(it):
        dt = parse_show_time(it.get("showTime", ""))
        return dt.timestamp() if dt else 9999999999

    unique.sort(key=sort_key)

    # 写入文件
    events_path = os.path.join(DATA_DIR, "events.json")
    meta_path = os.path.join(DATA_DIR, "meta.json")
    payload = {
        "generatedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "dateRange": {
            "start": now.strftime("%Y-%m-%d"),
            "end": (now + timedelta(days=93)).strftime("%Y-%m-%d"),
        },
        "source": "大麦网 (damai.cn)",
        "count": len(unique),
        "events": unique,
    }
    with open(events_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    meta = {
        "generatedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "cities": valid_cities,
        "categories": categories,
        "source": "大麦网 (damai.cn)",
        "count": len(unique),
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"完成！已写入 {events_path}（{len(unique)} 条）")

    # 发送飞书通知（未配置 webhook 时静默跳过）
    from collections import Counter
    cat_summary = "、".join(
        f"{k} {v}" for k, v in sorted(Counter(it.get("category") for it in unique).items())
    )
    stats = {
        "city_count": len(valid_cities),
        "cities": "、".join(c[0] for c in valid_cities),
        "total": len(unique),
        "category_summary": cat_summary,
        "date_range": f"{now.strftime('%Y-%m-%d')} ~ {(now + timedelta(days=93)).strftime('%Y-%m-%d')}",
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "failed": "、".join(failed_parts) if failed_parts else "",
    }
    ok, msg = notify.send_success(stats)
    print(f"飞书通知: {msg}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"抓取流程异常: {e}")
        import traceback
        traceback.print_exc()
        notify.send_failure(str(e))
        sys.exit(1)
