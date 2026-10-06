using Notaeo;
using Xunit;

namespace Notaeo.Tests;

public sealed class UploadPolicyTests
{
    [Fact]
    public void AllowsUpToLimits()
    {
        var files = Enumerable.Range(0, 20)
            .Select(i => ($"f{i}.txt", 1024L * 1024L))
            .ToList();
        Assert.Null(UploadPolicy.Validate(files));
    }

    [Fact]
    public void RejectsOverTwentyFilesWithoutPartial()
    {
        var files = Enumerable.Range(0, 21)
            .Select(i => ($"f{i}.txt", 1024L))
            .ToList();
        var err = UploadPolicy.Validate(files);
        Assert.NotNull(err);
        Assert.Contains("20", err);
        Assert.Contains("No files were uploaded", err);
    }

    [Fact]
    public void RejectsSingleFileOverFiftyMegabytes()
    {
        var files = new List<(string, long)> { ("big.pdf", 51L * 1024L * 1024L) };
        var err = UploadPolicy.Validate(files);
        Assert.NotNull(err);
        Assert.Contains("50 MB", err);
        Assert.Contains("No files were uploaded", err);
    }

    [Fact]
    public void RejectsCombinedOverTwoHundredMegabytes()
    {
        var files = Enumerable.Range(0, 5)
            .Select(i => ($"f{i}.pdf", 50L * 1024L * 1024L))
            .ToList();
        var err = UploadPolicy.Validate(files);
        Assert.NotNull(err);
        Assert.Contains("200 MB", err);
    }

    [Fact]
    public void RejectsEmptySelection()
    {
        var err = UploadPolicy.Validate([]);
        Assert.NotNull(err);
    }

    [Fact]
    public void RejectsUnreadableFileBeforeLoading()
    {
        var files = new List<(string, long)> { ("gone.txt", -1L) };
        var err = UploadPolicy.Validate(files);
        Assert.NotNull(err);
        Assert.Contains("Could not read", err);
    }
}
