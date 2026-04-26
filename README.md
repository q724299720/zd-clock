# 正点闹钟 (ZD Clock)

手机端网页闹钟APP，基于 Capacitor 打包为原生 Android APK。

## 功能特点

- **大时钟** - 时分秒大数字显示，日期星期，下一闹钟倒计时
- **闹钟管理** - 增删改查、重复设置（每天/工作日/周末/自定义）、5种铃声
- **响铃提醒** - 渐进音量、震动、语音播报(TTS)、贪睡(3/5/10/15分钟)
- **记忆游戏** - 水果翻牌配对，完成才能关闭闹钟（可开关）
- **倒计时** - 多组并行、暂停/继续/删除、6个快捷预设
- **秒表** - 开始/暂停/继续/重置、分段计时(lap)
- **世界时钟** - 18城市库、时差显示、可增删城市
- **主题切换** - 深色/浅色/蓝色海洋/紫色幻梦/暖阳橙色
- **数据持久化** - 所有数据存 localStorage，刷新/重启不丢失

## 文件结构

```
clock/
├── www/                          # Web 资源目录
│   ├── index.html                  # 主页面
│   ├── css/style.css               # 样式文件
│   ├── js/app.js                   # 核心逻辑
│   ├── manifest.json               # PWA 配置
│   ├── sw.js                       # Service Worker
│   └── icon.png                    # 应用图标
├── android/                      # Android 原生项目（Capacitor生成）
├── .github/workflows/            # GitHub Actions 自动构建
├── capacitor.config.json         # Capacitor 配置
└── package.json                  # Node.js 依赖
```

## 方法一：用 Android Studio 构建（推荐）

### 1. 安装环境

- 下载并安装 [Android Studio](https://developer.android.com/studio)
- Android Studio 会自动安装 JDK 和 Android SDK

### 2. 用 Android Studio 打开项目

```bash
# 在项目目录下执行
npx cap open android
```

或手动打开：启动 Android Studio → Open → 选择 `clock/android` 文件夹

### 3. 构建 APK

- 等待 Gradle 同步完成（第一次可能需要几分钟下载依赖）
- 菜单栏：**Build → Build Bundle(s) / APK(s) → Build APK(s)**
- 构建完成后右下角会弹出提示，点击 "locate" 找到 APK 文件

APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`

### 4. 安装到手机

- 将 APK 传到 Mate 50
- 手机上开启"允许未知来源应用安装"
- 点击 APK 文件安装

## 方法二：GitHub Actions 自动构建

无需安装任何环境，推送代码到 GitHub 后自动构建 APK。

### 1. 创建 GitHub 仓库

- 登录 [github.com](https://github.com)
- 创建新仓库，名称例如 `zd-clock`

### 2. 上传代码

```bash
cd D:\program\backup\clock
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/zd-clock.git
git push -u origin main
```

### 3. 配置签名（可选）

如果需要签名 APK（安装时不会提示未知应用），需要配置签名密钥：

```bash
# 生成签名密钠
keytool -genkey -v -keystore zdclock.keystore -alias zdclock -keyalg RSA -keysize 2048 -validity 10000

# Base64 编码
base64 -w 0 zdclock.keystore > signing_key_base64.txt
```

然后在 GitHub 仓库设置 → Secrets and variables → Actions 中添加：
- `SIGNING_KEY`: signing_key_base64.txt 的内容
- `ALIAS`: zdclock
- `KEY_STORE_PASSWORD`: 你设置的密码
- `KEY_PASSWORD`: 你设置的密码

### 4. 触发构建

推送代码后自动触发构建，或手动点击 Actions 标签页 → Build APK → Run workflow

### 5. 下载 APK

构建完成后，在 Actions 页面点击构建记录 → Artifacts 下载 APK 文件。

## 方法三：命令行构建（需要 Java + Android SDK）

```bash
# 同步资源
npm run sync

# 构建 Release APK
cd android && ./gradlew assembleRelease

# APK 输出路径
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## 开发调试

```bash
# 同步并打开 Android Studio
npm run dev

# 仅同步
npm run sync
```

## 注意事项

1. **闹钟限制**：网页版闹钟在锁屏或应用被杀后台后无法 100% 保证响铃。建议睡前保持APP在前台，或配合系统闹钟作为充底。
2. **权限**：首次启动时请允许震动、通知、充足电等权限，以确保闹钟功能正常。
3. **电量优化**：建议在设置中将本APP加入电池优化白名单，避免系统杀后台。

## License

ISC
