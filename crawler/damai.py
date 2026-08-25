# -*- coding: utf-8 -*-
"""
大麦网 H5 mtop 接口封装（纯 Python，无需浏览器）。

实现原理：
- 大麦 H5 端 (m.damai.cn) 的 mtop 接口需要 sign 签名。
- 签名算法（公开）：sign = md5(token + "&" + t + "&" + appKey + "&" + data)
- token 来自 Cookie `_m_h5_tk`（取 "_" 之前的部分），首次请求服务端会种下该 Cookie。
- 因此第一次请求会失败（token 为空），第二次请求带上 token 即可成功。
"""
import hashlib
import http.cookiejar
import json
import time
import urllib.parse
import urllib.request

APPKEY = "12574478"
BASE = "https://mtop.damai.cn/h5"

UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
)

# 演出分类映射（来自 mtop.damai.wireless.search.cms.category.get）
CATEGORIES = {
    "演唱会": "2394",
    "音乐节": "2396",
    "Livehouse": "2395",
    "话剧音乐剧": "2333",
    "脱口秀": "2416",
    "展览": "2370",
    "相声曲艺": "2368",
    "音乐会": "2346",
    "舞蹈舞剧": "2362",
    "沉浸式演出": "2360",
    "儿童亲子": "2361",
    "体育": "2384",
    "全部": "0",
}

# 各分类对应 patternName / patternVersion（来自 cms.category.get）
CATEGORY_PATTERN = {
    "2394": ("category_solo", "4.0"),
    "2396": ("category_music_festival", "4.0"),
    "2395": ("category_livehouse", "4.0"),
    "2333": ("category_drama_new", "4.2"),
    "2416": ("category_talkshow", "4.0"),
    "2370": ("category_leisure", "4.0"),
    "2368": ("category_xiangsheng", "4.0"),
    "2618": ("category_crosstalk", "4.0"),
    "2346": ("category_concert", "4.0"),
    "2362": ("category_dance", "4.0"),
    "2360": ("category_immersive", "4.0"),
    "2361": ("category_children", "4.0"),
    "2384": ("category_sport", "4.0"),
    "4478": ("category_tourism_performance", "1.0"),
    "0": ("category_all", "4.0"),
}


class DamaiClient:
    def __init__(self, timeout=15, max_retry=3):
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.opener.addheaders = [
            ("User-Agent", UA),
            ("Accept", "application/json"),
            ("Accept-Language", "zh-CN,zh;q=0.9"),
        ]
        self.timeout = timeout
        self.max_retry = max_retry

    def _token(self):
        for c in self.cj:
            if c.name == "_m_h5_tk":
                return c.value.split("_")[0]
        return ""

    def _request(self, api, data_obj, version="1.0"):
        t = str(int(time.time() * 1000))
        data_str = json.dumps(data_obj, separators=(",", ":"), ensure_ascii=False)
        token = self._token()
        sign = hashlib.md5(f"{token}&{t}&{APPKEY}&{data_str}".encode("utf-8")).hexdigest()
        params = {
            "jsv": "2.7.5",
            "appKey": APPKEY,
            "t": t,
            "sign": sign,
            "api": api,
            "v": version,
            "H5Request": "true",
            "type": "originaljson",
            "timeout": "10000",
            "dataType": "json",
            "valueType": "original",
            "forceAntiCreep": "true",
            "AntiCreep": "true",
            "data": data_str,
        }
        url = f"{BASE}/{api}/{version}/?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url)
        with self.opener.open(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8", "ignore"))

    def mtop(self, api, data_obj, version="1.0"):
        """带 token 初始化重试的请求：首次请求失败用于种 cookie，第二次成功。"""
        for attempt in range(self.max_retry):
            try:
                r = self._request(api, data_obj, version)
            except Exception as e:
                if attempt == self.max_retry - 1:
                    raise
                time.sleep(1 + attempt)
                continue
            ret = r.get("ret", [])
            if ret and "SUCCESS" in ret[0]:
                return r
            # 需要 token 或限流，重试
            if any("TOKEN" in x or "RGV587" in x or "LIMIT" in x or "frequenc" in x.lower() for x in ret):
                time.sleep(1 + attempt)
                continue
            return r
        return {"ret": ["FAIL::max_retry"], "data": {}}

    def get_cities(self):
        """获取大麦全部城市列表（cityId -> cityName）。"""
        r = self.mtop("mtop.damai.wireless.area.groupcity", {"platform": "8"}, version="1.2")
        data = r.get("data", {})
        cities = {}
        for group in data.get("groups", []):
            for site in group.get("sites", []):
                cities[str(site["cityId"])] = site["cityName"]
        # 热门城市排序在前（后续前端可用）
        hot = []
        for site in data.get("hotCity", []) or []:
            hot.append({"cityId": str(site["cityId"]), "cityName": site["cityName"]})
        return cities, hot

    def get_category_items(self, city_id, category_id, sort_type="10", max_pages=5):
        """
        获取某城市某分类下的演出列表（含完整字段，自动分页去重）。
        返回 list[dict]，字段：id/name/showTime/venueName/priceStr/cityName/verticalPic 等。
        """
        pattern_name, pattern_version = CATEGORY_PATTERN.get(str(category_id), ("category_all", "4.2"))
        base_args = {
            "comboConfigRule": "true",
            "sortType": sort_type,
            "latitude": "0",
            "longitude": "0",
            "groupId": str(category_id),
            "currentCityId": str(city_id),
            "comboCityId": str(city_id),
            "platform": "8",
            "comboChannel": "2",
            "dmChannel": "damai@damaih5_h5",
        }
        seen = {}
        for page in range(max_pages + 1):
            args = dict(base_args)
            if page > 0:
                args["pageIndex"] = page
                args["pageSize"] = 30
            data_obj = {
                "args": json.dumps(args, separators=(",", ":"), ensure_ascii=False),
                "patternName": pattern_name,
                "patternVersion": pattern_version,
                "platform": "8",
                "comboChannel": "2",
                "dmChannel": "damai@damaih5_h5",
            }
            try:
                r = self.mtop("mtop.damai.mec.aristotle.get", data_obj)
            except Exception:
                break
            data = r.get("data", {})
            items = []
            # 结构1：data.data.nodes 树（分类页新版响应）
            self._walk(data, items)
            # 结构2：data.layers[].sections[].item.nodes 树
            for layer in data.get("layers", []) or []:
                for sec in layer.get("sections", []) or []:
                    self._walk(sec.get("item"), items)
            new_count = 0
            for it in items:
                if it["id"] and it["id"] not in seen:
                    seen[it["id"]] = it
                    new_count += 1
            if page > 0 and new_count == 0:
                break
        return list(seen.values())

    def _walk(self, node, out):
        """通用深度优先遍历，提取含 id+name+时间/场馆/价格的完整演出卡片。"""
        if isinstance(node, dict):
            d = node.get("data")
            if isinstance(d, dict):
                item_id = d.get("itemId") or d.get("id")
                name = d.get("name")
                has_detail = bool(d.get("showTime") or d.get("venueName") or d.get("priceStr"))
                if item_id and name and has_detail:
                    out.append(self._normalize(d))
            for v in node.values():
                self._walk(v, out)
        elif isinstance(node, list):
            for x in node:
                self._walk(x, out)

    @staticmethod
    def _normalize(d):
        """统一字段结构。"""
        top_right = d.get("topRight") or {}
        category_name = d.get("categoryName") or d.get("guideCategoryName") or ""
        if not category_name:
            category_name = top_right.get("tag", "") if isinstance(top_right, dict) else ""
        show_tag = d.get("showTag", "")
        name = d.get("name", "")
        # 部分卡片 name 为空但 showTag 有艺人名，用 showTag 补全
        if not name and show_tag:
            name = show_tag
        schema = d.get("schema", "")
        raw_id = d.get("itemId") or d.get("id", "")
        if not schema and raw_id:
            schema = f"https://m.damai.cn/shows/item.html?itemId={raw_id}"
        # 巡演卡片结构：itemId + city + showTime，无 venueName/priceStr
        return {
            "id": str(raw_id),
            "name": name,
            "showTime": d.get("showTime", ""),
            "venueName": d.get("venueName", ""),
            "priceStr": d.get("priceStr", "") or d.get("formattedPriceStr", ""),
            "priceLow": d.get("priceLow", ""),
            "cityName": d.get("cityName", "") or d.get("city", ""),
            "verticalPic": d.get("verticalPic", ""),
            "horizontalPic": d.get("horizontalPic", ""),
            "showStatus": (d.get("showStatus") or {}).get("desc", ""),
            "categoryName": category_name,
            "wantSee": d.get("wantSee", False),
            "schema": schema,
        }
