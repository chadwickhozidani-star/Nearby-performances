# -*- coding: utf-8 -*-
"""
飞书群机器人 Webhook 通知模块（纯标准库实现）

用法：
  import notify
  notify.send_success(...)   # 发送成功通知
  notify.send_failure(...)   # 发送失败告警

配置（环境变量）：
  FEISHU_WEBHOOK_URL     飞书群机器人 webhook 地址（必填，未配置时跳过发送）
  FEISHU_WEBHOOK_SECRET  飞书群机器人"加签"密钥（可选，机器人开启加签时必填）
  FEISHU_SITE_URL        站点访问地址（可选，展示在通知卡片中）
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request

WEBHOOK_URL = os.environ.get("FEISHU_WEBHOOK_URL", "").strip()
WEBHOOK_SECRET = os.environ.get("FEISHU_WEBHOOK_SECRET", "").strip()
SITE_URL = os.environ.get("FEISHU_SITE_URL", "").strip()


def _sign(timestamp):
    """飞书机器人加签：HMAC-SHA256(timestamp + '\\n' + secret)，Base64 输出。"""
    if not WEBHOOK_SECRET:
        return None
    string_to_sign = f"{timestamp}\n{WEBHOOK_SECRET}"
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"), digestmod=hashlib.sha256
    ).digest()
    return base64.b64encode(hmac_code).decode("utf-8")


def _post(payload):
    """发送消息到飞书 webhook，返回 (ok, message)。"""
    if not WEBHOOK_URL:
        return False, "未配置 FEISHU_WEBHOOK_URL，跳过发送"

    timestamp = str(int(time.time()))
    sign = _sign(timestamp)
    if sign:
        payload["timestamp"] = timestamp
        payload["sign"] = sign

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK_URL,
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


def send_success(stats):
    """发送抓取成功通知。stats 为字典，字段见 crawl.py 调用处。"""
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

    elements = [
        {"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(lines)}}
    ]
    return _post(_card("演唱会雷达 · 数据更新完成", "green", elements))


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
