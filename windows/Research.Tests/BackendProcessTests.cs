using Notaeo;
using Xunit;

namespace Notaeo.Tests;

internal sealed class InlineSyncContext : SynchronizationContext
{
    public override void Post(SendOrPostCallback d, object? state) => d(state);
}

public sealed class BackendProcessTests : IDisposable
{
    private readonly SynchronizationContext? _saved;
    private readonly List<string> _tempDirs = new();

    public BackendProcessTests()
    {
        _saved = SynchronizationContext.Current;
        SynchronizationContext.SetSynchronizationContext(new InlineSyncContext());
    }

    public void Dispose()
    {
        SynchronizationContext.SetSynchronizationContext(_saved);
        foreach (var dir in _tempDirs)
        {
            try { Directory.Delete(dir, true); } catch (Exception) { }
        }
    }

    private string TempDataDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "notaeo-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        _tempDirs.Add(dir);
        return dir;
    }

    private static string ShellPath => OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe")
        : "/bin/sh";

    private static string ShellArguments(string? announcement)
    {
        if (OperatingSystem.IsWindows())
        {
            var output = announcement is null ? "" : $"Write-Output 'RESEARCH_READY {announcement}'; ";
            return $"-NoProfile -NonInteractive -Command \"{output}Start-Sleep -Seconds 30\"";
        }
        var print = announcement is null ? "" : $"echo starting; echo RESEARCH_READY {announcement}; echo more; ";
        return $"-c \"{print}sleep 30\"";
    }

    private static async Task WaitForAsync(Func<bool> cond, TimeSpan timeout)
    {
        var start = DateTime.UtcNow;
        while (!cond())
        {
            if (DateTime.UtcNow - start > timeout)
            {
                break;
            }

            await Task.Delay(50);
        }
    }

    [Fact]
    public async Task ReadyLifecycleWithOwnedShellProcess()
    {
        // Real owned /bin/sh that prints noise + a single complete READY line.
        using var backend = new BackendProcess
        {
            TestExecutablePath = ShellPath,
            TestExecutableArguments = ShellArguments("http://127.0.0.1:53211"),
            TestDataDirectory = TempDataDir(),
            TestStartupTimeout = TimeSpan.FromSeconds(5),
        };

        backend.Start();
        await WaitForAsync(() => backend.State == BackendProcess.BackendState.Ready, TimeSpan.FromSeconds(5));

        Assert.Equal(BackendProcess.BackendState.Ready, backend.State);
        Assert.NotNull(backend.ReadyUrl);
        Assert.Equal("127.0.0.1", backend.ReadyUrl!.Host);
        Assert.Equal(53211, backend.ReadyUrl.Port);
        Assert.False(string.IsNullOrEmpty(backend.DesktopToken));
        Assert.Equal(backend.ReadyUrl, backend.BaseUrl);

        backend.Stop();
        Assert.Equal(BackendProcess.BackendState.Idle, backend.State);
    }

    [Fact]
    public async Task TimeoutFailsWhenNoReadyLine()
    {
        using var backend = new BackendProcess
        {
            TestExecutablePath = ShellPath,
            TestExecutableArguments = ShellArguments(null),
            TestDataDirectory = TempDataDir(),
            TestStartupTimeout = TimeSpan.FromMilliseconds(600),
        };

        backend.Start();
        await WaitForAsync(
            () => backend.State == BackendProcess.BackendState.Failed,
            TimeSpan.FromSeconds(5));

        Assert.Equal(BackendProcess.BackendState.Failed, backend.State);
        Assert.Contains("did not start", backend.FailureMessage);
        Assert.Null(backend.ReadyUrl);

        backend.Dispose();
    }

    [Fact]
    public async Task StaleOutputAfterStopDoesNotResurrect()
    {
        using var backend = new BackendProcess
        {
            TestExecutablePath = ShellPath,
            TestExecutableArguments = ShellArguments("http://127.0.0.1:53212"),
            TestDataDirectory = TempDataDir(),
            TestStartupTimeout = TimeSpan.FromSeconds(5),
        };

        backend.Start();
        await WaitForAsync(() => backend.State == BackendProcess.BackendState.Ready, TimeSpan.FromSeconds(5));
        Assert.Equal(BackendProcess.BackendState.Ready, backend.State);

        backend.Stop();
        Assert.Equal(BackendProcess.BackendState.Idle, backend.State);
        Assert.Null(backend.ReadyUrl);
    }
}
