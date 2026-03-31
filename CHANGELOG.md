# Changelog

# [1.2.0](https://github.com/snailuu/ccs/compare/v1.0.0...v1.2.0) (2026-03-24)


### Features

* **release:** 添加又拍云 CDN 分发和 curl 一键安装脚本 ([84f0fed](https://github.com/snailuu/ccs/commit/84f0fed15c5138e13f1c7c3a2951811f0341edfb))
* **sync:** sync 支持选择目标 CLI 客户端写入 ([732cf93](https://github.com/snailuu/ccs/commit/732cf93b0da32f2385f228f1bbe2041148939f56))
* **sync:** 新增交互式同步命令替代 pull ([dcd7999](https://github.com/snailuu/ccs/commit/dcd79994c928a8b4b6e5f61de04bb059aaea8c9e))

## [v1.3.2-beta.0] - 2026-03-31

### 🐛 Bug Fixes
- fix(sync): 允许 multiselect 空选提交，修复无法跳过的问题 ([#3](https://github.com/snailuu/ccs/pull/3))


## [1.1.1](https://github.com/snailuu/ccs/compare/v1.1.0...v1.1.1) (2026-03-23)


### Bug Fixes

* **ci:** 修复 npm 发布认证方式避免密钥泄露 ([ee0e3cc](https://github.com/snailuu/ccs/commit/ee0e3cc249ece98a600e3fb946b497197225668f))

# 1.1.0 (2026-03-23)


### Bug Fixes

* **release:** npm 发布移至 CI，本地 release-it 只负责版本和 tag ([a13198f](https://github.com/snailuu/ccs/commit/a13198f83789bb93158e106d9e020bf2c5011ba3))


### Features

* **cli:** 初始化 ccs CLI 同步工具 ([395a029](https://github.com/snailuu/ccs/commit/395a029d0d9cebcb00cfb021aaf110e7b09f9a4f))
* **config:** 使用 @clack/prompts 重构为交互式配置向导 ([1a238d3](https://github.com/snailuu/ccs/commit/1a238d33d1b3a1d39ba462e05abb152370a31e16))
