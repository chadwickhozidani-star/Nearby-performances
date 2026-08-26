"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "concert-radar-webhooks";
const TEMPLATE = {
  name: "",
  url: "",
  secret: "",
  enabled: true,
  cities: [],
  artists: [],
  match: "any",
};

function normalizeHook(h) {
  return {
    name: h.name || "",
    url: h.url || "",
    secret: h.secret || "",
    enabled: h.enabled !== false,
    cities: Array.isArray(h.cities) ? h.cities : [],
    artists: Array.isArray(h.artists) ? h.artists : [],
    match: h.match === "all" ? "all" : "any",
  };
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return (Array.isArray(data) ? data : []).map(normalizeHook);
  } catch {
    return [];
  }
}

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={active ? "chip active" : "chip"}
      onClick={onClick}
      style={{ fontSize: 12, padding: "4px 10px" }}
    >
      {label}
    </button>
  );
}

export default function Settings() {
  const [hooks, setHooks] = useState([]);
  const [form, setForm] = useState({ ...TEMPLATE });
  const [editingIndex, setEditingIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [savedTip, setSavedTip] = useState("");
  const [cities, setCities] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistFilter, setArtistFilter] = useState("");

  // 从站点数据读取可选城市与艺人（用于监控条件点选）
  useEffect(() => {
    fetch("/data/events.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const events = Array.isArray(data) ? data : data?.events || [];
        setCities(
          [...new Set(events.map((e) => (e.city || "").trim()).filter(Boolean))].sort()
        );
        const allArtists = new Set();
        events.forEach((e) => (e.artists || []).forEach((a) => allArtists.add(String(a).trim())));
        setArtists([...allArtists].filter(Boolean).sort());
      })
      .catch(() => {
        /* 数据未就绪时仅保留手填能力 */
      });
  }, []);

  useEffect(() => {
    setHooks(loadSaved());
  }, []);

  const persist = (next) => {
    setHooks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleCity = (city) => {
    const has = form.cities.includes(city);
    setForm({
      ...form,
      cities: has ? form.cities.filter((c) => c !== city) : [...form.cities, city],
    });
  };

  const toggleArtist = (artist) => {
    const has = form.artists.includes(artist);
    setForm({
      ...form,
      artists: has ? form.artists.filter((a) => a !== artist) : [...form.artists, artist],
    });
  };

  const submitHook = (e) => {
    e.preventDefault();
    const url = form.url.trim();
    if (!url) {
      setSavedTip("请填写飞书机器人 Webhook 地址");
      return;
    }
    const item = {
      name: form.name.trim(),
      url,
      secret: form.secret.trim(),
      enabled: form.enabled !== false,
      cities: [...form.cities],
      artists: [...form.artists],
      match: form.match === "all" ? "all" : "any",
    };
    let next;
    if (editingIndex >= 0) {
      next = hooks.map((h, i) => (i === editingIndex ? item : h));
      setEditingIndex(-1);
      setSavedTip("已更新 Webhook，记得点击「导出配置」同步到仓库");
    } else {
      next = [...hooks, item];
      setSavedTip("已添加，记得点击「导出配置」同步到仓库");
    }
    persist(next);
    setForm({ ...TEMPLATE });
    setArtistFilter("");
    setTimeout(() => setSavedTip(""), 3000);
  };

  const editHook = (idx) => {
    setEditingIndex(idx);
    setForm({ ...normalizeHook(hooks[idx]) });
    setArtistFilter("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingIndex(-1);
    setForm({ ...TEMPLATE });
    setArtistFilter("");
  };

  const removeHook = (idx) => {
    if (editingIndex === idx) cancelEdit();
    persist(hooks.filter((_, i) => i !== idx));
  };

  const toggleHook = (idx) => {
    persist(
      hooks.map((h, i) => (i === idx ? { ...h, enabled: !h.enabled } : h))
    );
  };

  const exportJson = useMemo(() => {
    return JSON.stringify({ webhooks: hooks }, null, 2);
  }, [hooks]);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSavedTip("复制失败，请手动选择下方配置文本复制");
      setTimeout(() => setSavedTip(""), 3000);
    }
  };

  const downloadConfig = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "webhooks.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const enabledCount = hooks.filter((h) => h.enabled).length;
  const filteredArtists = artists.filter((a) =>
    a.toLowerCase().includes(artistFilter.trim().toLowerCase())
  ).slice(0, 60);

  const conditionText = (h) => {
    const parts = [];
    if (h.cities.length) parts.push(`城市：${h.cities.join("、")}`);
    if (h.artists.length) {
      const shown = h.artists.slice(0, 3).join("、");
      parts.push(`艺人：${shown}${h.artists.length > 3 ? ` 等${h.artists.length}个` : ""}`);
    }
    if (!parts.length) return "无监控条件（推送全部更新摘要）";
    const mode = h.match === "all" ? "全部命中才推送" : "命中任一即推送";
    return `${parts.join(" ｜ ")}（${mode}）`;
  };

  return (
    <main className="container">
      <header className="header">
        <h1>通知设置</h1>
        <p className="subtitle">
          配置飞书群机器人 Webhook；可设置每个 Webhook 独立监控的城市 / 艺人，并自定义推送条件
        </p>
      </header>

      <section className="filters" style={{ position: "static" }}>
        <div className="filter-group">
          <div className="filter-label">
            {editingIndex >= 0 ? "编辑 Webhook" : "新增 Webhook"}
          </div>
          <form
            onSubmit={submitHook}
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <input
              className="search"
              type="text"
              placeholder="群备注名（可选，如：运营群）"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="search"
              type="text"
              required
              placeholder="Webhook 地址：https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <input
              className="search"
              type="text"
              placeholder="加签密钥（可选，机器人开启加签时填写）"
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
            />

            <div className="filter-label" style={{ marginTop: 4 }}>
              监控城市（可多选，不选 = 全部城市）
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cities.length ? (
                cities.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={form.cities.includes(c)}
                    onClick={() => toggleCity(c)}
                  />
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  暂无城市数据（站点数据生成后可选）
                </span>
              )}
            </div>

            <div className="filter-label" style={{ marginTop: 4 }}>
              监控艺人（可多选，不选 = 全部艺人）
            </div>
            <input
              className="search"
              type="text"
              placeholder="搜索艺人…"
              value={artistFilter}
              onChange={(e) => setArtistFilter(e.target.value)}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {form.artists.map((a) => (
                <Chip key={a} label={`${a} ✕`} active onClick={() => toggleArtist(a)} />
              ))}
              {filteredArtists
                .filter((a) => !form.artists.includes(a))
                .map((a) => (
                  <Chip key={a} label={a} active={false} onClick={() => toggleArtist(a)} />
                ))}
              {!filteredArtists.length && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  未找到匹配艺人（可在上方选择，或先运行爬虫生成数据）
                </span>
              )}
            </div>

            <div className="filter-label" style={{ marginTop: 4 }}>
              推送条件
            </div>
            <div style={{ display: "flex", gap: "18px", alignItems: "center", fontSize: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="match"
                  checked={form.match !== "all"}
                  onChange={() => setForm({ ...form, match: "any" })}
                />
                命中任一条件即推送（城市或艺人匹配其一）
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="match"
                  checked={form.match === "all"}
                  onChange={() => setForm({ ...form, match: "all" })}
                />
                全部条件命中才推送（如：指定艺人在指定城市）
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={form.enabled !== false}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                启用
              </label>
              <button className="chip active" type="submit">
                {editingIndex >= 0 ? "更新 Webhook" : "添加 Webhook"}
              </button>
              {editingIndex >= 0 && (
                <button className="chip" type="button" onClick={cancelEdit}>
                  取消编辑
                </button>
              )}
            </div>
          </form>
          {savedTip && <div style={{ color: "var(--accent)", fontSize: 13 }}>{savedTip}</div>}
        </div>

        <div className="filter-group">
          <div className="filter-label">
            已配置（{enabledCount}/{hooks.length} 个启用）
          </div>
          {hooks.length === 0 ? (
            <div className="empty" style={{ padding: "24px 0", fontSize: 13 }}>
              还没有配置 Webhook，请在上方添加
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {hooks.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--card)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {h.name || "未命名"}
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: h.enabled ? "var(--accent)" : "var(--muted)",
                        }}
                      >
                        {h.enabled ? "启用中" : "已停用"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        wordBreak: "break-all",
                      }}
                    >
                      {h.url}
                      {h.secret ? " · 已加签" : ""}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {conditionText(h)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button className="chip chip-sm" onClick={() => editHook(i)}>
                      编辑
                    </button>
                    <button className="chip chip-sm" onClick={() => toggleHook(i)}>
                      {h.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      className="chip chip-sm"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      onClick={() => removeHook(i)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="filter-group">
          <div className="filter-label">导出配置（webhooks.json）</div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="chip active" onClick={copyConfig}>
              {copied ? "已复制" : "复制配置"}
            </button>
            <button className="chip" onClick={downloadConfig}>
              下载 webhooks.json
            </button>
          </div>
          <pre
            style={{
              background: "var(--chip-bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 12,
              overflow: "auto",
              maxHeight: 240,
              color: "var(--text)",
            }}
          >
            {exportJson}
          </pre>
        </div>
      </section>

      <section className="results">
        <div className="result-head">
          <span>如何生效</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--muted)",
          }}
        >
          <p>
            1. 每个 Webhook 可独立设置监控城市 / 艺人，留空表示不限；推送条件支持「命中任一」或
            「全部命中」（例如：邓紫棋 在 深圳 才推送）。
          </p>
          <p>
            2. 点击「复制配置」或「下载 webhooks.json」，将内容同步到仓库的{" "}
            <code>crawler/webhooks.json</code> 并推送（GitHub Actions 每次抓取时会自动读取并按条件过滤推送）。
          </p>
          <p>
            3. 单 webhook 场景也可直接在 GitHub 仓库 Settings → Secrets and variables → Actions
            配置环境变量：<code>FEISHU_WEBHOOK_URL</code>（必填）、<code>FEISHU_WEBHOOK_SECRET</code>（可选）、
            <code>FEISHU_SITE_URL</code>（可选，站点地址，用于通知卡片展示）。
          </p>
          <p>
            4. 配置保存后，在 GitHub Actions 页面手动运行 <code>crawl</code> 工作流即可验证飞书通知。
          </p>
        </div>
      </section>

      <footer className="footer">
        <p>
          <a href="/" style={{ color: "var(--accent)" }}>← 返回演出列表</a>
        </p>
      </footer>
    </main>
  );
}
