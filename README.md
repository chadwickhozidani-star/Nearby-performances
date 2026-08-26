---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: e079bd333f5dfc5bbc60c5c6f53db745_2408d804a02f11f1a54f525400f8a581
    ReservedCode1: i5nHdfHORbcxC8GRLZIVYfh/T5/ANGuq3VtGJSeZYQnlgfdObhY74x/gJ53gJfGU3BbqaTvfUAvIm40LeS3L84ZcjukMaC96tVsa2yzKWwz+Bvf5fyf2i63FXA2A1dX7CAIghh4kD9J9IDhkzbRNvJYVakHZJpFzeqPBhvTjEVs4vW9VIbQwpzxt314=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: e079bd333f5dfc5bbc60c5c6f53db745_2408d804a02f11f1a54f525400f8a581
    ReservedCode2: i5nHdfHORbcxC8GRLZIVYfh/T5/ANGuq3VtGJSeZYQnlgfdObhY74x/gJ53gJfGU3BbqaTvfUAvIm40LeS3L84ZcjukMaC96tVsa2yzKWwz+Bvf5fyf2i63FXA2A1dX7CAIghh4kD9J9IDhkzbRNvJYVakHZJpFzeqPBhvTjEVs4vW9VIbQwpzxt314=
---

# 演唱会雷达 Concert Radar

实时展示所选城市未来三个月的演唱会、音乐节、Livehouse、话剧等演出信息，数据来自大麦网公开页面，每日自动更新。

## 功能

- 城市单选 / 多选（支持全部热门城市 + 任意城市）
- 演出类型筛选：演唱会、音乐节、Livehouse、话剧音乐剧、脱口秀、相声曲艺、音乐会、舞蹈舞剧、沉浸式演出
- 艺人筛选：热门艺人 Top 40 多选（歌手/乐队），可叠加城市与类型
- 综合热度排序：默认按大麦推荐/热度排序（`heatRank` 字段），可切换"最早开演 / 价格最低"
- 关键词搜索（艺人 / 演出名 / 场馆）
- 卡片视图展示：海报、艺人标签、时间、场馆、票价、购票链接（点击跳转大麦对应演出页）
- 数据每日自动更新，无需手动维护
- 飞书通知：支持多个 webhook 群机器人（成功卡片 / 失败告警）

## 架构

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────┐
│  GitHub Actions  │ ───▶ │   git push 数据   │ ───▶ │    Vercel    │
│  每日定时爬虫    │      │  web/public/data  │      │  静态托管    │
└─────────────────┘      └──────────────────┘      └──────────────┘
```

- **爬虫**：`crawler/` 纯 Python（仅标准库），调用大麦 H5 端 mtop 接口，无需浏览器、无需登录
- **定时**：GitHub Actions 每天 06:00 UTC（北京时间 14:00）自动运行，写入数据并 push 到仓库
- **站点**：`web/` Next.js 静态站点，从 `web/public/data/events.json` 读取数据渲染

> 为什么选 GitHub Actions 而不是 Vercel Cron：爬虫抓取 16 城市 × 9 分类需要几分钟，Vercel Hobby 函数超时上限较短且调用受限；GitHub Actions 免费额度充足（2000 分钟/月，一次爬虫约 3 分钟），与 git 天然集成，数据变更可追溯。

## 本地运行

### 1. 抓取数据

```bash
cd crawler
python crawl.py                      # 默认抓取热门城市全部演出分类
python crawl.py --cities 北京 上海    # 指定城市
python crawl.py --all-cities         # 抓取全部城市（342 个，耗时较长）
```

输出：`data/events.json`（演出数据）、`data/meta.json`（元信息）

### 2. 复制数据到站点并启动

```bash
mkdir -p web/public/data
cp data/events.json web/public/data/events.json
cp data/meta.json web/public/data/meta.json

cd web
npm install
npm run dev       # http://localhost:3000
```

## 部署（Vercel + GitHub Actions）

### 前置

1. 注册 [GitHub](https://github.com) 与 [Vercel](https://vercel.com) 账号
2. 安装 [Git](https://git-scm.com)

### 步骤

1. **创建 GitHub 仓库**（如 `concert-radar`），将本项目代码推送上去：

   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/concert-radar.git
   git push -u origin main
   ```

2. **配置 Vercel**：
   - 打开 vercel.com → Add New → Project
   - Import 刚创建的 GitHub 仓库
   - Framework Preset 选择 **Next.js**（自动识别）
   - 无需修改构建配置，直接 Deploy

3. **启用 GitHub Actions 定时任务**：
   - 仓库 Actions 页面会自动识别 `.github/workflows/crawl.yml`
   - 首次可手动触发一次（Actions → Daily Concert Crawl → Run workflow），验证数据生成

### 飞书通知配置（可选）

抓取完成后可通过飞书群机器人 webhook 发送通知（成功卡片 / 失败告警），支持**多个 webhook**。

#### 方式一：配置文件（推荐，支持多 webhook）

编辑 `crawler/webhooks.json`（本仓库自带模板，直接填写即可）：

```json
{
  "webhooks": [
    {
      "name": "运营群",
      "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
      "secret": "",
      "enabled": true
    },
    {
      "name": "告警群",
      "url": "https://open.feishu.cn/open-apis/bot/v2/hook/yyy",
      "secret": "加签密钥",
      "enabled": true
    }
  ]
}
```

- `name`：群备注名（可选，显示在通知汇总里）
- `url`：飞书群机器人 Webhook 地址（必填，留空则该条不生效）
- `secret`：加签密钥（机器人开启"签名校验"时填，可不填）
- `enabled`：是否启用（可选，默认 true）

保存后推送到 GitHub 仓库，下次爬虫运行即对所有群发送。**配置文件优先级高于环境变量**。

#### 方式二：环境变量（单 webhook，兼容旧配置）

配置 GitHub Secrets（仓库 Settings → Secrets and variables → Actions → New repository secret）：

- `FEISHU_WEBHOOK_URL`：机器人 Webhook 地址（必填才发送）
- `FEISHU_WEBHOOK_SECRET`：加签密钥（机器人开启签名校验时填）
- `FEISHU_SITE_URL`：站点访问地址（可选，显示在通知卡片中，方便点击跳转）

> 当 `webhooks.json` 中所有条目 url 均为空时，自动回退使用环境变量。

本地测试：`$env:FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"; python crawler\crawl.py`，或在 crawler 目录运行 `python notify.py` 发送测试卡片。

通知内容包含：抓取城市、演出总数、分类分布、时间范围、生成时间、失败项提示、站点链接。

### 验证

- 部署后访问 `https://<项目名>.vercel.app`
- 数据更新时间显示在页面顶部
- 若当天数据为空，检查 GitHub Actions 运行日志

## 自定义

| 配置 | 位置 | 说明 |
|------|------|------|
| 默认抓取城市 | `crawler/crawl.py` 的 `DEFAULT_CITIES` | 修改后推送到 GitHub 自动生效 |
| 默认抓取分类 | `crawler/crawl.py` 的 `DEFAULT_CATEGORIES` | 同上 |
| 抓取时间 | `.github/workflows/crawl.yml` 的 cron | 默认 14:00 北京时间 |
| 站点标题/样式 | `web/app/` | 常规 Next.js 开发 |

## 免责声明

数据来自大麦网公开页面，仅供个人学习与查询参考。请勿高频抓取、勿用于商业用途。购票请以大麦官方页面为准。
*（内容由AI生成，仅供参考）*
