using Notaeo;
using Xunit;

namespace Notaeo.Tests;

// Startup parsing independent of WinForms.
public sealed class DesktopStartupTests
{
    [Fact]
    public void ParsesLoopbackHttpReadyLine()
    {
        Assert.True(DesktopStartup.TryParseReadyUrl("RESEARCH_READY http://127.0.0.1:53211", out var url));
        Assert.NotNull(url);
        Assert.Equal("127.0.0.1", url!.Host);
        Assert.Equal(53211, url.Port);
    }

    [Fact]
    public void ToleratesCrlfAndWhitespace()
    {
        Assert.True(DesktopStartup.TryParseReadyUrl("  RESEARCH_READY http://127.0.0.1:8000  \r", out _));
    }

    [Theory]
    [InlineData("RESEARCH_READY https://127.0.0.1:8000")]
    [InlineData("RESEARCH_READY http://example.com:8000")]
    [InlineData("RESEARCH_READY http://192.168.1.5:8000")]
    [InlineData("RESEARCH_READY http://0.0.0.0:8000")]
    [InlineData("RESEARCH_READY file:///etc/passwd")]
    [InlineData("READY http://127.0.0.1:8000")]
    [InlineData("RESEARCH_READY not-a-url")]
    [InlineData("RESEARCH_READY http://127.0.0.1")]
    [InlineData("RESEARCH_READY http://user:secret@127.0.0.1:8000")]
    [InlineData("RESEARCH_READY http://127.0.0.1:8000/?token=secret")]
    [InlineData("RESEARCH_READY http://127.0.0.1:8000/#fragment")]
    [InlineData("RESEARCH_READY http://127.0.0.1:8000/api")]
    public void RejectsNonLoopbackNonHttpOrMissingPort(string line)
    {
        Assert.False(DesktopStartup.TryParseReadyUrl(line, out _));
    }

    [Fact]
    public void FindsReadyUrlAmongLogNoise()
    {
        var output = "starting…\nnoise\nRESEARCH_READY http://127.0.0.1:51234\nmore logs\n";
        Assert.True(DesktopStartup.TryFindReadyUrl(output, out var url));
        Assert.Equal(51234, url!.Port);
    }

    [Fact]
    public void BuildLaunchUrlAttachesEscapedToken()
    {
        var ready = new Uri("http://127.0.0.1:53211");
        var url = DesktopStartup.BuildLaunchUrl(ready, "a b&c");
        Assert.Contains("desktop_token=a%20b%26c", url);
        Assert.StartsWith("http://127.0.0.1:53211/", url);
    }

    [Fact]
    public void LaunchTokensAreUnpredictable()
    {
        var first = DesktopStartup.CreateLaunchToken();
        var second = DesktopStartup.CreateLaunchToken();
        Assert.NotEqual(first, second);
        Assert.True(first.Length >= 32);
    }
}
