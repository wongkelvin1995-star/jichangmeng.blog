---
title: Clash 下载：我们整理的官方下载地址和选择方法
seoTitle: Clash 下载前先看：官方地址、最新版本与选择方法｜机场梦
description: Clash 下载只认项目官方的 GitHub 发布页。我们核对了 Clash Verge Rev 等客户端的最新版本（2026-11-06），也说明原版 Clash 已停止维护、服务商有客户端时先用它。
draft: false
publishedAt: 2026-11-06
updatedAt: 2026-11-06
category: 新手入门
relatedPaths:
  - /guides/kexue-shangwang-rumen/
  - /guides/xinshou-jichang-wubu/
  - /guides/disanfang-kehuduan-daoru/
  - /guides/dingyue-lianjie-shuoming/
  - /guides/client-subscription-troubleshooting/
---

Clash 下载之前，我们建议先记住两件事。第一，原版 Clash 已经停止维护，现在常说的“Clash 客户端”，大多是基于 mihomo（原 Clash.Meta）内核的新项目。第二，安装包只从项目官方的 GitHub 发布页下载。下面是我们在 2026-11-06 核对过的各平台下载地址，以及当天的最新版本。

> **下载之前，先确认服务商支不支持。**按我们 2026-11-06 导入的资料记录，目录里的品牌大多不推荐或明确不支持第三方客户端。服务商有自己的客户端时，我们建议先用它；第三方客户端只在服务商支持时使用。每家的情况，可以在品牌资料页的“客户端与订阅”一节查看。

<figure class="shot">
<img src="/assets/guides/brand-client-unsupported.webp" srcset="/assets/guides/brand-client-unsupported.webp 780w" sizes="(max-width: 430px) 100vw, 390px" width="390" height="506" alt="微风网络资料页的“客户端与订阅”一节：本站建议和资料记录的第三方客户端支持情况分开列出" loading="lazy" decoding="async" />
<figcaption>资料写明“明确不支持”第三方客户端的品牌，就不必另外下载 Clash 客户端（本站截图，2026-11-06）。</figcaption>
</figure>

## 各平台客户端一览（2026-11-06 核对）

| 客户端 | 平台 | 当天的最新正式版 | 官方下载 |
|---|---|---|---|
| Clash Verge Rev | Windows、macOS、Linux | v2.5.10（2026-11-03 发布） | [GitHub 发布页](https://github.com/clash-verge-rev/clash-verge-rev/releases) |
| Clash Party（原 Mihomo Party） | Windows、macOS、Linux | v2.0.4（2026-10-18 发布） | [GitHub 发布页](https://github.com/mihomo-party-org/clash-party/releases) |
| FlClash | 安卓、Windows、macOS、Linux | v0.9.3（2026-11-04 发布） | [GitHub 发布页](https://github.com/chen08209/FlClash/releases) |
| ClashMetaForAndroid | 安卓 | v2.11.36（2026-10-21 发布） | [GitHub 发布页](https://github.com/MetaCubeX/ClashMetaForAndroid/releases) |

核对时，这四个项目在一个月内都发布过新的正式版，可以看作仍在维护。它们用的 mihomo 内核单独发布在 [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo/releases)（当天为 v1.19.33），新手一般不需要单独下载内核。

版本号随时会变，下载时以发布页上标着 Latest 的正式版为准。表里的数字是核对当天的记录，我们会定期回来更新。这张表只说明各项目是什么、从哪里下载，不是推荐排名；我们也还没有在自己的设备上逐个测试。

## iPhone 和 iPad 怎么办

我们目前没有可以确认维护情况的开源 Clash iOS 客户端可以列出。App Store 上有一些支持订阅的代理工具，多为付费应用，而且通常需要非中国大陆地区的 Apple ID。我们没有逐个测试，所以不在这里推荐具体应用，建议先问服务商推荐的 iOS 方案。

## 原版 Clash 已停止维护

原版 Clash（GitHub 上的 Dreamacro/clash）和 Clash for Windows 都已经不再更新，原来的 GitHub 仓库也不在了：我们 2026-11-06 查询这两个仓库，都返回 404。网上仍能搜到它们的旧安装包，但来源无法核实，我们不建议下载。还在用的话，可以换成上表里仍在维护的客户端，或者服务商提供的客户端。

## 下载和安装步骤

1. 打开上表的官方 GitHub 发布页，找到标着 Latest 的最新正式版。标着 Pre-release 的是测试版，新手不用选。
2. 在发布页的 Assets 列表里，按系统和处理器选文件：
   - **Windows**：一般电脑选带 x64（有的项目写作 amd64）的安装程序 setup.exe，ARM 处理器选 arm64。Clash Verge Rev 另有带 fixed_webview2 的版本，体积更大，只在系统缺少 WebView2、界面打不开时使用；它的官方文档写明不支持 Windows 7。
   - **macOS**：Apple 芯片（M 系列）选 aarch64 或 arm64，Intel 芯片选 x64 或 amd64。Clash Verge Rev 的官方文档写明需要 macOS 12 或更新版本。
   - **安卓**：多数手机选 arm64-v8a；不确定时，ClashMetaForAndroid 提供 universal 通用版。
   - **Linux**：Debian、Ubuntu 选 .deb，Fedora 等选 .rpm。
3. 下载后核对一次：文件来自 github.com 上的项目页面，文件名里的版本号和发布页一致。FlClash 提供 SHA256SUMS 校验文件，Clash Party 为每个安装包提供 .sha256 文件，可以用来确认安装包完整。
4. 安装好以后，再按服务商的说明导入订阅，步骤见[第三方客户端导入机场](/guides/disanfang-kehuduan-daoru/)和[机场订阅链接是什么](/guides/dingyue-lianjie-shuoming/)。

Clash Verge Rev 的官方文档还提到，Windows 也可以用 `winget install ClashVergeRev.ClashVergeRev` 安装。[Clash Verge Rev 安装说明](https://www.clashverge.dev/install.html)

## 怎么辨别官方渠道

| 来源 | 能否确认 | 原因 |
|---|---|---|
| 项目 README 或官方文档指向的 GitHub 发布页 | 可以确认 | 由项目维护者发布，能对照版本号和校验文件 |
| 自称“中文官网”“高速下载”的网站 | 无法确认 | 不是项目方运营的站点，无法确认安装包有没有被改过 |
| 网盘、群文件、他人转发的安装包 | 不建议使用 | 来源和完整性都无法核实 |

## 常见问题

### Clash for Windows 还能用吗？

它已经停止更新，原来的仓库也不在了。我们不建议继续下载来路不明的旧安装包，可以换成仍在维护的客户端，或使用服务商提供的客户端。

### Clash Verge 和 Clash Verge Rev 是同一个吗？

Clash Verge Rev 在官方文档里介绍自己是 Clash Verge 的延续，现在持续更新的是 Rev。

### 下载的版本和表里不一样，要紧吗？

不要紧。表里是 2026-11-06 的核对结果，以发布页标着 Latest 的正式版为准即可。

### 装好客户端就能上网了吗？

还不能。客户端只是工具，需要导入服务商给你的订阅，或者改用服务商自己的客户端登录。完整流程见[机场新手教程](/guides/xinshou-jichang-wubu/)。
