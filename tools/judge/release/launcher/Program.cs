// 불만족 평가 피드백 자동분류 런처. 빌드: build-release.ps1 (Windows 내장 csc.exe 사용, 별도 도구 불필요)
// 동작: 내장 payload.zip(프롬프트·스크립트·Node 실행 파일·Claude Code 명령)을 %LOCALAPPDATA%\FeedbackJudge\v<버전>\ 에 풀고,
//       그 폴더에서 claude -p "/판정 <파일>" 을 실행한 뒤 결과 파일을 원본 옆에 복사한다.
//       Claude 의 작업 이벤트(stream-json)를 읽어 단계별 진행 상황과 경과 시간을 화면에 보여 준다.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// 콘솔과 로그 파일에 동시에 쓴다
class TeeWriter : TextWriter
{
    readonly TextWriter a, b;
    public TeeWriter(TextWriter a, TextWriter b) { this.a = a; this.b = b; }
    public override Encoding Encoding { get { return a.Encoding; } }
    public override void Write(char value) { a.Write(value); b.Write(value); }
    public override void Write(string value) { a.Write(value); b.Write(value); }
    public override void WriteLine(string value) { a.WriteLine(value); b.WriteLine(value); }
    public override void WriteLine() { a.WriteLine(); b.WriteLine(); }
    public override void Flush() { a.Flush(); b.Flush(); }
}

static class Program
{
    const string DashboardUrl = "https://ai-satisfaction-dashboard.vercel.app/records";
    static readonly object ConsoleLock = new object();
    static Stopwatch Clock = Stopwatch.StartNew();
    static DateTime LastEvent = DateTime.Now;
    static string CurrentStage = "준비";

    [STAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "불만족 평가 피드백 자동분류 v" + Version.Value;
        // 화면에 찍는 내용을 로그 파일에도 남긴다 (문제 생겼을 때 캡처 대신 이 파일을 전달)
        try
        {
            string logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FeedbackJudge");
            Directory.CreateDirectory(logDir);
            string logPath = Path.Combine(logDir, "최근_실행_로그.txt");
            var fileWriter = new StreamWriter(logPath, false, new UTF8Encoding(false)); fileWriter.AutoFlush = true;
            fileWriter.WriteLine("실행 시각: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " / 버전 " + Version.Value);
            Console.SetOut(new TeeWriter(Console.Out, fileWriter));
        }
        catch { }
        try { return Run(args); }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine("  오류: " + ex.Message);
            Console.WriteLine("  이 창을 캡처해 AI 전략팀에 전달해 주세요.");
            Pause();
            return 1;
        }
    }

    static int Run(string[] args)
    {
        string file = args.Length > 0 ? args[0] : PickFile();
        if (string.IsNullOrEmpty(file))
        {
            Console.WriteLine();
            Console.WriteLine("  파일을 선택하지 않았습니다. Metabase 내보내기 파일을 고르거나 이 아이콘 위로 끌어다 놓으세요.");
            Pause();
            return 1;
        }
        file = Path.GetFullPath(file);
        if (!File.Exists(file))
        {
            Console.WriteLine();
            Console.WriteLine("  파일을 찾을 수 없습니다: " + file);
            Pause();
            return 1;
        }

        // 폴더 이름은 영문으로 둔다: Node 가 한글 경로 안의 모듈을 불러올 때 크래시하는 경우가 있음
        string baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FeedbackJudge", "v" + Version.Value);
        EnsureExtracted(baseDir);

        string claude = FindClaude();
        if (claude == null)
        {
            Console.WriteLine();
            Console.WriteLine("  Claude Code가 설치되어 있지 않습니다. 설치 후 한 번 로그인하고 다시 실행하세요.");
            Console.WriteLine("  https://claude.com/claude-code");
            Pause();
            return 1;
        }

        Console.WriteLine();
        Console.WriteLine("======================================================");
        Console.WriteLine(" 불만족 평가 피드백 자동분류 v" + Version.Value);
        Console.WriteLine(" 대상 파일: " + file);
        Console.WriteLine("======================================================");
        Console.WriteLine();

        // 0) 먼저 입력을 읽어 판정 대상 건수를 보여 준다 (Claude 실행 전, 몇 초)
        string runtimePath = Path.Combine(baseDir, "runtime") + ";" + (Environment.GetEnvironmentVariable("PATH") ?? "");
        int targetCount = Precheck(baseDir, file, runtimePath);
        if (targetCount == 0)
        {
            Console.WriteLine();
            Console.WriteLine(" 이 파일에는 불만족(down) 행이 없습니다. 판정 없이 원본을 그대로 대시보드에 올리면 됩니다.");
            Pause();
            return 0;
        }
        if (targetCount > 0)
        {
            int min = Math.Max(3, (int)Math.Ceiling(targetCount * 0.2));
            int max = Math.Max(5, (int)Math.Ceiling(targetCount * 0.35));
            Console.WriteLine(" 예상 소요: 약 " + min + "~" + max + "분. 아래에 진행 상황이 표시됩니다. 이 창을 닫지 마세요.");
        }
        Console.WriteLine();

        // 1) Claude Code 실행 (stream-json 으로 이벤트를 받아 진행 표시)
        var psi = new ProcessStartInfo();
        psi.FileName = claude;
        psi.Arguments = "-p \"/판정 " + file + "\" --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools \"Bash(node tools/judge/scripts/*)\" Read Write Edit Glob Grep Agent";
        psi.WorkingDirectory = baseDir;
        psi.UseShellExecute = false;
        psi.RedirectStandardOutput = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["PATH"] = runtimePath;

        Clock.Restart();
        LastEvent = DateTime.Now;
        Stage("Claude Code 시작");
        var heartbeat = new Thread(Heartbeat); heartbeat.IsBackground = true; heartbeat.Start();

        string finalText = null;
        int agentCount = 0;
        var ser = new JavaScriptSerializer(); ser.MaxJsonLength = int.MaxValue;
        using (var p = Process.Start(psi))
        {
            string line;
            while ((line = p.StandardOutput.ReadLine()) != null)
            {
                if (line.Length == 0 || line[0] != '{') continue;
                Dictionary<string, object> ev;
                try { ev = ser.Deserialize<Dictionary<string, object>>(line); } catch { continue; }
                string type = Str(ev, "type");
                if (type == "assistant")
                {
                    var msg = ev.ContainsKey("message") ? ev["message"] as Dictionary<string, object> : null;
                    // JavaScriptSerializer 는 배열을 ArrayList 로 푼다
                    var content = msg != null && msg.ContainsKey("content") ? msg["content"] as System.Collections.IEnumerable : null;
                    if (content is string) content = null;
                    if (content == null) continue;
                    foreach (var c in content)
                    {
                        var block = c as Dictionary<string, object>;
                        if (block == null) continue;
                        string bt = Str(block, "type");
                        if (bt == "text") { finalText = Str(block, "text"); continue; }
                        if (bt != "tool_use") continue;
                        string name = Str(block, "name");
                        var input = block.ContainsKey("input") ? block["input"] as Dictionary<string, object> : null;
                        string cmd = input != null ? Str(input, "command") : "";
                        string path = input != null ? Str(input, "file_path") : "";
                        if (name == "Bash" && cmd.Contains("prepare.js")) Stage("1/4 입력 파일 읽는 중");
                        else if (name == "Read" && path.Contains("시스템프롬프트")) Stage("2/4 판정 기준 읽는 중");
                        else if (name == "Read" && path.Contains("입력_")) Stage("3/4 판정 중 (건별로 판단, 몇 분 걸림)");
                        else if (name == "Agent") { agentCount++; Stage("3/4 판정 중 (묶음 " + agentCount + " 시작, 10건씩 병렬)"); }
                        else if (name == "Write" && path.Contains("판정")) Stage("3/4 판정 결과 저장 중");
                        else if (name == "Bash" && cmd.Contains("export.js")) Stage("4/4 엑셀 만드는 중");
                    }
                }
                else if (type == "result")
                {
                    string sub = Str(ev, "subtype");
                    if (sub != "success") Stage("Claude Code 종료: " + sub);
                }
            }
            p.WaitForExit();
        }
        CurrentStage = null;

        string name2 = Path.GetFileNameWithoutExtension(file);
        string result = Path.Combine(baseDir, "tools", "judge", "output", name2 + "_판정.xlsx");
        string srcDir = Path.GetDirectoryName(file);
        Console.WriteLine();
        if (!string.IsNullOrEmpty(finalText))
        {
            Console.WriteLine("------------------------------------------------------");
            Console.WriteLine(finalText.Trim());
            Console.WriteLine("------------------------------------------------------");
            Console.WriteLine();
        }
        if (File.Exists(result))
        {
            string copied = Path.Combine(srcDir, name2 + "_판정.xlsx");
            File.Copy(result, copied, true);
            Console.WriteLine("======================================================");
            Console.WriteLine(" 완료 (" + Elapsed() + "). 결과 파일: " + copied);
            Console.WriteLine(" 열리는 대시보드 [데이터 조회] 업로드에 이 파일을 올리세요.");
            Console.WriteLine("======================================================");
            try { Process.Start("explorer.exe", "/select,\"" + copied + "\""); } catch { }
            try { Process.Start(new ProcessStartInfo(DashboardUrl) { UseShellExecute = true }); } catch { }
        }
        else
        {
            Console.WriteLine(" 결과 파일이 만들어지지 않았습니다. 아래 로그 파일을 AI 전략팀에 전달해 주세요.");
            Console.WriteLine(" 로그 파일: " + Path.Combine(Path.GetDirectoryName(baseDir), "최근_실행_로그.txt"));
            Console.WriteLine(" 작업 폴더: " + baseDir);
        }
        Pause();
        return 0;
    }

    // prepare.js 를 먼저 돌려 대상 건수를 읽는다. 실패하면 -1 (Claude 단계에서 다시 시도)
    static int Precheck(string baseDir, string file, string pathEnv)
    {
        try
        {
            var psi = new ProcessStartInfo();
            psi.FileName = Path.Combine(baseDir, "runtime", "node.exe");
            if (!File.Exists(psi.FileName)) psi.FileName = "node";
            psi.Arguments = "\"" + Path.Combine("tools", "judge", "scripts", "prepare.js") + "\" \"" + file + "\"";
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;
            psi.EnvironmentVariables["PATH"] = pathEnv;
            using (var p = Process.Start(psi))
            {
                string outText = p.StandardOutput.ReadToEnd();
                string errText = p.StandardError.ReadToEnd();
                p.WaitForExit();
                int count = -1;
                foreach (string l in outText.Split('\n'))
                {
                    string t = l.Trim();
                    int i = t.IndexOf("판정 대상 ");
                    if (i < 0) continue;
                    Console.WriteLine(" " + t);
                    string num = "";
                    foreach (char ch in t.Substring(i + 6)) { if (char.IsDigit(ch)) num += ch; else break; }
                    int n; if (int.TryParse(num, out n)) count = n;
                }
                if (p.ExitCode != 0)
                {
                    string msg = (errText + outText).Trim();
                    Console.WriteLine(" 입력 확인 단계 메시지: " + (msg.Length > 400 ? msg.Substring(0, 400) : msg));
                    return -1;
                }
                return count;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(" 입력 확인을 건너뜁니다 (" + ex.Message + ")");
            return -1;
        }
    }

    static void Stage(string s)
    {
        lock (ConsoleLock)
        {
            CurrentStage = s;
            LastEvent = DateTime.Now;
            Console.WriteLine(" [" + Elapsed() + "] " + s);
        }
    }

    // 30초 동안 이벤트가 없으면 아직 진행 중임을 알린다 (판정 단계는 도구 호출 없이 몇 분 걸림)
    static void Heartbeat()
    {
        while (true)
        {
            Thread.Sleep(1000);
            string stage = CurrentStage;
            if (stage == null) return;
            if ((DateTime.Now - LastEvent).TotalSeconds >= 30)
            {
                lock (ConsoleLock)
                {
                    LastEvent = DateTime.Now;
                    Console.WriteLine(" [" + Elapsed() + "] ... 진행 중 (" + stage + ")");
                }
            }
        }
    }

    static string Elapsed()
    {
        var t = Clock.Elapsed;
        return ((int)t.TotalMinutes).ToString("00") + ":" + t.Seconds.ToString("00");
    }

    static string Str(Dictionary<string, object> d, string key)
    {
        object v; return d != null && d.TryGetValue(key, out v) && v != null ? v.ToString() : "";
    }

    static string PickFile()
    {
        using (var d = new OpenFileDialog())
        {
            d.Title = "Metabase 내보내기 파일 선택";
            d.Filter = "Excel/CSV (*.xlsx;*.xls;*.csv)|*.xlsx;*.xls;*.csv|모든 파일 (*.*)|*.*";
            string dl = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (Directory.Exists(dl)) d.InitialDirectory = dl;
            return d.ShowDialog() == DialogResult.OK ? d.FileName : null;
        }
    }

    // 같은 버전 폴더에 marker 가 있으면 재사용, 없으면 내장 zip 을 푼다(버전이 오르면 새 폴더에 풀린다)
    static void EnsureExtracted(string baseDir)
    {
        string marker = Path.Combine(baseDir, ".extracted");
        if (File.Exists(marker)) return;
        Console.WriteLine(" 처음 실행: 자동분류 파일을 준비하는 중... (" + baseDir + ")");
        if (Directory.Exists(baseDir)) Directory.Delete(baseDir, true);
        Directory.CreateDirectory(baseDir);
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        {
            if (s == null) throw new Exception("내장 payload.zip 이 없습니다. 빌드가 잘못되었습니다.");
            using (var za = new ZipArchive(s, ZipArchiveMode.Read, false, Encoding.UTF8))
            {
                foreach (var e in za.Entries)
                {
                    // .NET Framework 의 ZipFile.CreateFromDirectory 는 구분자를 \ 로 쓰기도 한다
                    string rel = e.FullName.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
                    string dest = Path.GetFullPath(Path.Combine(baseDir, rel));
                    if (!dest.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase)) continue;
                    if (rel.EndsWith(Path.DirectorySeparatorChar.ToString()) || e.Name.Length == 0) { Directory.CreateDirectory(dest); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    e.ExtractToFile(dest, true);
                }
            }
        }
        File.WriteAllText(marker, Version.Value);
    }

    static string FindClaude()
    {
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in pathEnv.Split(';'))
        {
            if (dir.Trim().Length == 0) continue;
            foreach (string n in new[] { "claude.exe", "claude.cmd", "claude.bat" })
            {
                string f = Path.Combine(dir.Trim(), n);
                if (File.Exists(f)) return f;
            }
        }
        string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin", "claude.exe");
        if (File.Exists(local)) return local;
        return null;
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.Write(" 아무 키나 누르면 창이 닫힙니다...");
        try { Console.ReadKey(true); } catch { }
    }
}
