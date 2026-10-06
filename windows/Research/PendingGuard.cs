// Portable pending guard for the exam coach: prevents duplicate writes and
// task navigation while a request is in flight. No WinForms refs so portable
// tests can exercise the real guard used by CoachPanel.
namespace Notaeo;

internal sealed class PendingGuard
{
    private bool _busy;

    internal bool IsBusy => _busy;

    internal bool TryEnter()
    {
        if (_busy)
        {
            return false;
        }

        _busy = true;
        return true;
    }

    internal void Exit()
    {
        _busy = false;
    }

    internal bool CanNavigate => !_busy;

    internal bool CanWrite => !_busy;
}
