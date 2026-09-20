using System.ComponentModel;
using System.Diagnostics;
using System.Text;

namespace PromptAction.NativeHost;

internal sealed class CodexRunner
{
    internal const int TimeoutMilliseconds = 120000;
    internal const string PromptActionModel = "gpt-5.6-luna";
    internal const string ReasoningEffortConfigKey = "model_reasoning_effort";
    internal const int MaxOutputCharacters = 30000;
    private static readonly object InstructionCacheLock = new();
    private static string? cachedInstructionPath;
    private static DateTime cachedInstructionWriteTimeUtc;
    private static string? cachedInstruction;

    private static int EffectiveTimeoutMilliseconds
    {
        get
        {
            var value = Environment.GetEnvironmentVariable("PROMPT_ACTION_CODEX_TIMEOUT_MS");
            return int.TryParse(value, out var parsed) && parsed > 0 && parsed <= TimeoutMilliseconds
                ? parsed
                : TimeoutMilliseconds;
        }
    }

    public async Task<NativeResponse> OptimizeAsync(
        string sourceText,
        string effort,
        string? requestId,
        long hostStartedAt)
    {
        var instructionPath = Path.Combine(AppContext.BaseDirectory, "optimize-prompt.txt");
        var instruction = await LoadInstructionAsync(instructionPath);
        if (instruction is null)
        {
            return NativeResponse.Failure(
                ErrorCodes.PromptInstructionMissing,
                "Prompt Action 설정 파일을 찾을 수 없습니다.",
                requestId);
        }

        var executable = CodexExecutableResolver.TryResolve();
        if (executable is null)
        {
            return NativeResponse.Failure(
                ErrorCodes.CodexNotFound,
                "Codex CLI를 찾을 수 없습니다.",
                requestId);
        }

        var request = BuildOptimizerRequest(instruction, sourceText);
        using var process = new Process { StartInfo = CreateStartInfo(executable, effort) };
        var processStartStartedAt = Stopwatch.GetTimestamp();
        try
        {
            if (!process.Start())
            {
                return NativeResponse.Failure(
                    ErrorCodes.CodexFailed,
                    "Codex CLI를 실행하지 못했습니다.",
                    requestId);
            }
        }
        catch (Exception exception) when (exception is InvalidOperationException or Win32Exception)
        {
            return NativeResponse.Failure(
                ErrorCodes.CodexNotFound,
                "Codex CLI를 찾을 수 없습니다.",
                requestId);
        }

        var codexProcessStartMs = ElapsedMilliseconds(processStartStartedAt);
        var codexStartedAt = processStartStartedAt;
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        try
        {
            await process.StandardInput.WriteAsync(request);
            process.StandardInput.Close();
        }
        catch (IOException)
        {
            TryKill(process);
            return NativeResponse.Failure(
                ErrorCodes.CodexFailed,
                "Codex CLI에 요청을 전달하지 못했습니다.",
                requestId);
        }

        try
        {
            using var timeout = new CancellationTokenSource(EffectiveTimeoutMilliseconds);
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            await DrainAsync(stdoutTask, stderrTask);
            return NativeResponse.Failure(
                ErrorCodes.CodexTimeout,
                "Codex CLI 실행 시간이 초과되었습니다.",
                requestId);
        }

        var codexTotalMs = ElapsedMilliseconds(codexStartedAt);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        if (process.ExitCode != 0)
        {
            return NativeResponse.Failure(
                LooksLikeAuthenticationFailure(stderr)
                    ? ErrorCodes.CodexNotAuthenticated
                    : ErrorCodes.CodexFailed,
                LooksLikeAuthenticationFailure(stderr)
                    ? "Codex 로그인이 필요합니다. 터미널에서 codex를 실행해 로그인해주세요."
                    : "Codex CLI가 오류와 함께 종료되었습니다.",
                requestId);
        }

        var optimized = stdout.Trim();
        if (optimized.Length == 0)
        {
            return NativeResponse.Failure(
                ErrorCodes.CodexEmptyResponse,
                "Codex가 빈 결과를 반환했습니다.",
                requestId);
        }
        if (optimized.Length > MaxOutputCharacters)
        {
            return NativeResponse.Failure(
                ErrorCodes.CodexFailed,
                "Codex 응답이 너무 깁니다.",
                requestId);
        }

        var hostTotalMs = ElapsedMilliseconds(hostStartedAt);
        var hostOverheadMs = Math.Max(0, hostTotalMs - codexTotalMs);
        return NativeResponse.Success(
            optimized,
            new NativeTimingMetadata
            {
                Effort = effort,
                CodexTotalMs = codexTotalMs,
                HostTotalMs = hostTotalMs,
                HostOverheadMs = hostOverheadMs,
                CodexProcessStartMs = codexProcessStartMs,
            },
            requestId);
    }

    internal static string BuildOptimizerRequest(string instruction, string sourceText)
    {
        return $"{instruction.Trim()}\n\n{sourceText}\n\n</user_draft>";
    }

    internal static ProcessStartInfo CreateStartInfo(string executable, string effort)
    {
        var extension = Path.GetExtension(executable).ToLowerInvariant();
        var startInfo = new ProcessStartInfo
        {
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false),
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
            CreateNoWindow = true
        };

        if (extension is ".cmd" or ".bat")
        {
            startInfo.FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            // These are fixed arguments. User text is always sent through stdin.
            startInfo.Arguments = $"/d /s /c \"\"{executable}\" exec --ephemeral --sandbox read-only --model {PromptActionModel} -c {ReasoningEffortConfigKey}={effort} -\"";
        }
        else if (extension == ".ps1")
        {
            startInfo.FileName = Environment.GetEnvironmentVariable("ComSpec") is not null
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe")
                : "powershell.exe";
            AddCodexArguments(startInfo.ArgumentList, executable, effort, includeFile: true);
        }
        else
        {
            startInfo.FileName = executable;
            AddCodexArguments(startInfo.ArgumentList, null, effort, false);
        }

        return startInfo;
    }

    private static void AddCodexArguments(
        ICollection<string> arguments,
        string? executable,
        string effort,
        bool includeFile)
    {
        if (includeFile)
        {
            arguments.Add("-NoProfile");
            arguments.Add("-ExecutionPolicy");
            arguments.Add("Bypass");
            arguments.Add("-File");
            arguments.Add(executable!);
        }

        arguments.Add("exec");
        arguments.Add("--ephemeral");
        arguments.Add("--sandbox");
        arguments.Add("read-only");
        arguments.Add("--model");
        arguments.Add(PromptActionModel);
        arguments.Add("-c");
        arguments.Add($"{ReasoningEffortConfigKey}={effort}");
        arguments.Add("-");
    }

    internal static async Task<string?> LoadInstructionAsync(string instructionPath)
    {
        if (!File.Exists(instructionPath))
        {
            return null;
        }

        DateTime writeTimeUtc;
        try
        {
            writeTimeUtc = File.GetLastWriteTimeUtc(instructionPath);
        }
        catch (IOException)
        {
            return null;
        }

        lock (InstructionCacheLock)
        {
            if (cachedInstruction is not null &&
                string.Equals(cachedInstructionPath, instructionPath, StringComparison.OrdinalIgnoreCase) &&
                cachedInstructionWriteTimeUtc == writeTimeUtc)
            {
                return cachedInstruction;
            }
        }

        string instruction;
        try
        {
            instruction = await File.ReadAllTextAsync(instructionPath, Encoding.UTF8);
        }
        catch (IOException)
        {
            return null;
        }

        lock (InstructionCacheLock)
        {
            cachedInstructionPath = instructionPath;
            cachedInstructionWriteTimeUtc = writeTimeUtc;
            cachedInstruction = instruction;
        }
        return instruction;
    }

    private static long ElapsedMilliseconds(long startedAt)
    {
        return Math.Max(0, (long)Math.Round(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds));
    }

    private static bool LooksLikeAuthenticationFailure(string stderr)
    {
        var lower = stderr.ToLowerInvariant();
        return lower.Contains("login") || lower.Contains("log in") ||
            lower.Contains("authenticate") || lower.Contains("unauthorized") ||
            lower.Contains("not authenticated") || lower.Contains("authentication");
    }

    private static async Task DrainAsync(Task<string> stdoutTask, Task<string> stderrTask)
    {
        try
        {
            await Task.WhenAll(stdoutTask, stderrTask);
        }
        catch
        {
            // The process was terminated; there is no useful output to expose.
        }
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Best effort cleanup after a timeout or broken pipe.
        }
    }
}
