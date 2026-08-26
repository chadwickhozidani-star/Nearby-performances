"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "concert-radar-webhooks";
const TEMPLATE = {
  name: "",
  url: "",
  secret: "",
  enabled: true,
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default function Settings() {
  const [hooks, setHooks] = useState([]);
  const [form, setForm] = useState({ ...TEMPLATE });
  const [copied, setCopied] = useState(false);
  const [savedTip, setSavedTip] = useState("");

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

  const addHook = (e) => {
    e.preventDefault();
    const url = form.url.trim();
    if (!url) {
      setSavedTip("请填写飞书机器人 Webhook 地址");
      return;
    }
    const next = [
      ...hooks,
      {
        name: form.name.trim(),
        url,
        secret: form.secret.trim(),
        enabled: form.enabled !== false,
      },
    ];
    persist(next);
    setForm({ ...TEMPLATE });
    setSavedTip("已添加，记得点击「导出配置」同步到仓库");
    setTimeout(() => setSavedTip(""), 3000);
  };

  const removeHook = (idx) => {
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

  return (
    <main className="container">
      <header className="header">
        <h1>通知设置</h1>
        <p className="subtitle">
          配置飞书群机器人 Webhook，爬虫每次更新或失败时自动推送通知
        </p>
      </header>

      <section className="filters" style={{ position: "static" }}>
        <div className="filter-group">
          <div className="filter-label">新增 Webhook</div>
          <form
            onSubmit={addHook}
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
                添加 Webhook
              </button>
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
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
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
            1. 点击「复制配置」或「下载 webhooks.json」，将内容同步到仓库的{" "}
            <code>crawler/webhooks.json</code> 并推送（GitHub Actions 每次抓取时会自动读取）。
          </p>
          <p>
            2. 单 webhook 场景也可直接在 GitHub 仓库 Settings → Secrets and variables → Actions
            配置环境变量：<code>FEISHU_WEBHOOK_URL</code>（必填）、<code>FEISHU_WEBHOOK_SECRET</code>（可选）、
            <code>FEISHU_SITE_URL</code>（可选，站点地址，用于通知卡片展示）。
          </p>
          <p>
            3. 配置保存后，在 GitHub Actions 页面手动运行 <code>crawl</code> 工作流即可验证飞书通知。
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
