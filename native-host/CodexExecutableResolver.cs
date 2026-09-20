namespace PromptAction.NativeHost;

internal static class CodexExecutableResolver
{
    private static readonly string[] CandidateNames =
    {
        "codex.exe",
        "codex.cmd",
        "codex.bat",
        "codex.ps1",
        "codex"
    };

    private static readonly object CacheLock = new();
    private static bool hasResolved;
    private static string? cachedOverridePath;
    private static string? cachedExecutable;

    public static string? TryResolve()
    {
        var overridePath = Environment.GetEnvironmentVariable("PROMPT_ACTION_CODEX_PATH");
        lock (CacheLock)
        {
            if (hasResolved && string.Equals(cachedOverridePath, overridePath, StringComparison.OrdinalIgnoreCase) &&
                (cachedExecutable is null || File.Exists(cachedExecutable)))
            {
                return cachedExecutable;
            }

            cachedOverridePath = overridePath;
            cachedExecutable = Resolve(overridePath);
            hasResolved = true;
            return cachedExecutable;
        }
    }

    private static string? Resolve(string? overridePath)
    {
        if (!string.IsNullOrWhiteSpace(overridePath))
        {
            return File.Exists(overridePath) ? Path.GetFullPath(overridePath) : null;
        }

        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var candidateName in CandidateNames)
            {
                var candidate = Path.Combine(directory.Trim(), candidateName);
                if (File.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }
            }
        }

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (!string.IsNullOrWhiteSpace(appData))
        {
            foreach (var candidateName in CandidateNames)
            {
                var candidate = Path.Combine(appData, "npm", candidateName);
                if (File.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }
            }
        }

        return null;
    }
}
