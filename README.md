# 拾词 · 四级核心词汇

背单词 App（Web 版，后续经 GitHub 打包为 APK）。词库来自《26英语四级-核心词汇-艾宾浩斯抗遗忘打卡》（刘晓燕），按书中 Unit/Lesson 原顺序排列，共 3383 词。

## 立即体验

方式一：直接双击打开 `app/index.html`（Chrome/Edge）。

方式二：本地服务（当前会话已启动）：<http://127.0.0.1:8642/>

```bash
cd app && python -m http.server 8642
```

建议用浏览器开发者工具切成手机视口（如 iPhone 12 Pro 390×844）查看，最终 APK 内就是全屏移动端布局。

## 功能

- **首页**：底部只有「背单词」「复习单词」两个入口；上方为进度总览（已学/总词数 + 今日新学、今日复习、待复习、已掌握）和连续打卡天数
- **背单词**：按 PDF 原顺序展示英文，轻触显示释义并自动发音（可用系统 TTS 时），按钮进入下一个词，可随时「上一个」回退；组内 5 点进度；已在复习池的词有「复习中」标记
- **组弹窗**：每背完 5 个弹出，5 个词可单独勾选（认识的可以不加入复习池），按钮实时显示加入数量
- **复习单词**：每轮最多 20 词（连对少的优先出题）；随机两种题型——英文挖空补全、看中文释义拼整词（显示字母长度骨架）；题目上方直接显示该词当前连对进度；支持「提示」（逐个字母揭示，不惩罚）和「不会，看答案」兜底；答错震动、连对清零，连对 3 次移出复习池
- **自动保存**：学习位置、复习池、连对状态、今日统计、连续打卡全部实时写入 localStorage，关闭/刷新后恢复；旧版本数据自动兼容

## 目录结构

```
app/            # App 本体（纯静态，无构建步骤）
  index.html
  css/style.css
  js/app.js     # 全部交互逻辑
  js/words.js   # 词库数据（由 work/parse.py 生成）
work/           # 词库制作流水线（可整体删除，不影响 App）
  ocr_run.py    # PDF 渲染 + RapidOCR 全书识别
  parse.py      # 表格解析 → app/js/words.js（含异常报告 report.txt）
  test_app.js   # jsdom 功能测试（node test_app.js 全流程验证）
```

## 数据流水线（如需重新生成词库）

```bash
python work/ocr_run.py    # 约 30 分钟，resumable
python work/parse.py      # 生成词库 + work/report.txt 数据质量报告
node work/test_app.js     # 功能回归
```

## 打包 APK（GitHub Actions 云端构建）

仓库已内置 Capacitor 安卓壳（`android/`）和构建工作流（`.github/workflows/android.yml`），本地无需 Android Studio：

```bash
# 1. 在 GitHub 新建一个私有仓库（不要勾选初始化 README）
# 2. 推送：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

推送后 Actions 会自动构建，完成后在仓库 Actions 页面下载 artifact `shici-apk`（即 app-debug.apk，可直接安装）。之后每次改动推送都会重新出包；也可以在 Actions 页面手动 Run workflow。

本地改动词库或界面后的常规流程：

```bash
python work/parse.py        # 如需重新生成词库
npx cap copy android        # 同步 app/ 到安卓壳
git add -A && git commit -m "..." && git push
```

> 前置要求：GitHub 账号即可。构建用的 JDK/SDK 都在云端。

这一步等当前版本确认后再做。
