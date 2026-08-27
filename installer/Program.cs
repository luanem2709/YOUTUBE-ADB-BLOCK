using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace FunnyGameInstaller;

internal static class Theme
{
    public static readonly Color Bg = Color.FromArgb(8, 8, 8);
    public static readonly Color Surface = Color.FromArgb(18, 18, 18);
    public static readonly Color SurfaceHover = Color.FromArgb(28, 28, 28);
    public static readonly Color Border = Color.FromArgb(38, 38, 38);
    public static readonly Color Input = Color.FromArgb(12, 12, 12);
    public static readonly Color Text = Color.FromArgb(245, 245, 245);
    public static readonly Color Muted = Color.FromArgb(130, 130, 130);
    public static readonly Color Accent = Color.FromArgb(240, 240, 240);
    public static readonly Color AccentHover = Color.White;
    public static readonly Color OnAccent = Color.FromArgb(10, 10, 10);
    public static readonly Color Success = Color.FromArgb(74, 222, 128);
    public static readonly Color SuccessSoft = Color.FromArgb(28, 74, 222, 128);
    public static readonly Color Danger = Color.FromArgb(248, 113, 113);
    public static readonly Color DangerSoft = Color.FromArgb(28, 248, 113, 113);
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class ChromeTarget
{
    public required string Name { get; init; }
    public required string ExePath { get; init; }
    public override string ToString() => Name;
}

internal sealed class ChromeProfile
{
    public required string Directory { get; init; }
    public required string DisplayName { get; init; }
    public override string ToString() =>
        string.IsNullOrWhiteSpace(DisplayName) || DisplayName.Equals(Directory, StringComparison.OrdinalIgnoreCase)
            ? Directory
            : $"{DisplayName}  ({Directory})";
}

internal sealed class CardPanel : Panel
{
    public CardPanel()
    {
        DoubleBuffered = true;
        BackColor = Theme.Bg;
        Padding = new Padding(18);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        using var path = Round(rect, 18);
        using var fill = new SolidBrush(Theme.Surface);
        using var pen = new Pen(Theme.Border);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(pen, path);
        base.OnPaint(e);
    }

    private static GraphicsPath Round(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class AccentButton : Button
{
    private bool _hover;
    public bool Primary;

    public AccentButton()
    {
        SetStyle(ControlStyles.UserPaint
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.SupportsTransparentBackColor, true);
        UpdateStyles();

        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        FlatAppearance.BorderColor = Theme.Surface;
        FlatAppearance.MouseOverBackColor = Theme.Surface;
        FlatAppearance.MouseDownBackColor = Theme.Surface;
        FlatAppearance.CheckedBackColor = Theme.Surface;
        UseVisualStyleBackColor = false;
        BackColor = Theme.Surface;
        ForeColor = Theme.Text;
        Cursor = Cursors.Hand;
        Font = new Font("Segoe UI Semibold", 10.5f);
        TabStop = false;
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.None;
        using var fill = new SolidBrush(Theme.Surface);
        e.Graphics.FillRectangle(fill, ClientRectangle);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        using var bg = new SolidBrush(Theme.Surface);
        e.Graphics.FillRectangle(bg, ClientRectangle);

        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        using var path = Round(rect, 12);
        if (Primary)
        {
            using var fill = new SolidBrush(_hover ? Theme.AccentHover : Theme.Accent);
            e.Graphics.FillPath(fill, path);
        }
        else
        {
            using var fill = new SolidBrush(_hover ? Theme.SurfaceHover : Color.FromArgb(22, 22, 22));
            using var pen = new Pen(_hover ? Color.FromArgb(90, 90, 90) : Theme.Border);
            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(pen, path);
        }

        TextRenderer.DrawText(
            e.Graphics, Text, Font, ClientRectangle,
            Primary ? Theme.OnAccent : Theme.Text,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    private static GraphicsPath Round(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class MainForm : Form
{
    private const string ExtensionId = "ofmhoggnlfaighchkdbeagdmdeaoolib";
    private const string UpdateUrl = "https://raw.githubusercontent.com/luanem2709/YOUTUBE-ADB-BLOCK/main/release/update.xml";
    private const string PolicyPath = @"Software\Policies\Google\Chrome\ExtensionInstallForcelist";
    private const string SourcesPath = @"Software\Policies\Google\Chrome\ExtensionInstallSources";
    private static readonly string[] InstallSources =
    {
        "https://raw.githubusercontent.com/luanem2709/*",
        "https://github.com/luanem2709/*",
    };
    private static string ForceEntry => $"{ExtensionId};{UpdateUrl}";

    private readonly ComboBox _chromeBox = new();
    private readonly CheckBox _restartBox = new();
    private readonly TextBox _logBox = new();
    private readonly TextBox _keyBox = new();
    private readonly AccentButton _installBtn = new();
    private readonly AccentButton _removeBtn = new();
    private readonly AccentButton _browseBtn = new();
    private readonly AccentButton _activateBtn = new();
    private readonly AccentButton _updateBtn = new();
    private readonly ProgressBar _progress = new();
    private readonly Label _statusDot = new();
    private readonly Label _updateStatus = new();
    private readonly Label _headerBadge = new();
    private readonly Label _expiryLabel = new();
    private readonly Label _authHint = new();
    private readonly Label _authError = new();
    private readonly Label _authTitle = new();
    private readonly Label _profileSummary = new();
    private readonly ListBox _profileList = new();
    private TableLayoutPanel _root = null!;
    private Control _configCard = null!;
    private Control _updateCard = null!;
    private Control _installHost = null!;
    private Control _logCard = null!;
    private CardPanel _authCard = null!;
    private bool _activated;
    private bool _updating;
    private bool _enforcingExpiry;
    private readonly System.Windows.Forms.Timer _expiryWatch = new();
    private List<ChromeProfile> _chromeProfiles = new();

    public MainForm()
    {
        Text = "FUNNY GAME";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(520, 560);
        Size = new Size(560, 620);
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        Font = new Font("Segoe UI", 9.5f);
        DoubleBuffered = true;
        Icon = LoadAppIcon();

        _root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(22),
            BackColor = Theme.Bg,
        };
        _root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        _root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _configCard = BuildConfigCard();
        _updateCard = BuildUpdateCard();
        _installHost = BuildInstallRow();
        _logCard = BuildLogCard();

        _root.Controls.Add(BuildHeader(), 0, 0);
        _root.Controls.Add(BuildAuthCard(), 0, 1);
        _root.Controls.Add(_configCard, 0, 2);
        _root.Controls.Add(_updateCard, 0, 3);
        _root.Controls.Add(_installHost, 0, 4);
        _root.Controls.Add(_logCard, 0, 5);
        Controls.Add(_root);

        Load += async (_, _) =>
        {
            AuthKey.LoadSavedExpiry();
            if (AuthKey.IsExpiredLocally())
            {
                _activated = false;
                ApplyAuthUi();
                await EnforceExpiredLicenseAsync();
                StartExpiryWatch();
                return;
            }

            if (!AuthKey.IsUnlocked())
                AuthKey.Lock();
            _activated = AuthKey.IsUnlocked();
            ApplyAuthUi();
            if (_activated)
            {
                DetectChromes();
                Log("Sẵn sàng. Có thể cài đặt hoặc cập nhật.");
                if (IsPolicyPresent())
                    Log("Đã phát hiện chính sách sẵn có — extension đang được bật.");
                await RecheckLicenseAsync();
            }
            StartExpiryWatch();
        };
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(Theme.Bg);
        e.Graphics.FillRectangle(brush, ClientRectangle);
    }

    private Control BuildHeader()
    {
        var header = new Panel { Height = 108, Dock = DockStyle.Top, BackColor = Color.Transparent };

        var mark = new PictureBox
        {
            Left = 4,
            Top = 10,
            Width = 64,
            Height = 64,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent,
            Image = LoadLogoImage(),
        };

        var title = new Label
        {
            Text = "FUNNY GAME",
            Left = 82,
            Top = 12,
            AutoSize = true,
            Font = new Font("Segoe UI", 20, FontStyle.Bold),
            ForeColor = Theme.Text,
            BackColor = Color.Transparent,
        };
        var sub = new Label
        {
            Text = "Chặn quảng cáo YouTube & Spotify",
            Left = 84,
            Top = 46,
            AutoSize = true,
            ForeColor = Theme.Muted,
            BackColor = Color.Transparent,
        };
        _expiryLabel.Text = "";
        _expiryLabel.Left = 84;
        _expiryLabel.Top = 68;
        _expiryLabel.AutoSize = true;
        _expiryLabel.ForeColor = Theme.Success;
        _expiryLabel.BackColor = Color.Transparent;
        _expiryLabel.Visible = false;
        _headerBadge.Text = "  CHƯA KÍCH HOẠT  ";
        _headerBadge.AutoSize = true;
        _headerBadge.Left = 320;
        _headerBadge.Top = 22;
        _headerBadge.Font = new Font("Segoe UI Semibold", 8);
        _headerBadge.ForeColor = Theme.Muted;
        _headerBadge.BackColor = Color.FromArgb(22, 22, 22);
        _headerBadge.Padding = new Padding(8, 4, 8, 4);

        header.Controls.Add(mark);
        header.Controls.Add(title);
        header.Controls.Add(sub);
        header.Controls.Add(_expiryLabel);
        header.Controls.Add(_headerBadge);
        header.Resize += (_, _) => _headerBadge.Left = Math.Max(300, header.Width - _headerBadge.Width - 8);
        return header;
    }

    private Control BuildConfigCard()
    {
        var card = new CardPanel { Dock = DockStyle.Top, Height = 268, Margin = new Padding(0, 4, 0, 10) };

        var inner = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Theme.Surface,
        };
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 96));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        inner.Controls.Add(FieldLabel("Chrome"), 0, 0);
        inner.Controls.Add(BuildChromeRow(), 0, 1);

        _profileSummary.Text = "Đang nhận diện profile...";
        _profileSummary.AutoSize = true;
        _profileSummary.ForeColor = Theme.Muted;
        _profileSummary.BackColor = Color.Transparent;
        _profileSummary.Margin = new Padding(0, 10, 0, 4);
        inner.Controls.Add(_profileSummary, 0, 2);

        _profileList.Dock = DockStyle.Fill;
        _profileList.BorderStyle = BorderStyle.FixedSingle;
        _profileList.BackColor = Theme.Input;
        _profileList.ForeColor = Theme.Text;
        _profileList.IntegralHeight = false;
        _profileList.Font = new Font("Segoe UI", 9f);
        _profileList.Margin = new Padding(0, 0, 0, 6);
        _profileList.HorizontalScrollbar = true;
        inner.Controls.Add(_profileList, 0, 3);

        var checks = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Theme.Surface,
            Padding = new Padding(0, 4, 0, 0),
            AutoSize = true,
        };
        StyleCheck(_restartBox, "Đóng Chrome an toàn rồi mở lại (giữ tab, bookmark, tài khoản)", true);
        checks.Controls.Add(_restartBox);
        inner.Controls.Add(checks, 0, 4);

        card.Controls.Add(inner);
        return card;
    }

    private Control BuildAuthCard()
    {
        _authCard = new CardPanel { Dock = DockStyle.Top, Height = 268, Margin = new Padding(0, 8, 0, 10) };
        var inner = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Theme.Surface,
        };
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        _authTitle.Text = "Key authentic";
        _authTitle.AutoSize = true;
        _authTitle.Font = new Font("Segoe UI Semibold", 14f);
        _authTitle.ForeColor = Theme.Text;
        _authTitle.BackColor = Color.Transparent;
        _authTitle.Margin = new Padding(0, 2, 0, 4);
        inner.Controls.Add(_authTitle, 0, 0);

        _authHint.Text = "Nhập key authentic. Key được kiểm tra online qua danh sách của bạn.";
        _authHint.AutoSize = true;
        _authHint.MaximumSize = new Size(480, 0);
        _authHint.ForeColor = Theme.Muted;
        _authHint.BackColor = Color.Transparent;
        _authHint.Margin = new Padding(0, 0, 0, 12);
        inner.Controls.Add(_authHint, 0, 1);

        StyleText(_keyBox);
        _keyBox.Dock = DockStyle.Fill;
        _keyBox.PlaceholderText = "FG-XXXX-XXXX-XXXX";
        _keyBox.Margin = new Padding(0, 0, 0, 8);
        _keyBox.KeyDown += async (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            await ActivateKeyAsync();
        };
        inner.Controls.Add(_keyBox, 0, 2);

        _activateBtn.Text = "Kích hoạt";
        _activateBtn.Primary = true;
        _activateBtn.Dock = DockStyle.Fill;
        _activateBtn.Margin = new Padding(0, 0, 0, 8);
        _activateBtn.Click += async (_, _) => await ActivateKeyAsync();
        inner.Controls.Add(_activateBtn, 0, 3);

        _authError.Text = "";
        _authError.AutoSize = true;
        _authError.ForeColor = Theme.Danger;
        _authError.BackColor = Color.Transparent;
        _authError.Margin = new Padding(0, 2, 0, 0);
        inner.Controls.Add(_authError, 0, 4);

        _authCard.Controls.Add(inner);
        return _authCard;
    }

    private Control BuildUpdateCard()
    {
        var card = new CardPanel { Dock = DockStyle.Top, Height = 108, Margin = new Padding(0, 0, 0, 10) };
        var inner = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Theme.Surface,
        };
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        inner.Controls.Add(FieldLabel("Cập nhật"), 0, 0);
        inner.Controls.Add(BuildUpdateRow(), 0, 1);
        card.Controls.Add(inner);
        return card;
    }

    private Control BuildUpdateRow()
    {
        var row = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = Theme.Surface,
        };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210));

        _updateStatus.Text = "Bấm để kiểm tra và tự cập nhật nếu có bản mới.";
        _updateStatus.Dock = DockStyle.Fill;
        _updateStatus.AutoEllipsis = true;
        _updateStatus.TextAlign = ContentAlignment.MiddleLeft;
        _updateStatus.ForeColor = Theme.Muted;
        _updateStatus.BackColor = Color.Transparent;

        _updateBtn.Text = "Kiểm tra & cập nhật";
        _updateBtn.Primary = false;
        _updateBtn.Dock = DockStyle.Fill;
        _updateBtn.Margin = new Padding(8, 0, 0, 0);
        _updateBtn.Click += async (_, _) => await CheckUpdateAsync();

        row.Controls.Add(_updateStatus, 0, 0);
        row.Controls.Add(_updateBtn, 1, 0);
        return row;
    }

    private Control BuildInstallRow()
    {
        var host = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Surface, Margin = new Padding(0, 0, 0, 10) };

        var rowButtons = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = Theme.Surface,
        };
        rowButtons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        rowButtons.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));

        _installBtn.Text = "Cài đặt — Bật chặn quảng cáo";
        _installBtn.Primary = true;
        _installBtn.Dock = DockStyle.Fill;
        _installBtn.Click += async (_, _) => await InstallAsync();

        _removeBtn.Text = "Gỡ khỏi Chrome";
        _removeBtn.Primary = false;
        _removeBtn.Dock = DockStyle.Fill;
        _removeBtn.Margin = new Padding(8, 0, 0, 0);
        _removeBtn.Click += async (_, _) => await RemoveAsync();

        rowButtons.Controls.Add(_installBtn, 0, 0);
        rowButtons.Controls.Add(_removeBtn, 1, 0);

        _progress.Height = 4;
        _progress.Dock = DockStyle.Bottom;
        _progress.Style = ProgressBarStyle.Marquee;
        _progress.MarqueeAnimationSpeed = 0;
        _progress.Visible = false;

        host.Controls.Add(rowButtons);
        host.Controls.Add(_progress);
        return host;
    }

    private Control BuildChromeRow()
    {
        var row = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = Theme.Surface,
        };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 118));

        StyleCombo(_chromeBox);
        _chromeBox.Dock = DockStyle.Fill;

        _browseBtn.Text = "Chọn file";
        _browseBtn.Primary = false;
        _browseBtn.Dock = DockStyle.Fill;
        _browseBtn.Margin = new Padding(8, 0, 0, 0);
        _browseBtn.Click += (_, _) => BrowseChrome();

        row.Controls.Add(_chromeBox, 0, 0);
        row.Controls.Add(_browseBtn, 1, 0);
        return row;
    }

    private Control BuildLogCard()
    {
        var card = new CardPanel { Dock = DockStyle.Fill, Margin = new Padding(0) };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            BackColor = Theme.Surface,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var head = new Panel { Height = 28, Dock = DockStyle.Top, BackColor = Color.Transparent };
        var title = new Label
        {
            Text = "Nhật ký",
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 10),
            ForeColor = Theme.Text,
            BackColor = Color.Transparent,
            Left = 0,
            Top = 2,
        };
        _statusDot.Text = "● Sẵn sàng";
        _statusDot.AutoSize = true;
        _statusDot.ForeColor = Theme.Success;
        _statusDot.BackColor = Color.Transparent;
        _statusDot.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        head.Controls.Add(title);
        head.Controls.Add(_statusDot);
        head.Resize += (_, _) => _statusDot.Left = Math.Max(120, head.Width - _statusDot.Width);

        _logBox.Multiline = true;
        _logBox.ReadOnly = true;
        _logBox.ScrollBars = ScrollBars.Vertical;
        _logBox.Dock = DockStyle.Fill;
        _logBox.BorderStyle = BorderStyle.None;
        _logBox.BackColor = Color.FromArgb(10, 10, 10);
        _logBox.ForeColor = Color.FromArgb(170, 170, 170);
        _logBox.Font = new Font("Cascadia Mono", 9f, FontStyle.Regular, GraphicsUnit.Point);
        if (_logBox.Font.Name != "Cascadia Mono")
            _logBox.Font = new Font("Consolas", 9f);

        layout.Controls.Add(head, 0, 0);
        layout.Controls.Add(_logBox, 0, 1);
        card.Controls.Add(layout);
        return card;
    }

    private static Label FieldLabel(string text) => new()
    {
        Text = text.ToUpperInvariant(),
        AutoSize = true,
        Font = new Font("Segoe UI Semibold", 8),
        ForeColor = Theme.Muted,
        BackColor = Color.Transparent,
        Margin = new Padding(0, 6, 0, 4),
    };

    private static void StyleCombo(ComboBox box)
    {
        box.DropDownStyle = ComboBoxStyle.DropDownList;
        box.FlatStyle = FlatStyle.Flat;
        box.BackColor = Theme.Input;
        box.ForeColor = Theme.Text;
        box.Font = new Font("Segoe UI", 9.5f);
        box.IntegralHeight = false;
        box.ItemHeight = 22;
    }

    private static void StyleCheck(CheckBox box, string text, bool on)
    {
        box.Text = text;
        box.Checked = on;
        box.AutoSize = true;
        box.ForeColor = Theme.Text;
        box.BackColor = Color.Transparent;
        box.Margin = new Padding(0, 2, 0, 2);
    }

    private static void StyleText(TextBox box)
    {
        box.BorderStyle = BorderStyle.FixedSingle;
        box.BackColor = Theme.Input;
        box.ForeColor = Theme.Text;
        box.Font = new Font("Segoe UI", 11f);
        box.MaxLength = 64;
    }

    private void DetectChromes()
    {
        _chromeBox.SelectedIndexChanged -= ChromeBoxOnSelectedIndexChanged;
        _chromeBox.Items.Clear();
        foreach (var chrome in FindChromes())
            _chromeBox.Items.Add(chrome);
        if (_chromeBox.Items.Count > 0)
            _chromeBox.SelectedIndex = 0;
        else if (_activated)
            Log("Không tìm thấy Chrome. Hãy bấm \"Chọn file\" để trỏ tới chrome.exe.");
        _chromeBox.SelectedIndexChanged += ChromeBoxOnSelectedIndexChanged;
        RefreshChromeProfiles();
    }

    private void ChromeBoxOnSelectedIndexChanged(object? sender, EventArgs e)
    {
        RefreshChromeProfiles();
    }

    private void RefreshChromeProfiles()
    {
        var chrome = _chromeBox.SelectedItem as ChromeTarget;
        var userData = GuessUserDataDir(chrome);
        _chromeProfiles = FindChromeProfiles(userData);
        _profileList.Items.Clear();
        foreach (var p in _chromeProfiles)
            _profileList.Items.Add(p.ToString());

        if (_chromeProfiles.Count == 0)
        {
            _profileSummary.Text = "Không tìm thấy profile Chrome trên máy này.";
            _profileSummary.ForeColor = Theme.Danger;
            if (_activated)
                Log("Không nhận diện được profile Chrome tại: " + userData);
            return;
        }

        _profileSummary.Text =
            $"Phát hiện {_chromeProfiles.Count} profile Chrome — extension sẽ áp dụng cho tất cả.";
        _profileSummary.ForeColor = Theme.Success;
        if (_activated)
        {
            Log($"Phát hiện {_chromeProfiles.Count} profile Chrome:");
            foreach (var p in _chromeProfiles)
                Log("  · " + p);
        }
    }

    private static List<ChromeProfile> FindChromeProfiles(string userDataDir)
    {
        var result = new List<ChromeProfile>();
        if (string.IsNullOrWhiteSpace(userDataDir) || !Directory.Exists(userDataDir))
            return result;

        var names = ReadProfileDisplayNames(userDataDir);
        var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var key in names.Keys)
            dirs.Add(key);

        foreach (var dir in Directory.GetDirectories(userDataDir))
        {
            var name = Path.GetFileName(dir);
            if (name.Equals("Default", StringComparison.OrdinalIgnoreCase)
                || name.StartsWith("Profile ", StringComparison.OrdinalIgnoreCase))
                dirs.Add(name);
        }

        foreach (var dirName in dirs.OrderBy(ProfileSortKey, StringComparer.OrdinalIgnoreCase))
        {
            var full = Path.Combine(userDataDir, dirName);
            if (!Directory.Exists(full)) continue;
            names.TryGetValue(dirName, out var display);
            if (string.IsNullOrWhiteSpace(display))
                display = dirName.Equals("Default", StringComparison.OrdinalIgnoreCase) ? "Người dùng" : dirName;
            result.Add(new ChromeProfile { Directory = dirName, DisplayName = display.Trim() });
        }

        return result;
    }

    private static string ProfileSortKey(string name)
    {
        if (name.Equals("Default", StringComparison.OrdinalIgnoreCase)) return "0_Default";
        if (name.StartsWith("Profile ", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(name.AsSpan("Profile ".Length), out var n))
            return "1_" + n.ToString("D4");
        return "2_" + name;
    }

    private static Dictionary<string, string> ReadProfileDisplayNames(string userDataDir)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var localState = Path.Combine(userDataDir, "Local State");
        if (!File.Exists(localState)) return map;

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(localState));
            if (!doc.RootElement.TryGetProperty("profile", out var profile)) return map;
            if (!profile.TryGetProperty("info_cache", out var cache)) return map;

            foreach (var entry in cache.EnumerateObject())
            {
                var display = "";
                if (entry.Value.TryGetProperty("name", out var nameEl))
                    display = nameEl.GetString() ?? "";
                if (string.IsNullOrWhiteSpace(display) && entry.Value.TryGetProperty("gaia_name", out var gaia))
                    display = gaia.GetString() ?? "";
                if (string.IsNullOrWhiteSpace(display) && entry.Value.TryGetProperty("user_name", out var user))
                    display = user.GetString() ?? "";
                map[entry.Name] = display;
            }
        }
        catch
        {
            /* Local State co the dang bi Chrome khoa / JSON loi */
        }

        return map;
    }

    private static List<ChromeTarget> FindChromes()
    {
        var found = new List<ChromeTarget>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void TryAdd(string name, string exe)
        {
            if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe)) return;
            if (!seen.Add(exe)) return;
            found.Add(new ChromeTarget { Name = name, ExePath = exe });
        }

        // 1) Registry App Paths (dang tin cay nhat, dung ca ban per-user & per-machine)
        foreach (var exe in RegistryChromePaths())
            TryAdd("Google Chrome", exe);

        // 2) Cac vi tri chuan (ke ca ban cai theo nguoi dung o LocalAppData)
        TryAdd("Google Chrome", Join(ProgramFiles(), @"Google\Chrome\Application\chrome.exe"));
        TryAdd("Google Chrome (x86)", Join(ProgramFilesX86(), @"Google\Chrome\Application\chrome.exe"));
        TryAdd("Google Chrome (người dùng)", Join(LocalAppData(), @"Google\Chrome\Application\chrome.exe"));
        TryAdd("Chrome Beta", Join(ProgramFiles(), @"Google\Chrome Beta\Application\chrome.exe"));
        TryAdd("Chrome Dev", Join(ProgramFiles(), @"Google\Chrome Dev\Application\chrome.exe"));
        TryAdd("Chrome Canary", Join(LocalAppData(), @"Google\Chrome SxS\Application\chrome.exe"));

        return found;
    }

    private static IEnumerable<string> RegistryChromePaths()
    {
        var results = new List<string>();
        var hives = new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine };
        var views = new[] { RegistryView.Registry64, RegistryView.Registry32 };
        const string sub = @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe";

        foreach (var hive in hives)
        foreach (var view in views)
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                using var key = baseKey.OpenSubKey(sub);
                if (key?.GetValue(null) is string path && !string.IsNullOrWhiteSpace(path))
                    results.Add(path.Trim('"'));
            }
            catch { /* bo qua hive/view khong doc duoc */ }
        }
        return results;
    }

    private void BrowseChrome()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Chọn chrome.exe",
            Filter = "Chrome (chrome.exe)|chrome.exe|Mọi file (*.*)|*.*",
            FileName = "chrome.exe",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        var target = new ChromeTarget { Name = "Chrome tự chọn", ExePath = dialog.FileName };
        _chromeBox.Items.Add(target);
        _chromeBox.SelectedItem = target;
        Log("Đã chọn Chrome: " + dialog.FileName);
        RefreshChromeProfiles();
    }

    private async Task InstallAsync()
    {
        if (!_activated)
        {
            MessageBox.Show(this,
                "Nhập key authentic rồi bấm Kích hoạt trước khi cài đặt.",
                "FUNNY GAME",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        SetBusy(true);
        try
        {
            Log("Đang ghi chính sách force-install vào Windows (HKCU, không cần quyền admin)...");
            WriteForcelist();
            Log("Đã bật extension trong chính sách Chrome.");
            if (_chromeProfiles.Count > 0)
                Log($"Áp dụng cho {_chromeProfiles.Count} profile đã nhận diện trên máy này.");

            var chrome = _chromeBox.SelectedItem as ChromeTarget;

            if (_restartBox.Checked)
            {
                if (!RestartChrome(chrome))
                    Log("Bỏ qua khởi động lại Chrome. Hãy tự đóng hết Chrome rồi mở lại để áp dụng.");
            }
            else
            {
                Log("Hãy đóng HẾT cửa sổ Chrome rồi mở lại để Chrome tải extension.");
            }

            Log("Chrome sẽ tự tải extension sau khi mở lại (cần Internet). Tab và dữ liệu được giữ nguyên.");
            _statusDot.Text = "● Hoàn tất";
            _statusDot.ForeColor = Theme.Success;
            MessageBox.Show(this,
                "Đã bật chặn quảng cáo cho Chrome trên máy này.\n\n" +
                "Chrome sẽ tự tải extension sau khi khởi động lại (cần Internet).\n" +
                "Tab, bookmark và tài khoản được giữ nguyên.",
                "FUNNY GAME",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            Log("Lỗi: " + ex.Message);
            _statusDot.Text = "● Lỗi";
            _statusDot.ForeColor = Theme.Danger;
            MessageBox.Show(this, ex.Message, "Không cài được", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }

        await Task.CompletedTask;
    }

    private async Task RemoveAsync()
    {
        SetBusy(true);
        try
        {
            Log("Đang gỡ chính sách force-install...");
            RemoveForcelist();
            Log("Đã gỡ. Chrome sẽ tự gỡ extension sau khi khởi động lại.");

            var chrome = _chromeBox.SelectedItem as ChromeTarget;
            if (_restartBox.Checked)
                RestartChrome(chrome);

            _statusDot.Text = "● Đã gỡ";
            _statusDot.ForeColor = Theme.Accent;
            MessageBox.Show(this,
                "Đã gỡ chặn quảng cáo khỏi chính sách Chrome.\nKhởi động lại Chrome để hoàn tất.",
                "FUNNY GAME",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            Log("Lỗi: " + ex.Message);
            _statusDot.ForeColor = Theme.Danger;
        }
        finally
        {
            SetBusy(false);
        }

        await Task.CompletedTask;
    }

    private static bool IsPolicyPresent()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PolicyPath);
            if (key == null) return false;
            foreach (var name in key.GetValueNames())
            {
                if (key.GetValue(name) is string v &&
                    v.StartsWith(ExtensionId, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }
        catch { /* ignore */ }
        return false;
    }

    private static void WriteForcelist()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(PolicyPath, writable: true)
                ?? throw new InvalidOperationException("Không mở được khóa chính sách Chrome.");

            string? existingSlot = null;
            var maxIndex = 0;
            foreach (var name in key.GetValueNames())
            {
                var value = key.GetValue(name) as string ?? string.Empty;
                if (value.StartsWith(ExtensionId, StringComparison.OrdinalIgnoreCase))
                    existingSlot = name;
                if (int.TryParse(name, out var idx) && idx > maxIndex)
                    maxIndex = idx;
            }

            var slot = existingSlot ?? (maxIndex + 1).ToString();
            key.SetValue(slot, ForceEntry, RegistryValueKind.String);
            WriteInstallSources();
        }
        catch (UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                "Windows chặn ghi chính sách Chrome. Hãy chạy lại app bằng quyền Administrator.");
        }
        catch (System.Security.SecurityException)
        {
            throw new InvalidOperationException(
                "Windows chặn ghi chính sách Chrome. Hãy chạy lại app bằng quyền Administrator.");
        }
    }

    private static void RemoveForcelist()
    {
        using var key = Registry.CurrentUser.OpenSubKey(PolicyPath, writable: true);
        if (key == null) return;
        foreach (var name in key.GetValueNames())
        {
            if (key.GetValue(name) is string v &&
                v.StartsWith(ExtensionId, StringComparison.OrdinalIgnoreCase))
                key.DeleteValue(name, throwOnMissingValue: false);
        }
        RemoveInstallSources();
    }

    private static void WriteInstallSources()
    {
        using var key = Registry.CurrentUser.CreateSubKey(SourcesPath, writable: true);
        if (key == null) return;

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var maxIndex = 0;
        foreach (var name in key.GetValueNames())
        {
            if (key.GetValue(name) is string v)
                existing.Add(v);
            if (int.TryParse(name, out var idx) && idx > maxIndex)
                maxIndex = idx;
        }

        foreach (var src in InstallSources)
        {
            if (existing.Contains(src)) continue;
            maxIndex++;
            key.SetValue(maxIndex.ToString(), src, RegistryValueKind.String);
        }
    }

    private static void RemoveInstallSources()
    {
        using var key = Registry.CurrentUser.OpenSubKey(SourcesPath, writable: true);
        if (key == null) return;
        foreach (var name in key.GetValueNames())
        {
            if (key.GetValue(name) is not string v) continue;
            if (InstallSources.Any(s => v.Equals(s, StringComparison.OrdinalIgnoreCase)))
                key.DeleteValue(name, throwOnMissingValue: false);
        }
    }

    private bool RestartChrome(ChromeTarget? chrome, bool prompt = true)
    {
        var hadChrome = Process.GetProcessesByName("chrome").Length > 0;
        if (hadChrome)
        {
            if (prompt)
            {
                var ask = MessageBox.Show(this,
                    "Cần đóng Chrome rồi mở lại để áp dụng.\n\n" +
                    "Sẽ đóng an toàn (không buộc tắt) để giữ tab, bookmark và tài khoản.\n\nĐóng Chrome ngay bây giờ?",
                    "FUNNY GAME",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (ask != DialogResult.Yes)
                    return false;
            }

            Log("Đang đóng Chrome an toàn (không buộc tắt, tránh mất dữ liệu)...");
            if (!CloseChromeGracefully())
            {
                Log("Chrome chưa thoát hết. Hãy tự đóng hết cửa sổ Chrome rồi mở lại — không buộc tắt để tránh mất dữ liệu.");
                MessageBox.Show(this,
                    "Chrome vẫn đang chạy (có thể đang lưu phiên).\n\n" +
                    "Hãy tự đóng hết cửa sổ Chrome rồi mở lại.\n" +
                    "Không buộc tắt để tránh mất bookmark / đăng nhập.",
                    "FUNNY GAME",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return false;
            }

            WaitForProfileUnlocked(chrome, 10000);
            Thread.Sleep(800);
        }

        var exe = chrome?.ExePath;
        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
        {
            Log("Không xác định được chrome.exe để mở lại. Hãy tự mở Chrome.");
            return false;
        }

        Log("Đang mở lại Chrome — giữ phiên làm việc cũ...");
        Process.Start(new ProcessStartInfo
        {
            FileName = exe,
            UseShellExecute = true,
        });
        return true;
    }

    private static bool CloseChromeGracefully()
    {
        for (var round = 0; round < 10; round++)
        {
            var windows = GetChromeBrowserProcesses();
            if (windows.Count == 0) break;
            foreach (var proc in windows)
            {
                try { proc.CloseMainWindow(); }
                catch { /* co the da thoat */ }
            }
            Thread.Sleep(400);
        }

        if (WaitForChromeExit(4000))
            return true;

        try
        {
            using var kill = Process.Start(new ProcessStartInfo
            {
                FileName = "taskkill",
                Arguments = "/IM chrome.exe",
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            kill?.WaitForExit(8000);
        }
        catch { /* taskkill co the khong co */ }

        return WaitForChromeExit(12000);
    }

    private static bool WaitForChromeExit(int timeoutMs)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (Process.GetProcessesByName("chrome").Length == 0)
                return true;
            Thread.Sleep(250);
        }
        return Process.GetProcessesByName("chrome").Length == 0;
    }

    private static void WaitForProfileUnlocked(ChromeTarget? chrome, int timeoutMs)
    {
        var userData = GuessUserDataDir(chrome);
        var candidates = new[]
        {
            Path.Combine(userData, "lockfile"),
            Path.Combine(userData, "SingletonLock"),
            Path.Combine(userData, "SingletonCookie"),
        };
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            var locked = false;
            foreach (var file in candidates)
            {
                if (!File.Exists(file)) continue;
                try
                {
                    using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None);
                }
                catch (IOException)
                {
                    locked = true;
                    break;
                }
                catch { /* ignore */ }
            }
            if (!locked) return;
            Thread.Sleep(300);
        }
    }

    private static string GuessUserDataDir(ChromeTarget? chrome)
    {
        var exe = chrome?.ExePath ?? "";
        var local = LocalAppData();
        if (exe.Contains(@"Chrome Beta\", StringComparison.OrdinalIgnoreCase))
            return Path.Combine(local, @"Google\Chrome Beta\User Data");
        if (exe.Contains(@"Chrome Dev\", StringComparison.OrdinalIgnoreCase))
            return Path.Combine(local, @"Google\Chrome Dev\User Data");
        if (exe.Contains(@"Chrome SxS\", StringComparison.OrdinalIgnoreCase))
            return Path.Combine(local, @"Google\Chrome SxS\User Data");
        return Path.Combine(local, @"Google\Chrome\User Data");
    }

    private static List<Process> GetChromeBrowserProcesses()
    {
        var list = new List<Process>();
        foreach (var proc in Process.GetProcessesByName("chrome"))
        {
            try
            {
                if (proc.MainWindowHandle != IntPtr.Zero)
                    list.Add(proc);
            }
            catch { /* process co the da thoat */ }
        }
        return list;
    }

    private void SetBusy(bool busy)
    {
        _installBtn.Enabled = !busy && _activated;
        _removeBtn.Enabled = !busy;
        _browseBtn.Enabled = !busy;
        _chromeBox.Enabled = !busy;
        _updateBtn.Enabled = !busy;
        _activateBtn.Enabled = !busy && !_activated;
        _keyBox.Enabled = !busy && !_activated;
        _progress.Visible = busy;
        _progress.MarqueeAnimationSpeed = busy ? 30 : 0;
        _statusDot.Text = busy ? "● Đang xử lý..." : "● Sẵn sàng";
        _statusDot.ForeColor = busy ? Theme.Accent : Theme.Success;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
    }

    private void ApplyAuthUi()
    {
        _authCard.Visible = !_activated;
        _configCard.Visible = _activated;
        _updateCard.Visible = _activated;
        _installHost.Visible = _activated;
        _logCard.Visible = _activated;

        if (_activated)
        {
            _root.RowStyles[1] = new RowStyle(SizeType.Absolute, 0);
            _root.RowStyles[2] = new RowStyle(SizeType.AutoSize);
            _root.RowStyles[3] = new RowStyle(SizeType.AutoSize);
            _root.RowStyles[4] = new RowStyle(SizeType.Absolute, 58);
            _root.RowStyles[5] = new RowStyle(SizeType.Percent, 100);
            MinimumSize = new Size(700, 860);
            if (WindowState == FormWindowState.Normal)
                Size = new Size(Math.Max(Width, 760), 920);

            _installBtn.Enabled = true;
            _headerBadge.Text = "  SẴN SÀNG  ";
            _headerBadge.ForeColor = Theme.Success;
            _headerBadge.BackColor = Theme.SuccessSoft;
            ApplyExpiryUi();
        }
        else
        {
            _expiryLabel.Visible = false;
            _root.RowStyles[1] = new RowStyle(SizeType.AutoSize);
            _root.RowStyles[2] = new RowStyle(SizeType.Absolute, 0);
            _root.RowStyles[3] = new RowStyle(SizeType.Absolute, 0);
            _root.RowStyles[4] = new RowStyle(SizeType.Absolute, 0);
            _root.RowStyles[5] = new RowStyle(SizeType.Absolute, 0);
            MinimumSize = new Size(520, 560);
            if (WindowState == FormWindowState.Normal)
                Size = new Size(560, 620);

            _installBtn.Enabled = false;
            _headerBadge.Text = "  CHƯA KÍCH HOẠT  ";
            _headerBadge.ForeColor = Theme.Muted;
            _headerBadge.BackColor = Color.FromArgb(22, 22, 22);
            _authTitle.Text = "Key authentic";
            _authHint.Text = "Nhập key authentic. Key được kiểm tra online qua danh sách của bạn.";
            _authHint.ForeColor = Theme.Muted;
            _keyBox.ReadOnly = false;
            _keyBox.Enabled = true;
            _activateBtn.Text = "Kích hoạt";
            _activateBtn.Primary = true;
            _activateBtn.Enabled = true;
        }

        _root.PerformLayout();
        if (_headerBadge.Parent != null)
            _headerBadge.Left = Math.Max(220, _headerBadge.Parent.Width - _headerBadge.Width - 8);
    }

    private void ApplyExpiryUi()
    {
        var text = AuthKey.ExpiryDisplayText();
        _expiryLabel.Text = text;
        _expiryLabel.Visible = _activated && !string.IsNullOrWhiteSpace(text);
        _expiryLabel.ForeColor = AuthKey.ExpiryIsSoon() ? Theme.Danger : Theme.Success;
    }

    private bool _activating;

    private async Task ActivateKeyAsync()
    {
        if (_activating) return;
        if (_activated) return;
        _activating = true;
        _activateBtn.Enabled = false;
        _keyBox.Enabled = false;
        _authError.ForeColor = Theme.Muted;
        _authError.Text = "Đang kiểm tra key...";
        try
        {
            if (!await AuthKey.TryUnlockAsync(_keyBox.Text))
            {
                _authError.ForeColor = Theme.Danger;
                _authError.Text = AuthKey.LastError;
                _statusDot.Text = "● Key sai";
                _statusDot.ForeColor = Theme.Danger;
                return;
            }

            _authError.Text = "";
            _activated = true;
            DetectChromes();
            ApplyAuthUi();
            Log("Đã kích hoạt. Bảng cài đặt đã mở.");
            var expiry = AuthKey.ExpiryDisplayText();
            if (!string.IsNullOrWhiteSpace(expiry))
                Log(expiry);
            if (IsPolicyPresent())
                Log("Đã phát hiện chính sách sẵn có — extension đang được bật.");
            _statusDot.Text = "● Sẵn sàng";
            _statusDot.ForeColor = Theme.Success;
        }
        finally
        {
            _activating = false;
            if (!_activated)
            {
                _activateBtn.Enabled = true;
                _keyBox.Enabled = true;
            }
        }
    }

    private async Task RecheckLicenseAsync()
    {
        try
        {
            if (AuthKey.IsExpiredLocally())
            {
                await EnforceExpiredLicenseAsync();
                return;
            }

            if (await AuthKey.StillValidAsync())
            {
                ApplyExpiryUi();
                return;
            }

            await EnforceExpiredLicenseAsync();
        }
        catch
        {
            /* mất mạng thì giữ phiên đã kích hoạt, trừ khi hạn local đã qua */
            if (AuthKey.IsExpiredLocally())
                await EnforceExpiredLicenseAsync();
        }
    }

    private void StartExpiryWatch()
    {
        _expiryWatch.Interval = 60_000;
        _expiryWatch.Tick -= ExpiryWatchTick;
        _expiryWatch.Tick += ExpiryWatchTick;
        _expiryWatch.Start();
    }

    private async void ExpiryWatchTick(object? sender, EventArgs e)
    {
        if (_enforcingExpiry) return;
        if (!AuthKey.IsExpiredLocally()) return;
        await EnforceExpiredLicenseAsync();
    }

    private async Task EnforceExpiredLicenseAsync()
    {
        if (_enforcingExpiry) return;
        _enforcingExpiry = true;
        try
        {
            DetectChromes();
            var hadPolicy = IsPolicyPresent();
            if (hadPolicy)
            {
                Log("Key đã hết hạn — đang gỡ chính sách extension (không đóng Chrome)...");
                RemoveForcelist();
                Log("Đã gỡ. Hãy tự đóng hết Chrome rồi mở lại để hoàn tất — không buộc tắt.");
            }

            AuthKey.Lock();
            _activated = false;
            ApplyAuthUi();
            _authError.ForeColor = Theme.Danger;
            _authError.Text = hadPolicy
                ? "Key đã hết hạn. Extension đã được gỡ khỏi Chrome."
                : "Key đã hết hạn. Nhập key khác để dùng tiếp.";
        }
        catch (Exception ex)
        {
            AuthKey.Lock();
            _activated = false;
            ApplyAuthUi();
            _authError.ForeColor = Theme.Danger;
            _authError.Text = "Key đã hết hạn. Gỡ extension thất bại: " + ex.Message;
        }
        finally
        {
            _enforcingExpiry = false;
        }

        await Task.CompletedTask;
    }

    private async Task CheckUpdateAsync()
    {
        if (_updating) return;
        _updating = true;
        SetBusy(true);
        _updateStatus.Text = "Đang kiểm tra...";
        _updateStatus.ForeColor = Theme.Accent;
        try
        {
            Log("Đang kiểm tra phiên bản mới nhất...");
            var remote = await FetchRemoteVersionAsync();
            var local = FindInstalledVersion();

            if (string.IsNullOrEmpty(remote))
            {
                _updateStatus.Text = "Không đọc được phiên bản. Thử lại sau.";
                _updateStatus.ForeColor = Theme.Danger;
                Log("Không đọc được phiên bản từ máy chủ cập nhật.");
                return;
            }

            if (!string.IsNullOrEmpty(local) && CompareVersion(local, remote) >= 0)
            {
                _updateStatus.Text = $"Đã là bản mới nhất: v{local}";
                _updateStatus.ForeColor = Theme.Success;
                Log($"Đã là bản mới nhất (v{local}).");
                return;
            }

            if (!_activated && !IsPolicyPresent())
            {
                _updateStatus.Text = $"Có bản mới v{remote} — nhập key rồi cài đặt trước.";
                _updateStatus.ForeColor = Theme.Accent;
                Log($"Có bản v{remote} nhưng máy chưa kích hoạt. Nhập key authentic rồi cài đặt.");
                return;
            }

            var from = string.IsNullOrEmpty(local) ? "chưa cài" : "v" + local;
            _updateStatus.Text = $"Có bản mới v{remote} ({from}) — đang cập nhật...";
            _updateStatus.ForeColor = Theme.Accent;
            Log($"Phát hiện bản mới v{remote} (máy: {from}). Đang tự cập nhật...");

            if (!IsPolicyPresent())
            {
                WriteForcelist();
                Log("Đã bật chính sách cài đặt cho Chrome.");
            }
            else
            {
                Log("Chính sách Chrome đã có. Không cần ghi lại.");
            }

            Log("Đang khởi động lại Chrome để tải bản mới...");

            if (!RestartChrome(_chromeBox.SelectedItem as ChromeTarget, prompt: false))
            {
                _updateStatus.Text = $"Đã bật cập nhật v{remote}. Hãy tự mở lại Chrome.";
                _updateStatus.ForeColor = Theme.Accent;
                Log("Không khởi động lại được Chrome. Hãy tự mở Chrome để hoàn tất cập nhật.");
                return;
            }

            _updateStatus.Text = $"Chrome đang tải v{remote}...";
            var applied = await WaitForVersionAsync(remote, 45000);
            if (!string.IsNullOrEmpty(applied) && CompareVersion(applied, remote) >= 0)
            {
                _updateStatus.Text = $"Đã cập nhật lên v{applied}";
                _updateStatus.ForeColor = Theme.Success;
                Log($"Cập nhật thành công: v{applied}.");
            }
            else
            {
                _updateStatus.Text = $"Đã gửi cập nhật v{remote}. Chrome sẽ tải xong trong vài giây.";
                _updateStatus.ForeColor = Theme.Accent;
                Log("Chrome đã mở lại. Bản mới sẽ xuất hiện sau khi tải xong (cần Internet).");
            }
        }
        catch (HttpRequestException ex)
        {
            _updateStatus.Text = "Không kiểm tra được (cần Internet).";
            _updateStatus.ForeColor = Theme.Danger;
            Log("Lỗi mạng khi kiểm tra cập nhật: " + ex.Message);
        }
        catch (Exception ex)
        {
            _updateStatus.Text = ex.Message;
            _updateStatus.ForeColor = Theme.Danger;
            Log("Lỗi cập nhật: " + ex.Message);
        }
        finally
        {
            _updating = false;
            SetBusy(false);
        }
    }

    private static async Task<string?> WaitForVersionAsync(string expected, int timeoutMs)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            var local = FindInstalledVersion();
            if (!string.IsNullOrEmpty(local) && CompareVersion(local, expected) >= 0)
                return local;
            await Task.Delay(1500);
        }
        return FindInstalledVersion();
    }

    private static async Task<string?> FetchRemoteVersionAsync()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FUNNYGAME");
        var xml = await http.GetStringAsync(UpdateUrl);
        var match = Regex.Match(xml, @"version=['""](\d+\.\d+\.\d+)['""]");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? FindInstalledVersion()
    {
        var userData = Path.Combine(LocalAppData(), @"Google\Chrome\User Data");
        if (!Directory.Exists(userData)) return null;

        Version? best = null;
        foreach (var profile in Directory.GetDirectories(userData))
        {
            var extDir = Path.Combine(profile, "Extensions", ExtensionId);
            if (!Directory.Exists(extDir)) continue;
            foreach (var dir in Directory.GetDirectories(extDir))
            {
                var ver = Path.GetFileName(dir).Split('_')[0];
                if (Version.TryParse(ver, out var parsed) && (best == null || parsed > best))
                    best = parsed;
            }
        }
        return best?.ToString();
    }

    private static int CompareVersion(string a, string b)
    {
        if (!Version.TryParse(a, out var va) || !Version.TryParse(b, out var vb))
            return string.Compare(a, b, StringComparison.Ordinal);
        return va.CompareTo(vb);
    }

    private void Log(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}]  {message}{Environment.NewLine}";
        if (_logBox.InvokeRequired)
            _logBox.Invoke(() => _logBox.AppendText(line));
        else
            _logBox.AppendText(line);
    }

    private static Image? LoadLogoImage()
    {
        var stream = typeof(MainForm).Assembly.GetManifestResourceStream("FunnyGameInstaller.logo.png");
        if (stream != null)
            return Image.FromStream(stream);

        var path = Path.Combine(AppContext.BaseDirectory, "logo.png");
        return File.Exists(path) ? Image.FromFile(path) : null;
    }

    private static Icon? LoadAppIcon()
    {
        var exe = Application.ExecutablePath;
        if (File.Exists(exe))
        {
            var associated = Icon.ExtractAssociatedIcon(exe);
            if (associated != null)
                return associated;
        }

        var icoPath = Path.Combine(AppContext.BaseDirectory, "app.ico");
        return File.Exists(icoPath) ? new Icon(icoPath) : null;
    }

    private static string ProgramFiles() => Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    private static string ProgramFilesX86() => Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
    private static string LocalAppData() => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    private static string Join(string root, string relative) => Path.Combine(root, relative);
}

internal static class AuthKey
{
    private const string RegPath = @"Software\FUNNYGAME\Installer";
    private const string SheetCsvUrl =
        "https://docs.google.com/spreadsheets/d/1ITw6jYqtuIwDaXvx_GLPl4CUMCNDC7C-pTwJVmNXC8E/export?format=csv&gid=1159168714";
    // Dan URL Web app sau khi Deploy Google Apps Script (Deploy > Web app > Anyone).
    private const string ScriptUrl = "https://script.google.com/macros/s/AKfycbxaF75rDeLDET5E75ePiOwVzVSM0q6eiG5S4MkdBnfDGuHc80oZBmxSySAmVsoDFFR9/exec";

    private static readonly HashSet<string> LocalHashes = new(StringComparer.OrdinalIgnoreCase)
    {
        "89b0db3f5970e05929b285afa1bc022c7e3ae9f25bb92ed51d7829d872c6237c",
        "db4dc2e187b7e079ec7e019a7419b8a2b39139941e9d8e50469f28462ac95f0f",
        "fcbdc92c6a98b9399de47403ab2cdced5c9baeb47ffaa0634262e94fe2b4f380",
        "09997c29faa8a9ba4bf142f6162e5c0116584290df87f6698db957925b4bddec",
        "87dcf9eb35b98feb98da6011096d8d22a060f5e5239dc8357240e70ea77e160e",
        "b6e90f16855667bcd399a52df828ce51c66804ca2928bb0e69042a4320f9be0f",
        "dbc2f46e5d1c990df3ef99ed7671e257ada7bd9c6328efc591c4c576debfb3fa",
        "9d92dc16b0b5de6f3e5638e210c307c0240d8f539f3d8dadf781bb275ed1b4e6",
    };

    public static string LastError { get; private set; } = "";
    public static DateTime? LastExpiresDate { get; private set; }

    public static void LoadSavedExpiry()
    {
        LastExpiresDate = ReadSavedExpires();
    }

    public static string ExpiryDisplayText()
    {
        if (LastExpiresDate is not DateTime day)
            return "Không giới hạn thời gian";
        var days = (day.Date - DateTime.Today).Days;
        if (days < 0) return "Đã hết hạn " + day.ToString("dd/MM/yyyy");
        if (days == 0) return "Hết hạn hôm nay (" + day.ToString("dd/MM/yyyy") + ")";
        return "Hết hạn: " + day.ToString("dd/MM/yyyy") + "  ·  còn " + days + " ngày";
    }

    public static bool IsExpiredLocally()
    {
        if (LastExpiresDate is not DateTime)
            LastExpiresDate = ReadSavedExpires();
        return LastExpiresDate is DateTime exp && exp.Date < DateTime.Today;
    }

    public static bool ExpiryIsSoon()
    {
        if (LastExpiresDate is not DateTime day) return false;
        return (day.Date - DateTime.Today).Days <= 7;
    }

    public static string DisplaySavedKey()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegPath);
            var raw = key?.GetValue("KeyNorm") as string;
            return FormatDisplayKey(raw);
        }
        catch
        {
            return "";
        }
    }

    public static string FormatDisplayKey(string? normalized)
    {
        var n = Normalize(normalized);
        if (n.Length >= 14 && n.StartsWith("FG", StringComparison.OrdinalIgnoreCase))
            return $"FG-{n[2..6]}-{n[6..10]}-{n[10..14]}";
        return n;
    }

    public static bool IsUnlocked()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegPath);
            var hash = key?.GetValue("KeyHash") as string;
            var norm = key?.GetValue("KeyNorm") as string;
            return !string.IsNullOrWhiteSpace(hash) && !string.IsNullOrWhiteSpace(norm);
        }
        catch
        {
            return false;
        }
    }

    public static void Lock()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RegPath);
            key.DeleteValue("KeyHash", throwOnMissingValue: false);
            key.DeleteValue("KeyNorm", throwOnMissingValue: false);
            key.DeleteValue("Expires", throwOnMissingValue: false);
            LastExpiresDate = null;
        }
        catch { /* ignore */ }
    }

    public static async Task<bool> TryUnlockAsync(string? input)
    {
        LastError = "";
        var normalized = Normalize(input);
        if (normalized.Length < 8)
        {
            LastError = "Key authentic quá ngắn.";
            return false;
        }

        var hash = HashOf(normalized);
        if (LocalHashes.Contains(hash))
        {
            SaveUnlock(hash, normalized, null);
            return true;
        }

        var script = GetScriptUrl();
        if (!string.IsNullOrWhiteSpace(script))
        {
            try
            {
                var result = await CallScriptAsync(script, "activate", normalized);
                if (!result.Ok)
                {
                    LastError = result.Message;
                    return false;
                }
                SaveUnlock(hash, normalized, ParseExpires(result.Expires));
                return true;
            }
            catch
            {
                LastError = "Không kết nối được máy chủ key. Cần Internet.";
                return false;
            }
        }

        try
        {
            var entries = await FetchSheetKeysAsync();
            var match = entries.FirstOrDefault(e => e.Hash.Equals(hash, StringComparison.OrdinalIgnoreCase));
            if (match == null)
            {
                LastError = "Key authentic không đúng.";
                return false;
            }
            if (match.RejectReason != null)
            {
                LastError = match.RejectReason;
                return false;
            }

            SaveUnlock(hash, normalized, match.Expires);
            return true;
        }
        catch (Exception)
        {
            LastError = "Không đọc được danh sách key. Cần Internet.";
            return false;
        }
    }

    public static async Task<bool> StillValidAsync()
    {
        string? stored;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegPath);
            stored = key?.GetValue("KeyHash") as string;
        }
        catch
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(stored))
            return false;
        if (LocalHashes.Contains(stored))
        {
            LastExpiresDate = null;
            return true;
        }

        string? keyNorm;
        using (var key = Registry.CurrentUser.OpenSubKey(RegPath))
            keyNorm = key?.GetValue("KeyNorm") as string;

        var script = GetScriptUrl();
        if (!string.IsNullOrWhiteSpace(script) && !string.IsNullOrWhiteSpace(keyNorm))
        {
            var result = await CallScriptAsync(script, "check", keyNorm);
            if (result.Ok)
            {
                var exp = ParseExpires(result.Expires);
                if (exp != null) SaveUnlock(stored, keyNorm, exp);
                else LastExpiresDate = ReadSavedExpires();
                LastError = "";
                return true;
            }
            LastError = result.Message;
            return false;
        }

        var entries = await FetchSheetKeysAsync();
        var match = entries.FirstOrDefault(e => e.Hash.Equals(stored, StringComparison.OrdinalIgnoreCase));
        if (match != null && match.RejectReason == null)
        {
            LastExpiresDate = match.Expires;
            LastError = "";
            return true;
        }
        LastError = match?.RejectReason ?? "Key authentic không đúng.";
        return false;
    }

    private static void SaveUnlock(string hash, string normalized, DateTime? expires)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RegPath);
        key.SetValue("KeyHash", hash, RegistryValueKind.String);
        key.SetValue("KeyNorm", normalized, RegistryValueKind.String);
        LastExpiresDate = expires;
        if (expires is DateTime day)
            key.SetValue("Expires", day.ToString("yyyy-MM-dd"), RegistryValueKind.String);
        else
            key.DeleteValue("Expires", throwOnMissingValue: false);
    }

    private static DateTime? ReadSavedExpires()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegPath);
            var raw = key?.GetValue("Expires") as string;
            return ParseExpires(raw);
        }
        catch
        {
            return null;
        }
    }

    private static DateTime? ParseExpires(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return TryParseSheetDate(value, out var date) ? date.Date : null;
    }

    private static string GetScriptUrl()
    {
        try
        {
            var side = Path.Combine(AppContext.BaseDirectory, "auth-script.url");
            if (File.Exists(side))
            {
                var line = File.ReadAllText(side).Trim();
                if (line.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    return line.Split('\n')[0].Trim();
            }
        }
        catch { /* ignore */ }
        return ScriptUrl.Trim();
    }

    private static string GetHwid()
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var key = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            var guid = key?.GetValue("MachineGuid") as string;
            if (!string.IsNullOrWhiteSpace(guid))
                return guid.Trim();
        }
        catch { /* ignore */ }
        return Environment.MachineName;
    }

    private sealed record ScriptResult(bool Ok, string Message, string? Expires);

    private static async Task<ScriptResult> CallScriptAsync(string scriptUrl, string action, string key)
    {
        var url = scriptUrl.TrimEnd('/');
        if (!url.Contains("/exec", StringComparison.OrdinalIgnoreCase))
            url = url.TrimEnd('/') + "/exec";

        var query = $"action={Uri.EscapeDataString(action)}"
            + $"&key={Uri.EscapeDataString(key)}"
            + $"&hwid={Uri.EscapeDataString(GetHwid())}"
            + $"&user={Uri.EscapeDataString(Environment.MachineName)}";

        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true })
        {
            Timeout = TimeSpan.FromSeconds(20)
        };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FUNNYGAME");
        var json = await http.GetStringAsync(url + "?" + query);
        json = json.Trim();
        var start = json.IndexOf('{');
        var end = json.LastIndexOf('}');
        if (start < 0 || end <= start)
            return new ScriptResult(false, "Máy chủ key trả về dữ liệu không hợp lệ.", null);

        using var doc = System.Text.Json.JsonDocument.Parse(json.Substring(start, end - start + 1));
        var root = doc.RootElement;
        var ok = root.TryGetProperty("ok", out var okEl) && okEl.ValueKind == System.Text.Json.JsonValueKind.True;
        var message = root.TryGetProperty("message", out var msgEl) ? msgEl.GetString() : "";
        string? expires = null;
        if (root.TryGetProperty("expiresIso", out var isoEl))
            expires = isoEl.GetString();
        if (string.IsNullOrWhiteSpace(expires) && root.TryGetProperty("expires", out var expEl))
            expires = expEl.GetString();
        return new ScriptResult(ok, string.IsNullOrWhiteSpace(message) ? (ok ? "OK" : "Key authentic không đúng.") : message!, expires);
    }

    private static string Normalize(string? key) =>
        Regex.Replace((key ?? "").Trim().ToUpperInvariant(), "[^A-Z0-9]", "");

    private static string HashOf(string normalized) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized))).ToLowerInvariant();

    private sealed record SheetKey(string Hash, string? RejectReason, DateTime? Expires = null);

    private static async Task<List<SheetKey>> FetchSheetKeysAsync()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FUNNYGAME");
        using var response = await http.GetAsync(SheetCsvUrl);
        var csv = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode || LooksLikeLoginPage(csv))
            throw new InvalidOperationException("sheet-private");

        var result = new List<SheetKey>();
        var rows = ParseCsv(csv);
        if (rows.Count == 0)
            return result;

        var header = rows[0].Select(Fold).ToArray();
        var keyCol = IndexOfHeader(header, "key", "ma", "code", "authentic", "license", "serial");
        var statusCol = IndexOfHeader(header, "status", "trang thai", "state");
        var expiresCol = IndexOfHeader(header, "expires", "expire", "han su dung", "het han");
        var daysCol = IndexOfHeader(header, "days", "ngay");
        var createdCol = IndexOfHeader(header, "created", "tao", "bat dau", "start");
        if (keyCol < 0) keyCol = 0;

        var start = LooksLikeHeader(header) ? 1 : 0;
        var today = DateTime.Today;
        for (var i = start; i < rows.Count; i++)
        {
            var row = rows[i];
            if (keyCol >= row.Length) continue;
            var normalized = Normalize(row[keyCol]);
            if (normalized.Length < 8) continue;
            var hash = HashOf(normalized);

            if (statusCol >= 0 && statusCol < row.Length && IsDisabledStatus(row[statusCol]))
            {
                result.Add(new SheetKey(hash, "Key đã bị khóa hoặc hết lượt."));
                continue;
            }

            DateTime? created = null;
            if (createdCol >= 0 && createdCol < row.Length && TryParseSheetDate(row[createdCol], out var createdAt))
                created = createdAt.Date;
            if (created != null && created > today)
            {
                result.Add(new SheetKey(hash, "Key chưa tới ngày bắt đầu."));
                continue;
            }

            DateTime? expires = null;
            if (expiresCol >= 0 && expiresCol < row.Length && TryParseSheetDate(row[expiresCol], out var exp))
                expires = exp.Date;
            else if (daysCol >= 0 && created != null && daysCol < row.Length
                     && int.TryParse(row[daysCol].Trim(), out var days) && days > 0)
                expires = created.Value.AddDays(days);

            if (expires != null && expires < today)
            {
                result.Add(new SheetKey(hash, "Key đã hết hạn."));
                continue;
            }

            result.Add(new SheetKey(hash, null, expires));
        }
        return result;
    }

    private static bool TryParseSheetDate(string value, out DateTime date)
    {
        date = default;
        var text = (value ?? "").Trim();
        if (text.Length == 0) return false;
        var formats = new[] { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy", "M/d/yyyy", "dd-MM-yyyy" };
        if (DateTime.TryParseExact(text, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
            return true;
        return DateTime.TryParse(text, CultureInfo.GetCultureInfo("vi-VN"), DateTimeStyles.None, out date)
            || DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private static bool LooksLikeLoginPage(string text) =>
        text.Contains("<html", StringComparison.OrdinalIgnoreCase)
        || text.Contains("Đăng nhập", StringComparison.OrdinalIgnoreCase)
        || text.Contains("accounts.google.com", StringComparison.OrdinalIgnoreCase);

    private static bool LooksLikeHeader(string[] header) =>
        header.Any(h => h is "key" or "ma" or "mã" or "code" or "authentic" or "license"
            or "status" or "trang thai" or "trạng thái");

    private static int IndexOfHeader(string[] header, params string[] names)
    {
        for (var i = 0; i < header.Length; i++)
        {
            foreach (var name in names)
            {
                if (header[i] == name || header[i].Contains(name))
                    return i;
            }
        }
        return -1;
    }

    private static bool IsDisabledStatus(string status)
    {
        var s = Fold(status);
        if (string.IsNullOrWhiteSpace(s)) return false;
        return s is "banned" or "disabled" or "revoked" or "used" or "het" or "expired"
            or "expire" or "khoa" or "lock" or "inactive" or "no" or "false" or "0";
    }

    private static string Fold(string value)
    {
        var formD = (value ?? "").Trim().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(formD.Length);
        foreach (var ch in formD)
        {
            var cat = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (cat != UnicodeCategory.NonSpacingMark)
                sb.Append(ch);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    private static List<string[]> ParseCsv(string text)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        text = text.Replace("\r\n", "\n").Replace('\r', '\n').Trim('\uFEFF');

        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (quoted)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        cell.Append('"');
                        i++;
                    }
                    else quoted = false;
                }
                else cell.Append(ch);
                continue;
            }

            switch (ch)
            {
                case '"':
                    quoted = true;
                    break;
                case ',':
                    row.Add(cell.ToString());
                    cell.Clear();
                    break;
                case '\n':
                    row.Add(cell.ToString());
                    cell.Clear();
                    if (row.Any(v => !string.IsNullOrWhiteSpace(v)))
                        rows.Add(row.ToArray());
                    row = new List<string>();
                    break;
                default:
                    cell.Append(ch);
                    break;
            }
        }

        row.Add(cell.ToString());
        if (row.Any(v => !string.IsNullOrWhiteSpace(v)))
            rows.Add(row.ToArray());
        return rows;
    }
}
