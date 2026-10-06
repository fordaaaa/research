using Notaeo;
using Xunit;

namespace Notaeo.Tests;

public sealed class PendingGuardTests
{
    [Fact]
    public void PreventsDuplicateWritesWhileBusy()
    {
        var guard = new PendingGuard();
        Assert.True(guard.TryEnter());
        Assert.False(guard.TryEnter());
        Assert.False(guard.CanWrite);
        Assert.False(guard.CanNavigate);
        guard.Exit();
        Assert.True(guard.CanWrite);
        Assert.True(guard.CanNavigate);
        Assert.True(guard.TryEnter());
        guard.Exit();
    }

    [Fact]
    public void StartsIdle()
    {
        var guard = new PendingGuard();
        Assert.False(guard.IsBusy);
        Assert.True(guard.CanNavigate);
    }
}
