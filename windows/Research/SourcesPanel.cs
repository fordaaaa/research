// Native sources workspace: list / read / paste / URL / upload.
// No WebView refs; all WinForms controls bound to NotaeoApi.
namespace Notaeo;

internal sealed class SourcesPanel : UserControl
{
    private readonly Func<NotaeoApi?> _apiFactory;

    private Notebook? _notebook;
    private int _epoch;

    private readonly ListBox _sourcesList = new() { Dock = DockStyle.Fill };
    private readonly TextBox _pasteTitleBox = new() { PlaceholderText = "Paste title" };
    private readonly TextBox _pasteTextBox = new() { Multiline = true, Height = 90, ScrollBars = ScrollBars.Vertical };
    private readonly TextBox _urlBox = new() { PlaceholderText = "https://example.com/article" };
    private readonly Button _savePasteButton = new() { Text = "Save paste", AutoSize = true };
    private readonly Button _uploadButton = new() { Text = "Upload file…", AutoSize = true };
    private readonly Button _addUrlButton = new() { Text = "Add URL", AutoSize = true };
    private readonly Button _exportButton = new() { Text = "Export notebook (.zip)…", AutoSize = true };
    private readonly Label _detailTitle = new() { AutoSize = true, Font = new Font(FontFamily.GenericSansSerif, 11, System.Drawing.FontStyle.Bold) };
    private readonly Label _detailMeta = new() { AutoSize = true };
    private readonly TextBox _detailText = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill };
    private readonly Label _noticeLabel = new() { AutoSize = true, MaximumSize = new Size(600, 0) };
    private readonly ProgressBar _busyBar = new() { Style = ProgressBarStyle.Marquee, Visible = false, Height = 12, Dock = DockStyle.Top };

    private List<SourceSummary> _sources = [];

    internal SourcesPanel(Func<NotaeoApi?> apiFactory)
    {
        _apiFactory = apiFactory ?? throw new ArgumentNullException(nameof(apiFactory));
        Dock = DockStyle.Fill;

        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 260 };
        split.Panel1.Controls.Add(_sourcesList);

        var detail = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(10), AutoSize = true };
        layout.Controls.Add(BuildAddBox(), 0, 0);
        layout.Controls.Add(_busyBar, 0, 1);
        layout.Controls.Add(_detailTitle, 0, 2);
        layout.Controls.Add(_detailMeta, 0, 3);
        var textHost = new Panel { Dock = DockStyle.Fill, MinimumSize = new Size(300, 300) };
        textHost.Controls.Add(_detailText);
        layout.Controls.Add(textHost, 0, 4);
        layout.Controls.Add(_noticeLabel, 0, 5);
        detail.Controls.Add(layout);
        split.Panel2.Controls.Add(detail);
        Controls.Add(split);

        _sourcesList.DisplayMember = "Title";
        _sourcesList.SelectedIndexChanged += async (_, _) =>
        {
            if (_sourcesList.SelectedItem is SourceSummary s)
            {
                await ReadAsync(s.Id);
            }
        };
        _savePasteButton.Click += async (_, _) => await SavePasteAsync(false);
        _addUrlButton.Click += async (_, _) => await AddUrlAsync(false);
        _uploadButton.Click += async (_, _) => await UploadAsync();
        _exportButton.Click += async (_, _) => await ExportAsync();
    }

    private GroupBox BuildAddBox()
    {
        var box = new GroupBox { Text = "Add sources", Dock = DockStyle.Top, AutoSize = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoSize = true, Padding = new Padding(8) };
        _pasteTitleBox.Dock = DockStyle.Fill;
        _pasteTextBox.Dock = DockStyle.Fill;
        _urlBox.Dock = DockStyle.Fill;
        layout.Controls.Add(new Label { Text = "Paste title:", AutoSize = true }, 0, 0);
        layout.Controls.Add(_pasteTitleBox, 1, 0);
        layout.Controls.Add(new Label { Text = "Paste text:", AutoSize = true }, 0, 1);
        layout.Controls.Add(_pasteTextBox, 1, 1);
        var pasteButtons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        pasteButtons.Controls.Add(_savePasteButton);
        pasteButtons.Controls.Add(_uploadButton);
        pasteButtons.Controls.Add(_exportButton);
        layout.Controls.Add(pasteButtons, 1, 2);
        layout.Controls.Add(new Label { Text = "URL:", AutoSize = true }, 0, 3);
        layout.Controls.Add(_urlBox, 1, 3);
        layout.Controls.Add(_addUrlButton, 1, 4);
        box.Controls.Add(layout);
        return box;
    }

    internal async Task BindNotebookAsync(Notebook notebook)
    {
        _notebook = notebook;
        var epoch = ++_epoch;
        await ReloadAsync(epoch);
    }

    private void SetBusy(bool busy)
    {
        _busyBar.Visible = busy;
        _savePasteButton.Enabled = !busy;
        _addUrlButton.Enabled = !busy;
        _uploadButton.Enabled = !busy;
        _exportButton.Enabled = !busy;
    }

    private async Task ReloadAsync(int epoch)
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        try
        {
            var list = await api.ListSourcesAsync(_notebook.Id).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _sources = list;
            _sourcesList.BeginUpdate();
            _sourcesList.Items.Clear();
            foreach (var s in _sources)
            {
                _sourcesList.Items.Add(s);
            }

            _sourcesList.DisplayMember = "Title";
            _sourcesList.EndUpdate();
            if (_sourcesList.SelectedItem is null && _sources.Count > 0)
            {
                _sourcesList.SelectedIndex = 0;
            }

            _noticeLabel.Text = string.Empty;
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
    }

    internal async Task ReloadCurrentAsync()
    {
        if (_notebook is not null)
        {
            await BindNotebookAsync(_notebook);
        }
    }

    private async Task ReadAsync(string id)
    {
        var api = _apiFactory();
        if (api is null)
        {
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        try
        {
            var detail = await api.GetSourceAsync(id).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _detailTitle.Text = detail.Title;
            _detailMeta.Text = $"{detail.Kind} · {detail.Chunks.Count} chunks";
            _detailText.Text = detail.FullText();
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task SavePasteAsync(bool force)
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            _noticeLabel.Text = "Backend is not ready yet.";
            return;
        }

        if (string.IsNullOrWhiteSpace(_pasteTextBox.Text))
        {
            _noticeLabel.Text = "Paste some text first.";
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        try
        {
            var title = string.IsNullOrWhiteSpace(_pasteTitleBox.Text) ? "Pasted note" : _pasteTitleBox.Text.Trim();
            var res = await api.PasteSourceAsync(_notebook.Id, title, _pasteTextBox.Text, force).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            if (res.Saved)
            {
                _pasteTitleBox.Text = string.Empty;
                _pasteTextBox.Text = string.Empty;
                await ReloadAsync(epoch);
                _noticeLabel.Text = "Paste saved.";
            }
            else if (res.DuplicateOf is not null)
            {
                var choice = MessageBox.Show(
                    this,
                    $"Already saved as \"{res.DuplicateOf.Title}\". Save again as a copy?",
                    "Duplicate source",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (choice == DialogResult.Yes)
                {
                    var second = await api.PasteSourceAsync(_notebook.Id, title, _pasteTextBox.Text, true).ConfigureAwait(true);
                    if (epoch != _epoch)
                    {
                        return;
                    }

                    if (second.Saved)
                    {
                        _pasteTitleBox.Text = string.Empty;
                        _pasteTextBox.Text = string.Empty;
                        await ReloadAsync(epoch);
                        _noticeLabel.Text = "Duplicate saved as a copy.";
                    }
                }
                else
                {
                    _noticeLabel.Text = $"Already saved as \"{res.DuplicateOf.Title}\". Saving again creates a copy.";
                }
            }
            else
            {
                _noticeLabel.Text = "Paste was not saved.";
            }
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task AddUrlAsync(bool force)
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        var url = _urlBox.Text.Trim();
        if (string.IsNullOrEmpty(url))
        {
            _noticeLabel.Text = "Enter a URL first.";
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        try
        {
            var res = await api.AddUrlSourceAsync(_notebook.Id, url, force).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            if (res.Saved)
            {
                _urlBox.Text = string.Empty;
                await ReloadAsync(epoch);
                _noticeLabel.Text = "URL imported.";
            }
            else if (res.DuplicateOf is not null)
            {
                _noticeLabel.Text = $"Already saved as \"{res.DuplicateOf.Title}\".";
            }
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task UploadAsync()
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            return;
        }

        using var dialog = new OpenFileDialog
        {
            Multiselect = true,
            Filter = "Documents (*.pdf;*.docx;*.txt;*.md)|*.pdf;*.docx;*.txt;*.md|All files (*.*)|*.*",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        try
        {
            // Enforce limits BEFORE loading bytes: no silent Take(5), no partial.
            var sizes = new List<(string Name, long Length)>();
            foreach (var path in dialog.FileNames)
            {
                long length;
                try
                {
                    length = new FileInfo(path).Length;
                }
                catch (Exception)
                {
                    if (epoch == _epoch)
                    {
                        _noticeLabel.Text = $"Could not read \"{Path.GetFileName(path)}\". No files were uploaded.";
                    }

                    return;
                }

                sizes.Add((Path.GetFileName(path), length));
            }

            var policyError = UploadPolicy.Validate(sizes);
            if (policyError is not null)
            {
                if (epoch == _epoch)
                {
                    _noticeLabel.Text = policyError;
                }

                return;
            }

            var files = new List<(string Filename, byte[] Data, string Mime)>();
            foreach (var path in dialog.FileNames)
            {
                byte[] data;
                try
                {
                    data = await File.ReadAllBytesAsync(path).ConfigureAwait(true);
                }
                catch (Exception)
                {
                    if (epoch == _epoch)
                    {
                        _noticeLabel.Text = $"Could not read \"{Path.GetFileName(path)}\". No files were uploaded.";
                    }

                    return;
                }

                files.Add((Path.GetFileName(path), data, MimeFor(path)));
            }

            if (files.Count == 0)
            {
                if (epoch == _epoch)
                {
                    _noticeLabel.Text = "Could not read the chosen files.";
                }

                return;
            }

            var reply = await api.UploadFilesAsync(_notebook.Id, files).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            await ReloadAsync(epoch);
            if (reply.Errors.Count == 0)
            {
                _noticeLabel.Text = $"Uploaded {reply.Sources.Count} file(s).";
            }
            else
            {
                var details = string.Join("; ", reply.Errors.Select(e => e.TryGetValue("detail", out var d) ? d : "failed"));
                _noticeLabel.Text = $"Uploaded {reply.Sources.Count}; {reply.Errors.Count} failed: {details}";
            }
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    private async Task ExportAsync()
    {
        var api = _apiFactory();
        if (api is null || _notebook is null)
        {
            _noticeLabel.Text = "Backend is not ready yet.";
            return;
        }

        var epoch = _epoch;
        SetBusy(true);
        try
        {
            // Authenticated raw ZIP bytes: credentials stay in headers, never in the URL.
            var bytes = await api.ExportNotebookAsync(_notebook.Id).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            using var dialog = new SaveFileDialog
            {
                Filter = "ZIP archive (*.zip)|*.zip",
                FileName = $"{SanitizeFileName(_notebook.Name)}.zip",
                OverwritePrompt = true,
            };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            await File.WriteAllBytesAsync(dialog.FileName, bytes).ConfigureAwait(true);
            if (epoch != _epoch)
            {
                return;
            }

            _noticeLabel.Text = $"Exported {bytes.Length} bytes to {Path.GetFileName(dialog.FileName)}.";
        }
        catch (ApiException ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (epoch == _epoch)
            {
                _noticeLabel.Text = ex.Message;
            }
        }
        finally
        {
            if (epoch == _epoch)
            {
                SetBusy(false);
            }
        }
    }

    internal static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "notebook";
        }

        var invalid = Path.GetInvalidFileNameChars();
        var sb = new System.Text.StringBuilder();
        foreach (var c in name.Trim())
        {
            sb.Append(invalid.Contains(c) ? '_' : c);
        }

        var s = sb.ToString().Trim();
        return string.IsNullOrEmpty(s) ? "notebook" : s;
    }

    private static string MimeFor(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt" or ".md" or ".markdown" => "text/plain",
            _ => "application/octet-stream",
        };
    }
}
