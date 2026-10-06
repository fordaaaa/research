// Windows entry point. No production credentials are read or embedded here;
// the per-launch backend token is created at runtime in BackendProcess.
namespace Notaeo;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var main = new MainForm();
        Application.Run(main);
    }
}
