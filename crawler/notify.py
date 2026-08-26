# -*- coding: utf-8 -*-
"""
飞书群机器人 Webhook 通知模块（纯标准库实现，支持多 webhook）

用法：
  import notify
  notify.send_success(...)   # 发送成功通知
  notify.send_failure(...)   # 发送失败告警

配置方式（优先级从高到低）：
1. 多 webhook 配置文件：与 notify.py 同目录的 webhooks.json
   {
     "webhooks": [
       {"name": "运营群", "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx", "secret": "", "enabled": true,
        "cities": ["深圳"], "artists": ["邓紫棋"], "match": "all"},
       {"name": "告警群", "url": "https://open.feishu.cn/open-apis/bot/v2/hook/yyy", "secret": "加签密钥", "enabled": true}
     ]
   }
   - name:    群备注名（展示在通知卡片标题中，可不填）
   - url:     飞书群机器人 webhook 地址（必填）
   - secret:  机器人"加签"密钥（可选，开启加签时填）
   - enabled: 是否启用该 webhook（可选，默认 true）
   - cities:  关注的演出城市列表（可选，空=全部城市）
   - artists: 关注的艺人列表（可选，空=全部艺人）
   - match:   条件匹配模式（可选，"any"=命中任一条件即推送，默认；"all"=城市和艺人同时命中才推送）
2. 环境变量（单 webhook，兼容旧配置）：
   FEISHU_WEBHOOK_URL     飞书群机器人 webhook 地址
   FEISHU_WEBHOOK_SECRET  加签密钥（可选）
3. FEISHU_SITE_URL 站点访问地址（可选，展示在通知卡片中）
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
WEBHOOK_CONFIG_FILE = os.path.join(_HERE, "webhooks.json")
SITE_URL = os.environ.get("FEISHU_SITE_URL", "").strip()


def _load_webhooks():
    """加载 webhook 列表：优先 webhooks.json，否则回退环境变量。"""
    config_path = WEBHOOK_CONFIG_FILE
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            hooks = []
            for item in data.get("webhooks", []):
                if not isinstance(item, dict):
                    continue
                url = str(item.get("url", "")).strip()
                if not url:
                    continue
                if item.get("enabled", True) is False:
                    continue
                hooks.append(
                    {
                        "name": str(item.get("name", "")).strip(),
                        "url": url,
                        "secret": str(item.get("secret", "")).strip(),
                        "cities": [str(c).strip() for c in item.get("cities", []) if str(c).strip()],
                        "artists": [str(a).strip() for a in item.get("artists", []) if str(a).strip()],
                        "match": "all" if str(item.get("match", "any")).strip() == "all" else "any",
                    }
                )
            if hooks:
                return hooks, config_path
        except Exception as e:
            print(f"[notify] 读取 webhooks.json 失败，回退环境变量: {e}")

    url = os.environ.get("FEISHU_WEBHOOK_URL", "").strip()
    if url:
        return [
            {
                "name": "",
                "url": url,
                "secret": os.environ.get("FEISHU_WEBHOOK_SECRET", "").strip(),
                "cities": [],
                "artists": [],
                "match": "any",
            }
        ], "环境变量 FEISHU_WEBHOOK_URL"
    return [], ""


def _sign(secret, timestamp):
    """飞书机器人加签：HMAC-SHA256(timestamp + '\\n' + secret)，Base64 输出。"""
    if not secret:
        return None
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"), digestmod=hashlib.sha256
    ).digest()
    return base64.b64encode(hmac_code).decode("utf-8")


def _post_one(hook, payload):
    """发送消息到单个飞书 webhook，返回 (ok, message)。"""
    timestamp = str(int(time.time()))
    sign = _sign(hook["secret"], timestamp)
    if sign:
        payload["timestamp"] = timestamp
        payload["sign"] = sign

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        hook["url"],
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if result.get("code") == 0:
            return True, "发送成功"
        return False, f"飞书返回错误: {result}"
    except Exception as e:
        return False, f"请求异常: {e}"


def _post(payload):
    """发送消息到所有已配置 webhook，返回 (ok, 汇总消息)。"""
    hooks, source = _load_webhooks()
    if not hooks:
        return False, "未配置任何 webhook（webhooks.json 或 FEISHU_WEBHOOK_URL），跳过发送"

    results = []
    for hook in hooks:
        ok, msg = _post_one(hook, payload)
        label = hook["name"] or hook["url"]
        results.append((label, ok, msg))
        print(f"[notify] webhook [{label}] -> {msg}")

    ok = all(r[1] for r in results)
    summary = "; ".join(f"{r[0]}: {r[2]}" for r in results)
    return ok, summary


def list_webhooks():
    """返回当前生效的 webhook 配置摘要（用于展示）。"""
    hooks, source = _load_webhooks()
    if not hooks:
        return "未配置任何 webhook"
    lines = [f"配置来源：{source}", f"共 {len(hooks)} 个 webhook："]
    for i, h in enumerate(hooks, 1):
        lines.append(f"{i}. {h['name'] or '未命名'} | {h['url']}" + ("（加签）" if h["secret"] else ""))
    return "\n".join(lines)


def _card(title, template, elements):
    """构造飞书 interactive 卡片消息。"""
    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": template,
            },
            "elements": elements,
        },
    }


def _match_event(hook, e):
    """判断单场演出是否命中某个 webhook 的监控条件。

    条件字段为空表示"不限制"（例如 cities 为空=关注全部城市）。
    match=all 时城市和艺人需同时命中；match=any（默认）时命中任一即可。
    艺人名兼容别名/组合写法（如 "G.E.M.邓紫棋" 匹配 "邓紫棋"）。
    """
    city = str(e.get("city", "") or e.get("cityName", "") or "").strip()
    artist_terms = []
    for a in e.get("artists") or []:
        for part in re.split(r"[;；,，、/]", str(a)):
            part = part.strip()
            if part:
                artist_terms.append(part)

    city_hit = city in hook["cities"] if hook["cities"] else None
    artist_hit = None
    if hook["artists"]:
        artist_hit = any(
            (term in target) or (target in term)
            for term in artist_terms
            for target in hook["artists"]
        )

    # 无任何条件：全部命中
    if city_hit is None and artist_hit is None:
        return True
    if hook["match"] == "all":
        return (city_hit is None or city_hit) and (artist_hit is None or artist_hit)
    hits = [x for x in (city_hit, artist_hit) if x is not None]
    return any(hits)


def _filter_events(hook, events):
    """按 webhook 条件过滤演出列表，返回命中的演出。"""
    return [e for e in events if _match_event(hook, e)]


def _event_line(e, idx=None):
    """将一场演出格式化为飞书消息文本行。"""
    name = str(e.get("name", "")).strip()
    city = str(e.get("city", "") or e.get("cityName", "") or "").strip()
    show_time = str(e.get("showTime", "") or "").strip()
    venue = str(e.get("venueName", "") or "").strip()
    price = str(e.get("priceStr", "") or "").strip()
    artists = "、".join([str(a) for a in (e.get("artists") or [])][:3])
    prefix = f"{idx}. " if idx is not None else ""
    parts = [prefix, name]
    if city:
        parts.append(f"📍{city}")
    if show_time:
        parts.append(show_time)
    if artists:
        parts.append(artists)
    if venue:
        parts.append(venue)
    if price:
        parts.append(f"¥{price}")
    line = " ｜ ".join(parts)
    schema = str(e.get("schema", "") or "").strip()
    if schema:
        line += f"\n    [查看详情]({schema})"
    return line


def send_success(stats, events=None):
    """发送抓取成功通知。stats 为字典，字段见 crawl.py 调用处。

    events 可选：传入去重后的演出列表时，每个 webhook 会按自己的
    cities/artists/match 条件过滤后单独推送匹配演出；未配置任何条件的
    webhook 保持推送全局摘要（不推完整列表，避免刷屏）。
    events 为 None 时保持旧行为，所有 webhook 只收全局摘要。
    """
    lines = [
        f"**抓取城市**：{stats['city_count']} 个（{stats['cities']}）",
        f"**演出总数**：{stats['total']} 场",
        f"**分类分布**：{stats['category_summary']}",
        f"**时间范围**：{stats['date_range']}",
        f"**数据生成**：{stats['generated_at']}",
    ]
    if stats.get("failed"):
        lines.append(f"**⚠️ 部分抓取失败**：{stats['failed']}")
    if SITE_URL:
        lines.append(f"**站点地址**：[{SITE_URL}]({SITE_URL})")

    hooks, source = _load_webhooks()
    if not hooks:
        return False, "未配置任何 webhook（webhooks.json 或 FEISHU_WEBHOOK_URL），跳过发送"

    results = []
    for hook in hooks:
        label = hook["name"] or hook["url"]
        if events is not None and (hook["cities"] or hook["artists"]):
            matched = _filter_events(hook, events)
            if not matched:
                results.append((label, True, "无匹配演出，跳过"))
                print(f"[notify] webhook [{label}] -> 无匹配演出，跳过")
                continue
            cap = 20
            shown = matched[:cap]
            content = "\n".join(lines)
            content += f"\n**🔔 关注演出（{len(matched)} 场）**：\n"
            content += "\n".join(_event_line(e, i + 1) for i, e in enumerate(shown))
            if len(matched) > cap:
                content += f"\n… 等共 {len(matched)} 场，请到站点查看完整列表"
            elements = [{"tag": "div", "text": {"tag": "lark_md", "content": content}}]
            ok, msg = _post_one(hook, _card("演唱会雷达 · 关注演出更新", "green", elements))
        else:
            elements = [{"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(lines)}}]
            ok, msg = _post_one(hook, _card("演唱会雷达 · 数据更新完成", "green", elements))
        results.append((label, ok, msg))
        print(f"[notify] webhook [{label}] -> {msg}")

    ok = all(r[1] for r in results)
    summary = "; ".join(f"{r[0]}: {r[2]}" for r in results)
    return ok, summary


def send_failure(error):
    """发送抓取失败告警。error 为错误描述。"""
    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**错误信息**：{error}",
            },
        }
    ]
    return _post(_card("演唱会雷达 · 数据抓取失败", "red", elements))


if __name__ == "__main__":
    # 自测：python notify.py
    ok, msg = _post(
        _card("演唱会雷达 · 通知测试", "blue", [{"tag": "div", "text": {"tag": "lark_md", "content": "测试消息，收到即配置成功。"}}])
    )
    print(msg)
