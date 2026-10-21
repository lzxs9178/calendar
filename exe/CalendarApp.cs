using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// 万年历 · 节日与日程 —— Windows 桌面版
//
// 做法：把整个网页（html/css/js）作为资源打包进 exe，运行时用原生 TCP 实现的小型 HTTP 服务
// 在 127.0.0.1 的随机端口提供这些文件，再用无边框窗口（浏览器 --app 模式）打开。
// 好处：单个 exe、免安装、离线可用；因为是 http 来源，浏览器允许保存数据。
//
// 命令行：
//   wanNianLi.exe                 正常启动（打开窗口）
//   wanNianLi.exe --selftest 8199 自检模式：用指定端口起服务，打印检查结果后退出
namespace CalendarApp
{
    internal static class Program
    {
        private static TcpListener server;
        private static int port;
        private static DateTime lastRequest = DateTime.MinValue;
        private static long requestCount = 0;
        private static readonly Dictionary<string, byte[]> cache =
            new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        private static readonly string[] REQUIRED = new string[]
        {
            "index.html", "style.css", "lunar.js", "festivals.js", "almanac.js", "history.js", "events.js", "app.js"
        };

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Length >= 2 && args[0] == "--selftest")
            {
                RunSelfTest(args[1]);
                return;
            }

            if (args.Length >= 1 && args[0] == "--checkbrowser")
            {
                Console.WriteLine("候选浏览器路径（按优先级）：");
                List<string> cands = BrowserCandidates();
                string chosen = null;
                foreach (string c in cands)
                {
                    bool exists = !string.IsNullOrEmpty(c) && File.Exists(c);
                    Console.WriteLine((exists ? "  [可用] " : "  [无]   ") + c);
                    if (exists && chosen == null) chosen = c;
                }
                if (chosen == null)
                {
                    Console.WriteLine("\nRESULT: NO BROWSER FOUND（将退回系统默认浏览器打开）");
                    Environment.Exit(3);
                }
                Console.WriteLine("\n将使用: " + chosen);
                Console.WriteLine("启动参数: --app=http://127.0.0.1:<端口>/ --user-data-dir=<临时目录> --no-first-run");
                Console.WriteLine("\nRESULT: OK");
                Environment.Exit(0);
            }

            if (args.Length >= 2 && args[0] == "--serve")
            {
                // 只提供服务、不打开窗口（自动化验证用），Ctrl+C 或结束进程退出
                int sp;
                if (!int.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out sp)) sp = 0;
                try
                {
                    port = StartServer(sp);
                    Console.WriteLine("serving on http://127.0.0.1:" + port + "/");
                }
                catch (Exception ex)
                {
                    Console.WriteLine("start failed: " + ex.Message);
                    Environment.Exit(2);
                }
                Thread.Sleep(Timeout.Infinite);
                return;
            }

            try
            {
                port = StartServer(0);
            }
            catch (Exception ex)
            {
                MessageBox.Show("无法启动内置服务：\n" + ex.Message, "万年历",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string url = "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture) + "/";
            string profile = Path.Combine(Path.GetTempPath(), "calendar-app-profile");
            try { Directory.CreateDirectory(profile); } catch { }

            bool opened = false;
            try { opened = OpenAppWindow(url, profile); } catch { opened = false; }
            if (!opened) { try { Process.Start(url); opened = true; } catch { } }
            if (!opened)
            {
                MessageBox.Show(
                    "没有找到可用的浏览器。\n\n请手动在浏览器里打开下面的地址（本程序需要保持运行）：\n" + url,
                    "万年历", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Application.Run();
                return;
            }

            // 驻留：浏览器窗口会持续请求资源；连续 8 秒没有新请求就认为窗口已关闭
            DateTime started = DateTime.Now;
            bool everServed = false;
            while (true)
            {
                Thread.Sleep(2000);
                long c = Interlocked.Read(ref requestCount);
                if (c > 0) everServed = true;
                double idle = (DateTime.Now - lastRequest).TotalSeconds;
                if (everServed && idle > 8) break;
                if (!everServed && (DateTime.Now - started).TotalSeconds > 300) break;
            }
            StopServer();
        }

        /* ---------------- 自检模式 ---------------- */

        private static void RunSelfTest(string portArg)
        {
            int want;
            if (!int.TryParse(portArg, NumberStyles.Integer, CultureInfo.InvariantCulture, out want) || want <= 0)
            {
                Console.WriteLine("BAD  invalid port: " + portArg);
                Environment.Exit(2);
            }
            int fails = 0;
            try
            {
                port = StartServer(want);
            }
            catch (Exception ex)
            {
                Console.WriteLine("BAD  server start failed: " + ex.Message);
                Environment.Exit(2);
                return;
            }
            Console.WriteLine("OK   server listening on port " + port);

            Assembly asm = Assembly.GetExecutingAssembly();
            string[] names = asm.GetManifestResourceNames();
            Console.WriteLine("     embedded resources: " + names.Length);
            foreach (string f in REQUIRED)
            {
                byte[] data = GetResource(f);
                if (data == null) { Console.WriteLine("BAD  missing embedded file: " + f); fails++; }
                else Console.WriteLine("OK   " + f.PadRight(14) + " " + (data.Length / 1024) + " KB");
            }

            string baseUrl = "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture);
            int httpOk = 0;
            foreach (string f in REQUIRED)
            {
                try
                {
                    using (WebClient wc = new WebClient())
                    {
                        wc.Encoding = Encoding.UTF8;
                        byte[] got = wc.DownloadData(baseUrl + "/" + f);
                        if (got.Length > 0) httpOk++;
                        else { Console.WriteLine("BAD  empty over HTTP: " + f); fails++; }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("BAD  HTTP fetch failed " + f + ": " + ex.Message);
                    fails++;
                }
            }
            Console.WriteLine("OK   served over HTTP: " + httpOk + "/" + REQUIRED.Length);

            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    string html = wc.DownloadString(baseUrl + "/index.html");
                    if (html.IndexOf("calendar") < 0)
                    { Console.WriteLine("BAD  index.html content looks wrong"); fails++; }
                    else Console.WriteLine("OK   index.html content ok");

                    string hist = wc.DownloadString(baseUrl + "/history.js");
                    if (hist.IndexOf("HistoryDB") < 0) { Console.WriteLine("BAD  history.js content wrong"); fails++; }
                    else Console.WriteLine("OK   history.js contains HistoryDB");

                    string al = wc.DownloadString(baseUrl + "/almanac.js");
                    if (al.IndexOf("Almanac") < 0) { Console.WriteLine("BAD  almanac.js content wrong"); fails++; }
                    else Console.WriteLine("OK   almanac.js contains Almanac");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("BAD  content check failed: " + ex.Message);
                fails++;
            }

            try
            {
                using (WebClient wc = new WebClient())
                {
                    try { wc.DownloadData(baseUrl + "/no-such-file.js"); Console.WriteLine("BAD  missing file returned 200"); fails++; }
                    catch (WebException we)
                    {
                        HttpWebResponse r = we.Response as HttpWebResponse;
                        if (r != null && (int)r.StatusCode == 404) Console.WriteLine("OK   missing file returns 404");
                        else { Console.WriteLine("BAD  unexpected status for missing file"); fails++; }
                    }
                }
            }
            catch (Exception ex) { Console.WriteLine("BAD  404 check failed: " + ex.Message); fails++; }

            StopServer();
            Console.WriteLine(fails == 0 ? "\nRESULT: ALL PASSED" : "\nRESULT: " + fails + " FAILED");
            Environment.Exit(fails == 0 ? 0 : 1);
        }

        /* ---------------- HTTP 服务（原生 TCP） ---------------- */

        private static int StartServer(int wanted)
        {
            int p = wanted > 0 ? wanted : FreePort();
            server = new TcpListener(IPAddress.Loopback, p);
            server.Start();
            lastRequest = DateTime.Now;
            Thread t = new Thread(Loop);
            t.IsBackground = true;
            t.Start();
            return p;
        }

        private static int FreePort()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int p = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return p;
        }

        private static void Loop()
        {
            while (true)
            {
                TcpClient client;
                try { client = server.AcceptTcpClient(); }
                catch { return; }
                ThreadPool.QueueUserWorkItem(HandleClient, client);
            }
        }

        private static void HandleClient(object state)
        {
            TcpClient client = (TcpClient)state;
            try
            {
                Interlocked.Increment(ref requestCount);
                lastRequest = DateTime.Now;
                client.ReceiveTimeout = 8000;
                client.SendTimeout = 8000;
                using (NetworkStream ns = client.GetStream())
                {
                    string requestLine = ReadLine(ns);
                    if (requestLine == null) return;
                    while (true)
                    {
                        string h = ReadLine(ns);
                        if (h == null || h.Length == 0) break;
                    }

                    string[] parts = requestLine.Split(' ');
                    string target = parts.Length >= 2 ? parts[1] : "/";
                    int q = target.IndexOf('?');
                    if (q >= 0) target = target.Substring(0, q);
                    target = Uri.UnescapeDataString(target);
                    if (target == "/" || target.Length == 0) target = "/index.html";

                    string name = target.TrimStart('/').Replace('/', '.');
                    byte[] body = GetResource(name);
                    bool found = body != null;
                    if (!found)
                    {
                        body = Encoding.UTF8.GetBytes("404 not found: " + target);
                        lastRequest = DateTime.Now;
                    }

                    StringBuilder head = new StringBuilder();
                    head.Append(found ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 404 Not Found\r\n");
                    head.Append("Content-Type: ").Append(found ? Mime(target) : "text/plain; charset=utf-8").Append("\r\n");
                    head.Append("Content-Length: ").Append(body.Length.ToString(CultureInfo.InvariantCulture)).Append("\r\n");
                    head.Append("Cache-Control: no-store\r\n");
                    head.Append("Connection: close\r\n\r\n");
                    byte[] headBytes = Encoding.ASCII.GetBytes(head.ToString());
                    ns.Write(headBytes, 0, headBytes.Length);
                    ns.Write(body, 0, body.Length);
                    ns.Flush();
                }
            }
            catch { }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private static string ReadLine(Stream s)
        {
            MemoryStream ms = new MemoryStream();
            int b = -1;
            while ((b = s.ReadByte()) >= 0)
            {
                if (b == 10) break;
                if (b == 13) continue;
                if (ms.Length > 8192) break;
                ms.WriteByte((byte)b);
            }
            if (ms.Length == 0 && b < 0) return null;
            return Encoding.UTF8.GetString(ms.ToArray());
        }

        private static void StopServer()
        {
            try { if (server != null) server.Stop(); } catch { }
        }

        private static string Mime(string path)
        {
            string e = Path.GetExtension(path).ToLowerInvariant();
            switch (e)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".ico": return "image/x-icon";
                case ".png": return "image/png";
                default: return "application/octet-stream";
            }
        }

        /// <summary>按资源名后缀取内嵌文件</summary>
        private static byte[] GetResource(string name)
        {
            lock (cache) { if (cache.ContainsKey(name)) return cache[name]; }
            Assembly asm = Assembly.GetExecutingAssembly();
            string[] all = asm.GetManifestResourceNames();
            string needle = "." + name;
            string hit = null;
            foreach (string r in all)
            {
                if (r.EndsWith(needle, StringComparison.OrdinalIgnoreCase)) { hit = r; break; }
            }
            if (hit == null) return null;
            using (Stream s = asm.GetManifestResourceStream(hit))
            {
                if (s == null) return null;
                byte[] buf = new byte[s.Length];
                int read = 0;
                while (read < buf.Length)
                {
                    int n = s.Read(buf, read, buf.Length - read);
                    if (n <= 0) break;
                    read += n;
                }
                lock (cache) { cache[name] = buf; }
                return buf;
            }
        }

        /// <summary>用 --app 模式打开无边框窗口（Edge / Chrome），失败返回 false</summary>
        private static bool OpenAppWindow(string url, string profile)
        {
            foreach (string exe in BrowserCandidates())
            {
                if (string.IsNullOrEmpty(exe) || !File.Exists(exe)) continue;
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exe);
                    psi.Arguments = "--app=" + url
                        + " --user-data-dir=\"" + profile + "\""
                        + " --no-first-run --no-default-browser-check";
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                    return true;
                }
                catch { }
            }
            return false;
        }

        /// <summary>
        /// 候选浏览器：优先 Chromium 内核的 Edge / Chrome（它们可靠支持 --app 无边框窗口），
        /// 最后才用注册表登记的默认浏览器（可能是夸克等不支持 --app 的浏览器）。
        /// </summary>
        private static List<string> BrowserCandidates()
        {
            List<string> list = new List<string>();
            string[] roots = new string[]
            {
                Environment.ExpandEnvironmentVariables(@"%ProgramFiles%"),
                Environment.ExpandEnvironmentVariables(@"%ProgramFiles(x86)%"),
                Environment.ExpandEnvironmentVariables(@"%LocalAppData%\Programs"),
                Environment.ExpandEnvironmentVariables(@"%LocalAppData%")
            };

            // 1) 已知支持 --app 的浏览器
            string[][] known = new string[][]
            {
                new string[] { "Microsoft Edge", @"Microsoft\Edge\Application\msedge.exe" },
                new string[] { "Google Chrome", @"Google\Chrome\Application\chrome.exe" },
                new string[] { "Chromium", @"Chromium\Application\chrome.exe" },
                new string[] { "Brave", @"BraveSoftware\Brave-Browser\Application\brave.exe" },
                new string[] { "Vivaldi", @"Vivaldi\Application\vivaldi.exe" }
            };
            foreach (string root in roots)
            {
                if (string.IsNullOrEmpty(root)) continue;
                foreach (string[] k in known)
                {
                    string p = Path.Combine(root, k[1]);
                    if (File.Exists(p) && !list.Contains(p)) list.Add(p);
                }
            }

            // 2) 最后才考虑注册表里的默认浏览器（可能不支持 --app，会退回普通窗口/默认打开）
            try
            {
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"))
                {
                    if (k != null)
                    {
                        object pid = k.GetValue("ProgId");
                        if (pid != null) AddFromProgId(list, pid.ToString());
                    }
                }
            }
            catch { }
            try
            {
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.ClassesRoot.OpenSubKey(
                    @"http\shell\open\command"))
                {
                    if (k != null)
                    {
                        object v = k.GetValue(null);
                        if (v != null) AddFromCommand(list, v.ToString());
                    }
                }
            }
            catch { }
            return list;
        }

        private static void AddFromProgId(List<string> list, string progId)
        {
            try
            {
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.ClassesRoot.OpenSubKey(
                    progId + @"\shell\open\command"))
                {
                    if (k != null)
                    {
                        object v = k.GetValue(null);
                        if (v != null) AddFromCommand(list, v.ToString());
                    }
                }
            }
            catch { }
        }

        /// <summary>从 "C:\...\xxx.exe" --arg 这样的命令行里取出 exe 路径</summary>
        private static void AddFromCommand(List<string> list, string command)
        {
            if (string.IsNullOrEmpty(command)) return;
            string cmd = command.Trim();
            string path = null;
            if (cmd.StartsWith("\""))
            {
                int end = cmd.IndexOf('"', 1);
                if (end > 1) path = cmd.Substring(1, end - 1);
            }
            else
            {
                int sp = cmd.IndexOf(" -");
                if (sp < 0) sp = cmd.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
                if (sp >= 0) path = cmd.Substring(0, sp + 4);
            }
            if (!string.IsNullOrEmpty(path) && File.Exists(path) && !list.Contains(path)) list.Add(path);
        }
    }
}
