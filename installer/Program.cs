using System.Diagnostics;
using System.Drawing.Drawing2D;
using Microsoft.Win32;

namespace FunnyGameInstaller;

internal static class Theme
{
    public static readonly Color Bg = Color.FromArgb(6, 7, 12);
    public static readonly Color Surface = Color.FromArgb(16, 18, 28);
    public static readonly Color SurfaceHover = Color.FromArgb(24, 28, 42);
    public static readonly Color Border = Color.FromArgb(42, 48, 68);
    public static readonly Color Text = Color.FromArgb(248, 250, 252);
    public static readonly Color Muted = Color.FromArgb(139, 146, 166);
    public static readonly Color Blue = Color.FromArgb(59, 130, 246);
    public static readonly Color BlueDeep = Color.FromArgb(37, 99, 235);
    public static readonly Color Gold = Color.FromArgb(245, 196, 81);
    public static readonly Color Success = Color.FromArgb(52, 211, 153);
    public static readonly Color Danger = Color.FromArgb(248, 113, 113);
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

internal sealed class CardPanel : Panel
{
    public CardPanel()
    {
        DoubleBuffered = true;
        BackColor = Color.Transparent;
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
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        FlatAppearance.MouseOverBackColor = Color.Transparent;
        FlatAppearance.MouseDownBackColor = Color.Transparent;
        Cursor = Cursors.Hand;
        ForeColor = Color.White;
        Font = new Font("Segoe UI Semibold", 10.5f);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        using var path = Round(rect, 12);
        if (Primary)
        {
            using var brush = new LinearGradientBrush(rect,
                _hover ? Color.FromArgb(80, 140, 255) : Theme.Blue,
                _hover ? Theme.BlueDeep : Color.FromArgb(29, 78, 216),
                45f);
            e.Graphics.FillPath(brush, path);
        }
        else
        {
            using var fill = new SolidBrush(_hover ? Theme.SurfaceHover : Color.FromArgb(22, 26, 38));
            using var pen = new Pen(_hover ? Theme.Blue : Theme.Border);
            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(pen, path);
        }

        TextRenderer.DrawText(
            e.Graphics, Text, Font, ClientRectangle,
            Primary ? Color.White : Theme.Text,
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
    // Extension force-install: ID sinh tu khoa dong goi + update manifest tu-host tren GitHub.
    private const string ExtensionId = "ofmhoggnlfaighchkdbeagdmdeaoolib";
    private const string UpdateUrl = "https://raw.githubusercontent.com/luanem2709/YOUTUBE-ADB-BLOCK/main/release/update.xml";
    private const string PolicyPath = @"Software\Policies\Google\Chrome\ExtensionInstallForcelist";
    private static string ForceEntry => $"{ExtensionId};{UpdateUrl}";

    private readonly ComboBox _chromeBox = new();
    private readonly CheckBox _restartBox = new();
    private readonly TextBox _logBox = new();
    private readonly AccentButton _installBtn = new();
    private readonly AccentButton _removeBtn = new();
    private readonly AccentButton _browseBtn = new();
    private readonly ProgressBar _progress = new();
    private readonly Label _statusDot = new();

    public MainForm()
    {
        Text = "FUNNY GAME";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(720, 660);
        Size = new Size(780, 720);
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        Font = new Font("Segoe UI", 9.5f);
        DoubleBuffered = true;
        Icon = LoadAppIcon();

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(22),
            BackColor = Color.Transparent,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildConfigCard(), 0, 1);
        root.Controls.Add(BuildInstallRow(), 0, 2);
        root.Controls.Add(BuildLogCard(), 0, 3);
        Controls.Add(root);

        Load += (_, _) =>
        {
            DetectChromes();
            Log("Sẵn sàng. Bấm cài đặt để bật chặn quảng cáo qua chính sách Chrome.");
            Log("Extension ID: " + ExtensionId);
            if (IsPolicyPresent())
                Log("Đã phát hiện chính sách sẵn có — extension đang được bật.");
        };
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new LinearGradientBrush(ClientRectangle,
            Color.FromArgb(14, 18, 32), Theme.Bg, 90f);
        e.Graphics.FillRectangle(brush, ClientRectangle);
        using var glow = new SolidBrush(Color.FromArgb(28, 245, 196, 81));
        e.Graphics.FillEllipse(glow, Width / 2 - 220, -120, 440, 220);
    }

    private Control BuildHeader()
    {
        var header = new Panel { Height = 92, Dock = DockStyle.Top, BackColor = Color.Transparent };

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
            Text = "Chặn quảng cáo YouTube — cài qua chính sách Chrome",
            Left = 84,
            Top = 50,
            AutoSize = true,
            ForeColor = Theme.Muted,
            BackColor = Color.Transparent,
        };
        var badge = new Label
        {
            Text = "  FORCE-INSTALL  ",
            AutoSize = true,
            Left = 320,
            Top = 22,
            Font = new Font("Segoe UI Semibold", 8),
            ForeColor = Theme.Gold,
            BackColor = Color.FromArgb(40, 245, 196, 81),
            Padding = new Padding(6, 3, 6, 3),
        };

        header.Controls.Add(mark);
        header.Controls.Add(title);
        header.Controls.Add(sub);
        header.Controls.Add(badge);
        header.Resize += (_, _) => badge.Left = Math.Max(320, header.Width - badge.Width - 8);
        return header;
    }

    private Control BuildConfigCard()
    {
        var card = new CardPanel { Dock = DockStyle.Top, Height = 176, Margin = new Padding(0, 8, 0, 10) };

        var inner = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            BackColor = Color.Transparent,
        };
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        inner.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        inner.Controls.Add(FieldLabel("Chrome sẽ dùng để mở lại"), 0, 0);
        inner.Controls.Add(BuildChromeRow(), 0, 1);

        var checks = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 10, 0, 4),
        };
        StyleCheck(_restartBox, "Đóng và mở lại Chrome ngay để áp dụng (khuyến nghị)", true);
        var note = new Label
        {
            Text = "Chrome sẽ tự tải extension từ GitHub sau khi khởi động lại (cần Internet).",
            AutoSize = true,
            ForeColor = Theme.Muted,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 6, 0, 0),
        };
        checks.Controls.Add(_restartBox);
        checks.Controls.Add(note);
        inner.Controls.Add(checks, 0, 2);

        card.Controls.Add(inner);
        return card;
    }

    private Control BuildInstallRow()
    {
        var host = new Panel { Dock = DockStyle.Fill, BackColor = Color.Transparent, Margin = new Padding(0, 0, 0, 10) };

        var rowButtons = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = Color.Transparent,
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
            BackColor = Color.Transparent,
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
            BackColor = Color.Transparent,
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
        _logBox.BackColor = Color.FromArgb(10, 12, 18);
        _logBox.ForeColor = Color.FromArgb(186, 196, 214);
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
        box.BackColor = Color.FromArgb(12, 14, 22);
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

    private void DetectChromes()
    {
        _chromeBox.Items.Clear();
        foreach (var chrome in FindChromes())
            _chromeBox.Items.Add(chrome);
        if (_chromeBox.Items.Count > 0)
            _chromeBox.SelectedIndex = 0;
        else
            Log("Không tìm thấy Chrome. Hãy bấm \"Chọn file\" để trỏ tới chrome.exe.");
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
    }

    private async Task InstallAsync()
    {
        SetBusy(true);
        try
        {
            Log("Đang ghi chính sách force-install vào Windows (HKCU, không cần quyền admin)...");
            WriteForcelist();
            Log("Đã bật extension trong chính sách Chrome. ID: " + ExtensionId);

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

            Log("Kiểm tra tại chrome://extensions — extension sẽ xuất hiện sau vài giây (cần Internet).");
            _statusDot.Text = "● Hoàn tất";
            _statusDot.ForeColor = Theme.Success;
            MessageBox.Show(this,
                "Đã bật chặn quảng cáo cho Chrome trên máy này.\n\n" +
                "Chrome sẽ tự tải extension từ GitHub sau khi khởi động lại (cần Internet).\n" +
                "Mở chrome://extensions để kiểm tra, hoặc chrome://policy để xem chính sách.",
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
            _statusDot.ForeColor = Theme.Gold;
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
        using var key = Registry.CurrentUser.CreateSubKey(PolicyPath, writable: true)
            ?? throw new InvalidOperationException("Không mở được khóa chính sách trong Registry.");

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
    }

    private bool RestartChrome(ChromeTarget? chrome)
    {
        var running = GetChromeProcesses();
        if (running.Count > 0)
        {
            var ask = MessageBox.Show(this,
                "Cần đóng Chrome rồi mở lại để áp dụng.\n\nĐóng Chrome ngay bây giờ?",
                "FUNNY GAME",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (ask != DialogResult.Yes)
                return false;

            Log("Đang đóng Chrome...");
            foreach (var proc in running)
            {
                try
                {
                    proc.CloseMainWindow();
                    if (!proc.WaitForExit(2500))
                        proc.Kill(true);
                }
                catch { /* co the da thoat */ }
            }
            Thread.Sleep(1200);
        }

        var exe = chrome?.ExePath ?? GetChromeProcesses().FirstOrDefault()?.MainModule?.FileName;
        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
        {
            Log("Không xác định được chrome.exe để mở lại. Hãy tự mở Chrome.");
            return false;
        }

        Log("Đang mở lại Chrome (chrome://extensions)...");
        Process.Start(new ProcessStartInfo
        {
            FileName = exe,
            Arguments = "chrome://extensions",
            UseShellExecute = true,
        });
        return true;
    }

    private static List<Process> GetChromeProcesses()
    {
        return Process.GetProcessesByName("chrome").ToList();
    }

    private void SetBusy(bool busy)
    {
        _installBtn.Enabled = !busy;
        _removeBtn.Enabled = !busy;
        _browseBtn.Enabled = !busy;
        _chromeBox.Enabled = !busy;
        _progress.Visible = busy;
        _progress.MarqueeAnimationSpeed = busy ? 30 : 0;
        _statusDot.Text = busy ? "● Đang xử lý..." : "● Sẵn sàng";
        _statusDot.ForeColor = busy ? Theme.Gold : Theme.Success;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
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
