// Owns the bundled PyInstaller sidecar (backend/desktop.py onedir). Windows-only
// process hosting; the pure parsing helpers live in DesktopStartup.cs.
//
// Native API-only mode:
// - Sets RESEARCH_NATIVE_DESKTOP=1 and NEVER requires bundled renderer assets
//   (no RESEARCH_WEB_DIR dependency).
// - The sidecar binds 127.0.0.1 only (DESKTOP_HOST in backend/desktop.py) on an
//   ephemeral loopback port; this shell never exposes that endpoint elsewhere.
// - Every /api request carries X-Notaeo-Desktop-Token (see NotaeoApi) plus the
//   account Bearer token; /api/health stays unauthenticated for readiness.
using System.Diagnostics;

namespace Notaeo;

internal sealed class BackendProcess : IDisposable
{
    internal enum BackendState
    {
        Idle,
        Starting,
        Ready,
        Failed,
    }

    private static readonly TimeSpan StartupTimeout = TimeSpan.FromSeconds(20);

    private Process? _process;
    private CancellationTokenSource? _startupCts;
    private string _launchToken = string.Empty;
    private int _generation;
    private bool _disposed;

    // Captured UI SyncContext so late/stale callbacks never touch a dead form.
    private SynchronizationContext? _uiContext;

    internal BackendState State { get; private set; } = BackendState.Idle;

    internal Uri? ReadyUrl { get; private set; }

    internal Uri? BaseUrl => ReadyUrl;

    internal string DesktopToken { get; private set; } = string.Empty;

    internal string FailureMessage { get; private set; } = string.Empty;

    internal event EventHandler? StateChanged;

    // Test seams: portable tests inject a real /bin/sh executable + temp datadir
    // and a short timeout, running under an inline SyncContext. Production
    // leaves these null and uses the bundled sidecar paths.
    internal string? TestExecutablePath { get; set; }

    internal string? TestExecutableArguments { get; set; }

    internal string? TestDataDirectory { get; set; }

    internal TimeSpan? TestStartupTimeout { get; set; }

    internal async void Start()
    {
        if (_disposed)
        {
            return;
        }

        // Capture the launching (UI) context once per start for callback marshaling.
        _uiContext = SynchronizationContext.Current;
        var generation = ++_generation;

        StopInternal(silent: true);
        FailureMessage = string.Empty;
        ReadyUrl = null;
        DesktopToken = string.Empty;

        string executable;
        try
        {
            executable = TestExecutablePath ?? FindBackendExecutable();
        }
        catch (Exception ex)
        {
            Fail($"The bundled backend is missing ({ex.Message}).", generation);
            return;
        }

        string dataDirectory;
        try
        {
            dataDirectory = TestDataDirectory ?? EnsureDataDirectory();
        }
        catch (Exception ex)
        {
            Fail($"Could not prepare the data directory ({ex.Message}).", generation);
            return;
        }

        var testArgs = TestExecutableArguments;

        // Per-launch unpredictable token (Guid + RandomNumberGenerator via
        // DesktopStartup.CreateLaunchToken); never logged or shown in UI.
        _launchToken = DesktopStartup.CreateLaunchToken();
        var process = new Process();
        try
        {
            process.StartInfo = new ProcessStartInfo
            {
                FileName = executable,
                Arguments = testArgs ?? string.Empty,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            process.StartInfo.Environment["RESEARCH_DATA_DIR"] = dataDirectory;
            process.StartInfo.Environment["RESEARCH_NATIVE_DESKTOP"] = "1";
            process.StartInfo.Environment["RESEARCH_DESKTOP_TOKEN"] = _launchToken;
            // Native API-only: never set RESEARCH_WEB_DIR.
            process.StartInfo.Environment.Remove("RESEARCH_WEB_DIR");
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += OnOutputData;
            process.ErrorDataReceived += OnOutputData;
            process.Exited += OnExited;

            // Assign ownership + Starting + CTS BEFORE Start/read callbacks so
            // no background callback can observe a half-launched owner.
            _process = process;
            State = BackendState.Starting;
            _startupCts = new CancellationTokenSource();
            RaiseStateChanged();

            bool started;
            try
            {
                started = process.Start();
            }
            catch (Exception ex)
            {
                CleanupFailedLaunch(process, generation);
                Fail($"Could not start the local backend ({ex.Message}).", generation);
                return;
            }

            if (!started)
            {
                CleanupFailedLaunch(process, generation);
                Fail("Could not start the local backend.", generation);
                return;
            }

            try
            {
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                CleanupFailedLaunch(process, generation);
                Fail($"Could not start the local backend ({ex.Message}).", generation);
                return;
            }
        }
        catch (Exception ex)
        {
            CleanupFailedLaunch(process, generation);
            Fail($"Could not start the local backend ({ex.Message}).", generation);
            return;
        }

        var owned = process;
        var timeout = TestStartupTimeout ?? StartupTimeout;
        var cts = _startupCts;
        try
        {
            await Task.Delay(timeout, cts.Token).ConfigureAwait(false);
            // Marshal ALL timeout handling back to the UI thread: never mutate
            // process state off-UI.
            PostToUi(() =>
            {
                if (generation != _generation)
                {
                    return;
                }

                // Kill only if still the owned starting process.
                if (State == BackendState.Starting && ReferenceEquals(_process, owned))
                {
                    StopInternal(silent: true);
                    Fail("The local backend did not start within 20 seconds. Try Again to restart it.", generation);
                }
            });
        }
        catch (TaskCanceledException)
        {
            // Ready path cancels the timeout; no action needed.
        }
    }

    private void CleanupFailedLaunch(Process process, int generation)
    {
        // Only clear if this launch still owns the slot; never touch a newer owner.
        if (ReferenceEquals(_process, process))
        {
            try
            {
                process.OutputDataReceived -= OnOutputData;
                process.ErrorDataReceived -= OnOutputData;
                process.Exited -= OnExited;
            }
            catch (Exception)
            {
            }

            _process = null;
            try { _startupCts?.Cancel(); } catch (ObjectDisposedException) { }
            try { _startupCts?.Dispose(); } catch (ObjectDisposedException) { }
            _startupCts = null;
            if (State == BackendState.Starting && generation == _generation)
            {
                State = BackendState.Idle;
            }
        }

        try { process.Dispose(); } catch (Exception) { }
    }

    internal void Stop()
    {
        _generation++;
        StopInternal(silent: false);
    }

    private void StopInternal(bool silent)
    {
        try
        {
            _startupCts?.Cancel();
        }
        catch (ObjectDisposedException)
        {
        }

        _startupCts?.Dispose();
        _startupCts = null;

        var process = _process;
        _process = null;
        // Clear ready state so a stopped slot never exposes a stale URL/token.
        ReadyUrl = null;
        DesktopToken = string.Empty;
        if (process is not null)
        {
            try
            {
                process.OutputDataReceived -= OnOutputData;
                process.ErrorDataReceived -= OnOutputData;
                process.Exited -= OnExited;
                try
                {
                    process.CancelOutputRead();
                    process.CancelErrorRead();
                }
                catch (InvalidOperationException)
                {
                }

                if (!process.HasExited)
                {
                    // Kill only the owned sidecar and any descendants it spawned.
                    // Never kill unowned processes: this handle is the owned slot.
                    process.Kill(entireProcessTree: true);
                }
            }
            catch (Exception)
            {
                // Best effort: never surface kill noise to the UI.
            }
            finally
            {
                process.Dispose();
            }
        }

        if (!silent && State != BackendState.Idle)
        {
            State = BackendState.Idle;
            RaiseStateChanged();
        }
        else if (silent)
        {
            State = BackendState.Idle;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _generation++;
        StopInternal(silent: true);
    }

    private void OnOutputData(object sender, DataReceivedEventArgs e)
    {
        var line = e.Data;
        if (string.IsNullOrEmpty(line))
        {
            return;
        }

        var senderProcess = sender as Process;
        if (senderProcess is null)
        {
            return;
        }

        var generation = _generation;
        // Marshal ALL output handling to the UI thread. Never accumulate an
        // unbounded buffer on a background thread: parse the single already
        // complete READY line.
        PostToUi(() =>
        {
            if (generation != _generation)
            {
                return;
            }

            var current = _process;
            // Always reject stale senders, even when the slot is empty.
            if (!ReferenceEquals(current, senderProcess))
            {
                return;
            }

            if (State != BackendState.Starting)
            {
                return;
            }

            // Never log backend output: it may sit beside the token in diagnostics.
            if (DesktopStartup.TryParseReadyUrl(line, out var ready) && ready is not null)
            {
                ReadyUrl = ready;
                DesktopToken = _launchToken;
                try
                {
                    _startupCts?.Cancel();
                }
                catch (ObjectDisposedException)
                {
                }

                State = BackendState.Ready;
                RaiseStateChanged(generation);
            }
        });
    }

    private void OnExited(object? sender, EventArgs e)
    {
        var generation = _generation;
        if (sender is Process exited && !ReferenceEquals(_process, exited))
        {
            return;
        }

        PostToUi(() =>
        {
            if (generation != _generation)
            {
                return;
            }

            if (State == BackendState.Idle)
            {
                return;
            }

            if (State == BackendState.Ready || State == BackendState.Starting)
            {
                Fail("The local backend stopped unexpectedly.", generation);
            }
        });
    }

    private void Fail(string message, int generation)
    {
        if (generation != _generation)
        {
            return;
        }

        // Never include the token or backend output in the user-facing message.
        FailureMessage = message;
        State = BackendState.Failed;
        RaiseStateChanged(generation);
    }

    private void RaiseStateChanged(int? generation = null)
    {
        var gen = generation ?? _generation;
        PostToUi(() =>
        {
            if (gen != _generation || _disposed)
            {
                return;
            }

            StateChanged?.Invoke(this, EventArgs.Empty);
        });
    }

    private void PostToUi(Action d)
    {
        var ctx = _uiContext;
        if (ctx is null)
        {
            try { d(); } catch (ObjectDisposedException) { }
            return;
        }

        try
        {
            ctx.Post(_ => { try { d(); } catch (ObjectDisposedException) { } }, null);
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private static string FindBackendExecutable()
    {
        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "Resources", "backend", "research-backend", "research-backend.exe"),
            Path.Combine(baseDir, "Resources", "backend", "research-backend.exe"),
        };
        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("research-backend.exe");
    }

    internal static string EnsureDataDirectory()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var data = Path.Combine(appData, "research", "data");
        Directory.CreateDirectory(data);
        return data;
    }

    internal static string AccountFilePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "research", "account.json");
    }
}
