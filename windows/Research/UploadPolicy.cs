// Portable upload limits for the native shell. No WinForms refs so the
// portable net10 test project can exercise the real policy.
namespace Notaeo;

internal static class UploadPolicy
{
    internal const int MaxFiles = 20;
    internal const long MaxEachBytes = 50L * 1024L * 1024L;
    internal const long MaxCombinedBytes = 200L * 1024L * 1024L;

    internal static string? Validate(IReadOnlyList<(string Name, long Length)> files)
    {
        if (files.Count == 0)
        {
            return "No files chosen.";
        }

        if (files.Count > MaxFiles)
        {
            return $"Choose up to {MaxFiles} files (you chose {files.Count}). No files were uploaded.";
        }

        foreach (var f in files)
        {
            if (f.Length < 0)
            {
                return $"Could not read \"{DisplayName(f.Name)}\". No files were uploaded.";
            }

            if (f.Length > MaxEachBytes)
            {
                return $"\"{DisplayName(f.Name)}\" is {FormatSize(f.Length)} — limit is 50 MB per file. No files were uploaded.";
            }
        }

        long total = 0;
        foreach (var f in files)
        {
            total += f.Length;
            if (total > MaxCombinedBytes)
            {
                return $"Combined size is {FormatSize(total)} — limit is 200 MB. No files were uploaded.";
            }
        }

        return null;
    }

    internal static string FormatSize(long bytes)
    {
        if (bytes < 1024L)
        {
            return $"{bytes} B";
        }

        double mb = bytes / (1024.0 * 1024.0);
        if (mb < 1024.0)
        {
            return $"{mb:0.#} MB";
        }

        double gb = mb / 1024.0;
        return $"{gb:0.#} GB";
    }

    private static string DisplayName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "file";
        }

        return name.Trim();
    }
}
