"use client";

import { useEffect, useMemo, useState } from "react";

const ALL_CATEGORIES = ["演唱会", "音乐节", "Livehouse", "话剧音乐剧", "脱口秀", "相声曲艺", "音乐会", "舞蹈舞剧", "沉浸式演出"];

// 城市排序：热门城市优先，其余按拼音
const HOT_CITIES = ["北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "武汉", "天津", "沈阳", "西安", "苏州", "重庆", "长沙", "郑州", "青岛", "厦门", "大连", "佛山", "宁波"];

export default function Home() {
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selectedCities, setSelectedCities] = useState(["北京", "上海"]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [sortBy, setSortBy] = useState("heat");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/data/events.json").then((r) => r.json()),
      fetch("/data/meta.json").then((r) => r.json()),
    ])
      .then(([data, m]) => {
        setEvents(data.events || []);
        setMeta({ ...data, ...m });
        setLoading(false);
      })
      .catch(() => {
        setError("数据加载失败，请确认已运行爬虫并生成 data/events.json");
        setLoading(false);
      });
  }, []);

  const cityOptions = useMemo(() => {
    const cities = new Set(events.map((e) => e.city));
    const sorted = [...cities].sort((a, b) => {
      const ia = HOT_CITIES.indexOf(a);
      const ib = HOT_CITIES.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, "zh");
    });
    return sorted;
  }, [events]);

  const toggleCity = (city) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  const toggleCat = (cat) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleArtist = (artist) => {
    setSelectedArtists((prev) =>
      prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist]
    );
  };

  // 艺人候选：按出现次数排序取 Top 40，次数相同按首次出现顺序（热度）
  const artistOptions = useMemo(() => {
    const order = [];
    const count = {};
    for (const e of events) {
      const arts = Array.isArray(e.artists) ? e.artists : [];
      for (const a of arts) {
        if (!a) continue;
        if (!(a in count)) {
          count[a] = 0;
          order.push(a);
        }
        count[a] += 1;
      }
    }
    return order
      .map((a) => ({ name: a, n: count[a], idx: order.indexOf(a) }))
      .sort((x, y) => y.n - x.n || x.idx - y.idx)
      .slice(0, 40)
      .map((x) => x.name);
  }, [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (selectedCities.length > 0) {
      list = list.filter((e) => selectedCities.includes(e.city));
    }
    if (selectedCats.length > 0) {
      list = list.filter((e) => selectedCats.includes(e.category));
    }
    if (selectedArtists.length > 0) {
      list = list.filter((e) =>
        (Array.isArray(e.artists) ? e.artists : []).some((a) =>
          selectedArtists.includes(a)
        )
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.venueName || "").toLowerCase().includes(q) ||
          (Array.isArray(e.artists) ? e.artists : []).some((a) =>
            (a || "").toLowerCase().includes(q)
          )
      );
    }
    const parseStart = (t) => {
      const m = /(\d{4})[.\-年](\d{1,2})[.\-月](\d{1,2})/.exec(t || "");
      return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Infinity;
    };
    if (sortBy === "time") {
      list = [...list].sort((a, b) => parseStart(a.showTime) - parseStart(b.showTime));
    } else if (sortBy === "price") {
      list = [...list].sort(
        (a, b) =>
          (parseFloat(a.priceLow) || Infinity) - (parseFloat(b.priceLow) || Infinity)
      );
    } else {
      // 默认综合热度：heatRank 越小越热
      list = [...list].sort(
        (a, b) => (a.heatRank || 999999) - (b.heatRank || 999999)
      );
    }
    return list;
  }, [events, selectedCities, selectedCats, selectedArtists, sortBy, query]);

  const stats = useMemo(() => {
    const byCity = {};
    for (const e of events) byCity[e.city] = (byCity[e.city] || 0) + 1;
    const byCat = {};
    for (const e of events) byCat[e.category] = (byCat[e.category] || 0) + 1;
    return { byCity, byCat };
  }, [events]);

  return (
    <main className="container">
      <header className="header">
        <h1>演唱会雷达</h1>
        <p className="subtitle">
          {meta ? (
            <>
              数据来源：{meta.source} · 更新于 {meta.generatedAt} · 覆盖{" "}
              {new Set(events.map((e) => e.city)).size} 个城市 / {events.length} 场演出
            </>
          ) : (
            "未来三个月演出信息"
          )}
        </p>
      </header>

      <section className="filters">
        <div className="filter-group">
          <div className="filter-label">城市（可多选）</div>
          <div className="chips">
            <button
              className={"chip " + (selectedCities.length === 0 ? "active" : "")}
              onClick={() => setSelectedCities([])}
            >
              全部
            </button>
            {cityOptions.map((c) => (
              <button
                key={c}
                className={"chip " + (selectedCities.includes(c) ? "active" : "")}
                onClick={() => toggleCity(c)}
              >
                {c}
                <span className="count">{stats.byCity[c] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">演出类型（可多选）</div>
          <div className="chips">
            <button
              className={"chip " + (selectedCats.length === 0 ? "active" : "")}
              onClick={() => setSelectedCats([])}
            >
              全部
            </button>
            {ALL_CATEGORIES.filter((c) => stats.byCat[c]).map((c) => (
              <button
                key={c}
                className={"chip " + (selectedCats.includes(c) ? "active" : "")}
                onClick={() => toggleCat(c)}
              >
                {c}
                <span className="count">{stats.byCat[c] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {artistOptions.length > 0 && (
          <div className="filter-group">
            <div className="filter-label">艺人（可多选，仅列热门 Top 40）</div>
            <div className="chips">
              <button
                className={"chip " + (selectedArtists.length === 0 ? "active" : "")}
                onClick={() => setSelectedArtists([])}
              >
                全部
              </button>
              {artistOptions.map((a) => (
                <button
                  key={a}
                  className={"chip " + (selectedArtists.includes(a) ? "active" : "")}
                  onClick={() => toggleArtist(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="filter-group">
          <input
            className="search"
            type="text"
            placeholder="搜索艺人 / 演出名称 / 场馆..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      <section className="results">
        <div className="result-head">
          <span>
            共 <b>{filtered.length}</b> 场演出
            {selectedCities.length > 0 && (
              <span className="head-tag">城市：{selectedCities.join("、")}</span>
            )}
            {selectedArtists.length > 0 && (
              <span className="head-tag">艺人：{selectedArtists.join("、")}</span>
            )}
          </span>
          <div className="sort-bar">
            <span className="hint">排序：</span>
            {[
              ["heat", "综合热度"],
              ["time", "最早开演"],
              ["price", "价格最低"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={"chip chip-sm " + (sortBy === k ? "active" : "")}
                onClick={() => setSortBy(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="empty">加载中...</div>}
        {error && <div className="empty">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="empty">没有符合条件的演出，试试放宽筛选条件</div>
        )}

        <div className="grid">
          {filtered.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>
          数据来自大麦网公开页面，每天自动更新。仅供个人查询参考，购票请以官方页面为准。
        </p>
      </footer>
    </main>
  );
}

function EventCard({ e }) {
  const date = (e.showTime || "").replace(/\./g, ".");
  return (
    <a
      className="card"
      href={e.schema || `https://m.damai.cn/damai/detail/item.html?itemId=${e.id}`}
      target="_blank"
      rel="noreferrer"
    >
      <div className="thumb">
        {e.verticalPic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.verticalPic} alt={e.name} loading="lazy" />
        ) : (
          <div className="thumb-placeholder">🎫</div>
        )}
        <span className="badge-cat">{e.category || e.categoryName || "演出"}</span>
        {e.city && <span className="badge-city">{e.city}</span>}
      </div>
      <div className="card-body">
        <h3 className="card-title">{e.name}</h3>
        {Array.isArray(e.artists) && e.artists.length > 0 && (
          <div className="card-artists">
            {e.artists.slice(0, 3).map((a) => (
              <span key={a} className="artist-tag">{a}</span>
            ))}
            {e.artists.length > 3 && (
              <span className="artist-tag more">+{e.artists.length - 3}</span>
            )}
          </div>
        )}
        <div className="card-meta">
          <div className="meta-row">
            <span className="meta-icon">📅</span>
            <span>{date}</span>
          </div>
          <div className="meta-row">
            <span className="meta-icon">📍</span>
            <span className="meta-venue">{e.venueName || e.cityName || "详情见大麦"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-icon">🎟️</span>
            <span className="price">{e.priceStr ? `¥${e.priceStr}` : "价格待定"}</span>
          </div>
        </div>
        <div className="card-footer">
          <span className="status">{e.showStatus || "去购票"}</span>
          <span className="go">去大麦 →</span>
        </div>
      </div>
    </a>
  );
}
