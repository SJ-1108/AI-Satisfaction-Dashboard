// 불만족 피드백 판정기 런처. 빌드: build-release.ps1 (Windows 내장 csc.exe 사용, 별도 도구 불필요)
// 동작: 내장 payload.zip(프롬프트·스크립트·Node 실행 파일·Claude Code 명령)을 %LOCALAPPDATA%\FeedbackJudge\v<버전>\ 에 풀고,
//       그 폴더에서 claude -p "/판정 <파일>" 을 실행한 뒤 결과 파일을 원본 옆에 복사한다.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

static class Program
{
    const string DashboardUrl = "https://ai-satisfaction-dashboard.vercel.app/records";

    [STAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "불만족 피드백 판정기 v" + Version.Value;
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
        Console.WriteLine(" 불만족 피드백 판정기 v" + Version.Value);
        Console.WriteLine(" 대상 파일: " + file);
        Console.WriteLine(" 불만족 행만 골라 판정합니다. 50건 기준 10~15분 걸립니다.");
        Console.WriteLine(" 이 창을 닫지 말고 기다리세요.");
        Console.WriteLine("======================================================");
        Console.WriteLine();

        var psi = new ProcessStartInfo();
        psi.FileName = claude;
        psi.Arguments = "-p \"/판정 " + file + "\" --permission-mode acceptEdits --allowedTools \"Bash(node tools/judge/scripts/*)\" Read Write Edit Glob Grep Agent";
        psi.WorkingDirectory = baseDir;
        psi.UseShellExecute = false;
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        psi.EnvironmentVariables["PATH"] = Path.Combine(baseDir, "runtime") + ";" + path;
        using (var p = Process.Start(psi)) { p.WaitForExit(); }

        string name = Path.GetFileNameWithoutExtension(file);
        string result = Path.Combine(baseDir, "tools", "judge", "output", name + "_판정.xlsx");
        string srcDir = Path.GetDirectoryName(file);
        Console.WriteLine();
        if (File.Exists(result))
        {
            string copied = Path.Combine(srcDir, name + "_판정.xlsx");
            File.Copy(result, copied, true);
            Console.WriteLine("======================================================");
            Console.WriteLine(" 완료. 결과 파일: " + copied);
            Console.WriteLine(" 열리는 대시보드 [데이터 조회] 업로드에 이 파일을 올리세요.");
            Console.WriteLine("======================================================");
            try { Process.Start("explorer.exe", "/select,\"" + copied + "\""); } catch { }
            try { Process.Start(new ProcessStartInfo(DashboardUrl) { UseShellExecute = true }); } catch { }
        }
        else
        {
            Console.WriteLine(" 결과 파일이 만들어지지 않았습니다. 위 메시지를 캡처해 AI 전략팀에 전달해 주세요.");
            Console.WriteLine(" 작업 폴더: " + baseDir);
        }
        Pause();
        return 0;
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
        Console.WriteLine(" 처음 실행: 판정기 파일을 준비하는 중... (" + baseDir + ")");
        if (Directory.Exists(baseDir)) Directory.Delete(baseDir, true);
        Directory.CreateDirectory(baseDir);
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        {
            if (s == null) throw new Exception("내장 payload.zip 이 없습니다. 빌드가 잘못되었습니다.");
            using (var za = new ZipArchive(s, ZipArchiveMode.Read, false, Encoding.UTF8))
            {
                foreach (var e in za.Entries)
                {
                    // .NET Framework 의 ZipFile.CreateFromDirectory 는 구분자를  로 쓰기도 한다
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
