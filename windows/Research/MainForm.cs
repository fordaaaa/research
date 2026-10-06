// Native WinForms shell: owns the backend process and hosts the workspace in
// actual native controls (no WebView). Settings are a native dialog bound to
// /api/settings/ai; the shell exposes a visible Settings button plus Ctrl+,.
namespace Notaeo;

internal sealed class MainForm : Form
{
    private readonly BackendProcess _backend = new();
    private readonly HttpClient _http;
    private readonly SessionStore _session;

    private int _notebookEpoch;

    private readonly ToolStripMenuItem _settingsMenuItem;
    private readonly ToolStripMenuItem _signOutMenuItem;
    private readonly ToolStripButton _settingsButton;

    private readonly Label _loadingLabel;
    private readonly Panel _errorPanel;
    private readonly Label _errorLabel;
    private readonly Button _retryButton;

    private readonly Panel _authPanel;
    private readonly TextBox _emailBox = new() { Width = 280, PlaceholderText = "Email" };
    private readonly TextBox _passwordBox = new() { Width = 280, PlaceholderText = "Password (8+ characters to register)", UseSystemPasswordChar = true };
    private readonly Button _loginButton = new() { Text = "Log in", AutoSize = true };
    private readonly Button _registerButton = new() { Text = "Create account", AutoSize = true };
    private readonly Label _authError = new() { AutoSize = true, ForeColor = System.Drawing.Color.Red, MaximumSize = new Size(400, 0) };
    private readonly Label _authBusy = new() { Text = "Please wait…", AutoSize = true, Visible = false };

    private readonly SplitContainer _mainSplit = new() { Dock = DockStyle.Fill, SplitterDistance = 240 };
    private readonly ListBox _notebookList = new() { Dock = DockStyle.Fill };
    private readonly TextBox _newNotebookBox = new() { PlaceholderText = "New notebook name", Dock = DockStyle.Top };
    private readonly Button _createNotebookButton = new() { Text = "Create notebook", Dock = DockStyle.Top, AutoSize = true };
    private readonly Label _notebookNotice = new() { AutoSize = true, MaximumSize = new Size(220, 0) };
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly SourcesPanel _sourcesPanel;
    private readonly CoachPanel _coachPanel;

    private List<Notebook> _notebooks = [];
    private string? _selectedNotebookId;

    internal MainForm()
    {
        Text = "Notaeo";
        MinimumSize = new Size(1024, 680);
        StartPosition = FormStartPosition.CenterScreen;

        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        _session = new SessionStore(_http);
        _sourcesPanel = new SourcesPanel(() => _session.MakeApi());
        _coachPanel = new CoachPanel(() => _session.MakeApi());

        var menu = new MenuStrip();
        var appMenu = new ToolStripMenuItem("&App");
        _settingsMenuItem = new ToolStripMenuItem("&Settings", null, (_, _) => OpenSettings())
        {
            // Ctrl+, opens native Settings throughout.
            ShortcutKeys = Keys.Control | Keys.Oemcomma,
            ShowShortcutKeys = true,
        };
        _signOutMenuItem = new ToolStripMenuItem("Sign &out", null, async (_, _) => await SignOutAsync());
        appMenu.DropDownItems.Add(_settingsMenuItem);
        appMenu.DropDownItems.Add(_signOutMenuItem);
        menu.Items.Add(appMenu);
        MainMenuStrip = menu;
        Controls.Add(menu);

        var toolbar = new ToolStrip { Dock = DockStyle.Top };
        _settingsButton = new ToolStripButton("Settings", null, (_, _) => OpenSettings())
        {
            DisplayStyle = ToolStripItemDisplayStyle.Text,
            ToolTipText = "Open settings (Ctrl+,)",
        };
        toolbar.Items.Add(_settingsButton);
        Controls.Add(toolbar);

        _loadingLabel = new Label
        {
            Text = "Preparing your workspace…",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
        };
        Controls.Add(_loadingLabel);

        _errorPanel = new Panel { Dock = DockStyle.Fill, Visible = false };
        var errorLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1 };
        _errorLabel = new Label { Text = "Couldn’t start Notaeo", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter };
        _retryButton = new Button { Text = "Try Again", AutoSize = true, Anchor = AnchorStyles.None };
        _retryButton.Click += (_, _) => _backend.Start();
        errorLayout.Controls.Add(new Label
        {
            Text = "⚠",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font(FontFamily.GenericSansSerif, 24),
        });
        errorLayout.Controls.Add(_errorLabel);
        var retryHost = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        retryHost.Controls.Add(_retryButton);
        errorLayout.Controls.Add(retryHost);
        _errorPanel.Controls.Add(errorLayout);
        Controls.Add(_errorPanel);

        _authPanel = BuildAuthPanel();
        _authPanel.Visible = false;
        Controls.Add(_authPanel);

        BuildMainSplit();
        _mainSplit.Visible = false;
        Controls.Add(_mainSplit);

        _backend.StateChanged += OnBackendStateChanged;
        _session.SessionExpired += OnSessionExpired;
        FormClosing += (_, _) =>
        {
            _backend.StateChanged -= OnBackendStateChanged;
            try { _session.SessionExpired -= OnSessionExpired; } catch (Exception) { }
            _backend.Stop();
            _backend.Dispose();
            _http.Dispose();
        };

        Shown += (_, _) => _backend.Start();
        RenderState();
    }

    private Panel BuildAuthPanel()
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 1 };
        var center = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            Anchor = AnchorStyles.None,
        };
        center.Controls.Add(new Label { Text = "Notaeo", AutoSize = true, Font = new Font(FontFamily.GenericSansSerif, 20, System.Drawing.FontStyle.Bold) });
        center.Controls.Add(new Label { Text = "Sign in to your notebooks", AutoSize = true });
        center.Controls.Add(_emailBox);
        center.Controls.Add(_passwordBox);
        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        buttons.Controls.Add(_loginButton);
        buttons.Controls.Add(_registerButton);
        center.Controls.Add(buttons);
        center.Controls.Add(_authBusy);
        center.Controls.Add(_authError);
        center.Controls.Add(new Label { Text = "Accounts are required for notebooks. AI keys stay optional in Settings.", AutoSize = true, MaximumSize = new Size(400, 0) });
        layout.Controls.Add(center, 0, 0);
        panel.Controls.Add(layout);

        _loginButton.Click += async (_, _) => await LoginAsync();
        _registerButton.Click += async (_, _) => await RegisterAsync();
        return panel;
    }

    private void BuildMainSplit()
    {
        var left = new Panel { Dock = DockStyle.Fill };
        _notebookList.DisplayMember = "Name";
        _notebookList.SelectedIndexChanged += async (_, _) =>
        {
            if (_notebookList.SelectedItem is Notebook nb)
            {
                _selectedNotebookId = nb.Id;
                var epoch = ++_notebookEpoch;
                try
                {
                    await _sourcesPanel.BindNotebookAsync(nb).ConfigureAwait(true);
                    if (epoch != _notebookEpoch || IsDisposed || Disposing)
                    {
                        return;
                    }

                    await _coachPanel.BindNotebookAsync(nb).ConfigureAwait(true);
                }
                catch (Exception)
                {
                }
            }
        };
        left.Controls.Add(_notebookList);
        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 120, Padding = new Padding(8) };
        bottom.Controls.Add(_createNotebookButton);
        bottom.Controls.Add(_newNotebookBox);
        bottom.Controls.Add(_notebookNotice);
        _newNotebookBox.BringToFront();
        left.Controls.Add(bottom);
        _mainSplit.Panel1.Controls.Add(left);

        _tabs.TabPages.Add(new TabPage("Sources") { Controls = { _sourcesPanel } });
        _tabs.TabPages.Add(new TabPage("Exam coach") { Controls = { _coachPanel } });
        _mainSplit.Panel2.Controls.Add(_tabs);

        _createNotebookButton.Click += async (_, _) => await CreateNotebookAsync();
    }

    // ---------- backend lifecycle (SyncContext + stale guards) ----------

    private void OnBackendStateChanged(object? sender, EventArgs e)
    {
        if (IsDisposed || Disposing)
        {
            return;
        }

        try
        {
            BeginInvoke((MethodInvoker)RenderState);
        }
        catch (ObjectDisposedException)
        {
        }
        catch (InvalidOperationException)
        {
        }
    }

    private void OnSessionExpired()
    {
        // 401 in any child panel clears the matching stale token via the
        // ApiClient expiry callback; return to login safely on the UI thread.
        if (IsDisposed || Disposing)
        {
            return;
        }

        try
        {
            BeginInvoke((MethodInvoker)(() =>
            {
                if (IsDisposed || Disposing)
                {
                    return;
                }

                // Stale-response guard: only show login when actually logged out
                // and the backend is still ready. Never touch tokens here.
                if (_session.IsLoggedIn)
                {
                    return;
                }

                if (_backend.State != BackendProcess.BackendState.Ready)
                {
                    return;
                }

                _notebooks = [];
                try { _notebookList.Items.Clear(); } catch (Exception) { }
                _selectedNotebookId = null;
                ShowAuth("Session expired — please sign in again.");
            }));
        }
        catch (ObjectDisposedException)
        {
        }
        catch (InvalidOperationException)
        {
        }
    }

    private void RenderState()
    {
        if (IsDisposed || Disposing)
        {
            return;
        }

        _errorPanel.Visible = false;
        _loadingLabel.Visible = false;
        _authPanel.Visible = false;
        _mainSplit.Visible = false;
        switch (_backend.State)
        {
            case BackendProcess.BackendState.Ready:
                if (_backend.BaseUrl is not null)
                {
                    _session.ConfigureBackend(_backend.BaseUrl, _backend.DesktopToken);
                    _ = RestoreSessionAsync();
                }

                break;
            case BackendProcess.BackendState.Failed:
                // Never surface tokens or backend logs; show only the safe message.
                _errorLabel.Text = string.IsNullOrWhiteSpace(_backend.FailureMessage)
                    ? "Couldn’t start Notaeo"
                    : _backend.FailureMessage;
                _errorPanel.Visible = true;
                _errorPanel.BringToFront();
                break;
            case BackendProcess.BackendState.Idle:
            case BackendProcess.BackendState.Starting:
            default:
                _loadingLabel.Visible = true;
                _loadingLabel.BringToFront();
                break;
        }
    }

    private async Task RestoreSessionAsync()
    {
        var api = _session.MakeApi();
        if (api is null)
        {
            return;
        }

        if (!_session.IsLoggedIn)
        {
            ShowAuth();
            return;
        }

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await api.MeAsync(cts.Token).ConfigureAwait(true);
            if (IsDisposed || Disposing || _backend.State != BackendProcess.BackendState.Ready)
            {
                return;
            }

            ShowMain();
            await ReloadNotebooksAsync();
        }
        catch (ApiException ex) when (ex.Kind == ApiErrorKind.Unauthorized)
        {
            _session.ClearAccount();
            ShowAuth("Session expired — please sign in again.");
        }
        catch (Exception ex)
        {
            ShowAuth($"Could not reach the local backend: {ex.Message}");
        }
    }

    private void ShowAuth(string? error = null)
    {
        if (IsDisposed || Disposing)
        {
            return;
        }

        _loadingLabel.Visible = false;
        _errorPanel.Visible = false;
        _mainSplit.Visible = false;
        if (!string.IsNullOrEmpty(error))
        {
            _authError.Text = error;
        }

        _authPanel.Visible = true;
        _authPanel.BringToFront();
    }

    private void ShowMain()
    {
        if (IsDisposed || Disposing)
        {
            return;
        }

        _loadingLabel.Visible = false;
        _errorPanel.Visible = false;
        _authPanel.Visible = false;
        _mainSplit.Visible = true;
        _mainSplit.BringToFront();
    }

    // ---------- auth ----------

    private void SetAuthBusy(bool busy, string? error = null)
    {
        _loginButton.Enabled = !busy;
        _registerButton.Enabled = !busy;
        _authBusy.Visible = busy;
        if (error is not null)
        {
            _authError.Text = error;
        }
        else if (!busy)
        {
            _authError.Text = string.Empty;
        }
    }

    private async Task LoginAsync()
    {
        var api = _session.MakeApi();
        if (api is null)
        {
            SetAuthBusy(false, "Backend is not ready yet.");
            return;
        }

        var email = _emailBox.Text.Trim().ToLowerInvariant();
        if (!email.Contains('@'))
        {
            SetAuthBusy(false, "Enter a valid email address.");
            return;
        }

        if (string.IsNullOrEmpty(_passwordBox.Text))
        {
            SetAuthBusy(false, "Enter your password.");
            return;
        }

        SetAuthBusy(true);
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var res = await api.LoginAsync(email, _passwordBox.Text, cts.Token).ConfigureAwait(true);
            if (IsDisposed || Disposing)
            {
                return;
            }

            _session.ApplyLogin(res.Token, res.User.Email);
            _passwordBox.Text = string.Empty;
            SetAuthBusy(false);
            ShowMain();
            await ReloadNotebooksAsync();
        }
        catch (ApiException ex)
        {
            if (!IsDisposed && !Disposing)
            {
                SetAuthBusy(false, ex.Message);
            }
        }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing)
            {
                SetAuthBusy(false, ex.Message);
            }
        }
    }

    private async Task RegisterAsync()
    {
        var api = _session.MakeApi();
        if (api is null)
        {
            SetAuthBusy(false, "Backend is not ready yet.");
            return;
        }

        var email = _emailBox.Text.Trim().ToLowerInvariant();
        if (!email.Contains('@'))
        {
            SetAuthBusy(false, "Enter a valid email address.");
            return;
        }

        if (_passwordBox.Text.Length < 8)
        {
            SetAuthBusy(false, "Password must be at least 8 characters.");
            return;
        }

        SetAuthBusy(true);
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var outcome = await api.RegisterAsync(email, _passwordBox.Text, cts.Token).ConfigureAwait(true);
            if (IsDisposed || Disposing)
            {
                return;
            }

            switch (outcome)
            {
                case RegisterOutcome.Authed authed:
                    _session.ApplyLogin(authed.Response.Token, authed.Response.User.Email);
                    _passwordBox.Text = string.Empty;
                    SetAuthBusy(false);
                    ShowMain();
                    await ReloadNotebooksAsync();
                    break;
                case RegisterOutcome.Duplicate dup:
                    SetAuthBusy(false, dup.Detail);
                    break;
            }
        }
        catch (ApiException ex)
        {
            if (!IsDisposed && !Disposing)
            {
                SetAuthBusy(false, ex.Message);
            }
        }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing)
            {
                SetAuthBusy(false, ex.Message);
            }
        }
    }

    private async Task SignOutAsync()
    {
        var account = _session.AccountToken;
        var api = _session.MakeApi();
        if (api is not null && _session.IsLoggedIn)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                await api.LogoutAsync(cts.Token).ConfigureAwait(true);
            }
            catch (Exception)
            {
            }
        }

        _session.ClearAccountIfMatching(account);
        if (_session.IsLoggedIn || IsDisposed || Disposing) return;
        _notebooks = [];
        _notebookList.Items.Clear();
        _selectedNotebookId = null;
        ShowAuth();
    }

    // ---------- notebooks ----------

    private async Task ReloadNotebooksAsync()
    {
        var api = _session.MakeApi();
        if (api is null)
        {
            return;
        }

        var epoch = ++_notebookEpoch;
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var notebooks = await api.ListNotebooksAsync(cts.Token).ConfigureAwait(true);
            if (epoch != _notebookEpoch || IsDisposed || Disposing)
            {
                return;
            }

            _notebooks = notebooks;
            _notebookList.BeginUpdate();
            _notebookList.Items.Clear();
            foreach (var nb in _notebooks)
            {
                _notebookList.Items.Add(nb);
            }

            _notebookList.EndUpdate();
            if (_selectedNotebookId is null && _notebooks.Count > 0)
            {
                _notebookList.SelectedIndex = 0;
            }
            else if (_selectedNotebookId is not null)
            {
                var idx = _notebooks.FindIndex(n => n.Id == _selectedNotebookId);
                if (idx >= 0)
                {
                    _notebookList.SelectedIndex = idx;
                }
            }

            _notebookNotice.Text = string.Empty;
        }
        catch (ApiException ex) when (ex.Kind == ApiErrorKind.Unauthorized)
        {
            _session.ClearAccount();
            ShowAuth("Session expired — please sign in again.");
        }
        catch (Exception ex)
        {
            if (epoch == _notebookEpoch && !IsDisposed && !Disposing)
            {
                _notebookNotice.Text = ex.Message;
            }
        }
    }

    private async Task CreateNotebookAsync()
    {
        var api = _session.MakeApi();
        if (api is null)
        {
            return;
        }

        var name = _newNotebookBox.Text.Trim();
        if (string.IsNullOrEmpty(name))
        {
            _notebookNotice.Text = "Enter a notebook name.";
            return;
        }

        _createNotebookButton.Enabled = false;
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var nb = await api.CreateNotebookAsync(name, cts.Token).ConfigureAwait(true);
            if (IsDisposed || Disposing)
            {
                return;
            }

            _notebooks.Insert(0, nb);
            _notebookList.Items.Insert(0, nb);
            _notebookList.SelectedIndex = 0;
            _selectedNotebookId = nb.Id;
            _newNotebookBox.Text = string.Empty;
            _notebookNotice.Text = string.Empty;
        }
        catch (ApiException ex)
        {
            if (!IsDisposed && !Disposing)
            {
                _notebookNotice.Text = ex.Message;
            }
        }
        catch (Exception ex)
        {
            if (!IsDisposed && !Disposing)
            {
                _notebookNotice.Text = ex.Message;
            }
        }
        finally
        {
            if (!IsDisposed && !Disposing)
            {
                _createNotebookButton.Enabled = true;
            }
        }
    }

    // ---------- settings ----------

    private void OpenSettings()
    {
        using var dialog = new SettingsForm(_session);
        dialog.ShowDialog(this);
        // Signing out inside Settings returns to the auth gate.
        if (!_session.IsLoggedIn && _mainSplit.Visible)
        {
            _notebooks = [];
            _notebookList.Items.Clear();
            _selectedNotebookId = null;
            ShowAuth();
        }
    }
}
