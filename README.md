# 风起向日葵

《风起向日葵》是作者 Lxx66 的一段桌面互动水彩体验。体验者先以单手带起微风，再按提示加入第二只手。双手之间形成风带，风经过哪片区域，那里的向日葵就先开放。

![风起向日葵全盛画面](./assets/preview.png)

## 运行

项目不需要构建步骤。通过本地 HTTP 服务打开即可：

```powershell
cd .\wind-lilies
python -m http.server 4177
```

访问 `http://127.0.0.1:4177/`。

摄像头只在 `localhost` 或 HTTPS 页面中可用。手部识别运行库和模型已放在 `vendor/mediapipe` 中，网站运行时不需要从第三方 CDN 下载。加载失败或拒绝摄像头时可以使用鼠标体验完成整段演出。

## 发布到 GitHub Pages

1. 将 `wind-lilies` 目录中的全部文件上传到一个 GitHub 仓库。
2. 打开仓库 `Settings > Pages`。
3. 在 `Build and deployment` 中选择 `Deploy from a branch`。
4. 选择主分支和 `/ (root)` 目录并保存。
5. 等待 GitHub 生成 HTTPS 链接。

如果整个仓库不是以 `wind-lilies` 为根目录，需要把页面放进仓库根目录，或将 GitHub Pages 的发布目录调整到包含 `index.html` 的位置。

## 文件说明

- `index.html`：页面结构、入口、兼容性提示和摄像头小镜。
- `styles.css`：全屏舞台、水彩纸纹理、提示与响应式兼容层。
- `js/scene.js`：程序化水彩花园、向日葵、风场、草叶和花粉。
- `js/hand-tracker.js`：MediaPipe 双手追踪与小镜关键点绘制。
- `js/app.js`：单手到双手的五阶段编排、暂停恢复和鼠标替代模式。
- `js/score-player.js`：配乐播放、暂停、淡出与静音。
- `assets/wind-sunflowers-score.wav`：固定钢琴与竖琴配乐。
- `tools/generate_score.py`：配乐的确定性生成脚本。

## 隐私与兼容性

- 摄像头画面不离开浏览器，不上传服务器。
- 目标环境为至少 `1280 × 720` 的桌面 Chrome 或 Edge。
- 手机或较小窗口只显示兼容性提示。
- 鼠标模式保留完整演出，但不是双手摄像头的等价交互。
