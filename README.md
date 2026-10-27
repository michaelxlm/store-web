# store-web · 东北电动车汇

纯静态、**零运行时依赖**的本地商户综合推广平台 Web 承载（域名 `store.fangkelianmeng.com`）。由 WO-130 从 uni-app 工程 `main-store` 的 H5/Web 承载平移拆分而来，独立仓库、独立部署，复用 main-store 的广告 / 埋点 / 后端登记，接入九站共用基础设施。

## 定位

- `main-store` 小程序之外的 **Web/H5 承载**：车型浏览 / 车型对比 / 同城找店 / 活动中心 / 文章资讯 / 常见问题 / 商家入驻与报价 / 商户中心 / 个人中心 / 收藏 / 设置 / 媒体库 / 功能清单 / 关于与隐私等，共 30 条静态路由（`data/pages.json` 驱动），其中对客可收录页写入 `sitemap.xml`。
- 构建期预渲染为完整 HTML，运行时不依赖任何框架；页面脚本为原生 JS。
- 复用母站 `main-store` 的站点键（`ad_site_key` / `tracker_project` = `main-store`），因此广告、券位、埋点、sourceGuard 白名单等后端登记无需新增。

## 技术栈

零依赖纯 Node（`>=18`）构建管线 + 原生静态产物，无 npm 运行时依赖。构建脚本与 `xuyiheng-tools` 同源（build / prerender / minify / fingerprint / inject-scripts / build-sitemap / build-llms / check-links / check-wcag / check-encoding / shared-partials）。

## 目录结构

```text
data/            站点与路由配置（site.json / pages.json）
templates/       各页正文模板与公共片段（构建期注入外壳）
assets/          css / js / img 源资源（构建期压缩 + fingerprint）
scripts/         构建与门禁脚本（见下）
.github/workflows/  deploy.yml 部署流水线
<路由目录>/<页面>.html  构建产物，URL 与磁盘文件一一对应（如 shop/shop.html → /shop/shop.html；首页为根 index.html）
robots.txt / llms.txt / sitemap.xml  根级公共产物
```

## 构建管线（`scripts/build.js` 串起全流程）

1. `minify.js` — 压缩 CSS/JS
2. `fingerprint.js` — 资源内容哈希版本化，产出 manifest
3. `prerender.js` — 逐路由生成 HTML（head SEO/OG/canonical/JSON-LD、header/sidebar/footer/广告券位、FOUC 防护）
4. `build-sitemap.js` / `build-llms.js` — 生成 sitemap.xml / llms.txt + robots.txt
5. `inject-scripts.js` — 公共脚本注入守卫
6. `check-links.js` — 站内死链门禁（缺目标页则构建失败）

## 常用命令

```bash
npm run dev            # 本地静态预览
npm run build          # 全量构建（含死链门禁）
npm run check:encoding # UTF-8 编码门禁（禁 GBK/双重乱码/BOM）
```

## 门禁

- **编码门禁** `check-encoding.js`：所有文本文件必须为无 BOM 的 UTF-8，杜绝 Windows 侧 GBK / 双重乱码。
- **死链门禁** `check-links.js`：产物 HTML 的站内绝对链接逐条校验目标文件存在。
- **反色字 WCAG 门禁** `check-wcag.js`：品牌主色在亮 / 暗令牌下的可读性校验。

## 部署

`.github/workflows/deploy.yml`（`push` 到 `main` 或手动触发）在**仓库级 self-hosted runner**（标签 `self-hosted,linux,x64,static-deploy`）上执行：编码门禁 → 构建 → 死链门禁 → 用 `tar` 仅同步**构建产物**（排除 `data/` `scripts/` `templates/` `package.json` `.github/` 等），经 SSH 推送到生产机 `60.205.214.88:/www/wwwroot/store.fangkelianmeng.com/`。

> 新克隆本仓库需先在生产机注册对应仓库的 runner，否则 run 会永久 `queued`。

## 共用基础设施

| 能力 | 接入方式 |
| --- | --- |
| 埋点 | `assets/js/tracker.min.js`，`tracker_project = main-store` |
| 广告 | `assets/js/ad-slots.min.js` + `data-ad-slot` 标记，`ad_site_key = main-store` |
| 优惠券位 | `assets/js/coupon-slot.min.js` + `data-coupon-slot` 标记 |
| 美图位 | `assets/js/img-slot.js`（消费中台 `front/antucao` 的 `image/*` 现役端点） |
| 后端 API | `assets/js/http-api.js` → `https://api.xuyiheng.com`，带 `X-Source-Guard` 头（按 `mainUrl` 放行） |
| 结构化数据 | 构建期写入 JSON-LD（WebSite / Organization / WebApplication / BreadcrumbList） |

## 页脚与站点公共内容（对齐全站）

页脚由 `scripts/shared-partials.js` 的 `renderFooter` 统一生成，数据源为 `data/site.json` 的 `footer`，与九站页脚范式一致：导航分区（选车看车 / 内容与帮助 / 商家与关于）→ **更多站点**（`footer.sister_sites`，取自 fleet 单一事实源 `SISTER_SITES` 并排除本站，共 9 个兄弟站外链）→ 底栏（版权 + 备案号 + 回到顶部）。

- **备案号**：`footer.icp` = **`京ICP备18062653号-23`**（`fangkelianmeng.com` 主体号，与访客小站同域），链向 `https://beian.miit.gov.cn/`。⚠️ 同一主体号下各站后缀不同，改动须查库或核对兄弟站，**禁止臆造**。

## 与其他仓的关系

- **母站**：`main-store`（uni-app 小程序主端，微信 + 快手；抖音审核期暂缓）。本工程只承载 **Web/H5 形态**，小程序支付 / 登录主流程仍在母站，不在此重复实现。
- **兄弟承载**：`xuyiheng-tools` 为 `main-tool` 的 Web 承载，二者同属「uni-app 工程的 Web 静态化」路线。
- 跨项目功能归属与平台定位口径见知识库 `main-api/app/docs/04-技术架构/01-架构设计/跨平台功能划分与归属.md`；多端口径与开放项见 `main-api/app/docs/knowledge-base/05-项目优化建议.md`（SD-2）。

> 注：知识库路径以「HBuilderProjects 工作区同层打开」为前提；本仓单独克隆时该文档不随仓，可忽略。