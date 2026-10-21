把「万年历」发布到 GitHub（Windows 操作指南）
=============================================

这份指南从零开始：装 Git → 建仓库 → 推代码 → 开 Pages 在线预览。
命令都在 **Windows PowerShell** 里执行。


第 0 步：准备账号
-----------------

1. 打开 https://github.com 注册或登录。
2. 记下你的**用户名**（例如 `zhangsan`）。


第 1 步：安装 Git
-----------------

1. 下载：https://git-scm.com/download/win （64 位选 "64-bit Git for Windows Setup"）
2. 一路下一步安装即可（默认选项就行）。
3. 装完**新开一个 PowerShell 窗口**，验证：

       git --version

   能显示版本号（如 git version 2.47.0）就成功了。


第 2 步：配置 Git 身份（只需一次）
----------------------------------

    git config --global user.name "你的名字"
    git config --global user.email "你的邮箱@example.com"

    # 让 Git 支持中文文件名显示，避免路径乱码
    git config --global core.quotepath false


第 3 步：检查要上传哪些文件
---------------------------

先进入项目目录（把路径换成你自己的）：

    cd C:\Users\你的用户名\Documents\deepseek-harness\default-workspace\calendar
    git status

**重点**：确认输出里**没有** `node_modules`、`tools/tr`、`*.exe`、`history-pending.json`
这些——它们已经被项目里的 `.gitignore` 排除了。

预期会看到：`js/`、`css/`、`docs/`、`exe/CalendarApp.cs`、`tools/*.cjs`、`README.md` 等。
总大小约 8 MB（主要是 `history.js` 842 KB 与几份生成物），可以放心推。


第 4 步：在 GitHub 上新建仓库
-----------------------------

1. 打开 https://github.com/new
2. **Repository name** 填 `calendar`（或任意名字）
3. **Description** 填：`离线中文万年历：每日节日、黄历宜忌、历史上的今天、农历与节气`
4. 选 **Public**（开源）
5. **不要**勾选 "Add a README file" / "Add .gitignore" / "Choose a license"
   （本地已经有了，勾了会冲突）
6. 点 **Create repository**

创建后会看到一页提示，里面有一段带仓库地址的命令，形如：

    https://github.com/你的用户名/calendar.git


第 5 步：把本地代码推上去
-------------------------

在项目目录里依次执行：

    git init
    git add .
    git commit -m "初始提交：万年历（节日 / 黄历 / 历史上的今天 / 农历节气 / 日程）"
    git branch -M main
    git remote add origin https://github.com/你的用户名/calendar.git
    git push -u origin main

第一次 `git push` 会弹出登录窗口：

  · 推荐方式：浏览器弹窗里点 "Sign in with your browser"，登录后授权即可。
  · 或者用 Personal Access Token：GitHub → Settings → Developer settings →
    Personal access tokens → Tokens (classic) → Generate new token，勾选 `repo` 权限，
    生成后复制那串 `ghp_...`，在命令行提示输入密码时**粘贴它**（不是账号密码）。

看到 `Branch 'main' set up to track remote branch 'main'` 就成功了。


第 6 步：开启在线预览（GitHub Pages）
-------------------------------------

1. 打开你的仓库 → **Settings**（顶部）→ 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，**目录**选 `/docs`，点 **Save**
4. 等 1~2 分钟，刷新页面，顶部会出现你的网址：

       https://你的用户名.github.io/calendar/

   这就是**在线可用的日历**，手机上也能打开（通过 https 访问，数据能正常保存）。


第 7 步（可选）：让仓库更专业
-----------------------------

- **About 栏**：仓库首页右上角齿轮 → 添加 Description、Website（填 Pages 网址）
- **Topics 标签**：加 `calendar` `chinese-calendar` `almanac` `lunar-calendar`
  `javascript` `offline` `holidays` `vanilla-js`
- **发版本**：右侧 Releases → Draft a new release → 打 `v1.0.0`，
  把 `calendar.html` 和 `万年历-Windows版.zip` 作为附件上传，别人就能直接下载成品
- **给仓库加图片**：README 里已经引用了 `docs/preview.png`，推上去会自动显示


以后修改了代码，怎么更新？
--------------------------

    git add .
    git commit -m "说明这次改了什么"
    git push

更新 Pages 内容时，因为 `docs/` 是构建产物，记得先重新生成：

    node build-standalone.cjs
    git add . && git commit -m "重新构建" && git push


常见问题
--------

**Q: 提示 "fatal: not a git repository"**
  你没在项目目录里执行，先 `cd` 到 calendar 文件夹。

**Q: 提示 "failed to push some refs" / "rejected"**
  远程仓库里已经有提交（可能你创建时勾了 README）。执行：

      git pull --rebase origin main
      git push -u origin main

**Q: 提示 "Authentication failed"**
  用 Personal Access Token 代替密码（见第 5 步），注意 token 要勾 `repo` 权限。

**Q: 不小心把 node_modules 提交了**
  在项目目录执行：

      git rm -r --cached node_modules
      git commit -m "移除误提交的 node_modules"
      git push

**Q: Pages 打开是空的 / 404**
  检查 Pages 的目录是否选了 `/docs`（不是根目录）；`docs/index.html` 必须存在。
  等 1~2 分钟再刷新，第一次部署有延迟。

**Q: 想把 exe 也提供下载**
  `.gitignore` 排除了 `exe/*.exe`（exe 1 MB，每次编译都会变，不适合进版本库）。
  推荐用 **Releases 附件** 上传 exe，这样不进历史、不撑大仓库。


本项目已准备好的文件
--------------------

    LICENSE               MIT 协议（含第三方数据说明）
    .gitignore            已排除 node_modules / 构建缓存 / exe
    .gitattributes        统一换行符
    README.md             开源版说明（含界面预览图）
    docs/preview.png      预览图，README 已引用
    docs/                 GitHub Pages 可部署目录

不需要再动别的，按上面 7 步走即可。
