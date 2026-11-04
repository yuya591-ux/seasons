# 便22: 前の便（便18〜21）で立てて止め忘れた、seasons の手元の確かめ用のサーバー（vite preview）だけを止める
#   止める: ポート 4951・4955・4938・4986・4971・4972・4981・4982 の vite preview
#   止めない: 今の全テストが使う 4961・4962、三日月（mikazuki-arcade）の開発用のサーバー、firebase の処理
$ports = @('4951', '4955', '4938', '4986', '4971', '4972', '4981', '4982')
$n = 0
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='node.exe'")) {
  $m = [regex]::Match([string]$p.CommandLine, 'preview --port (\d+)')
  if ($m.Success -and ($ports -contains $m.Groups[1].Value)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }
}
"止めた処理: $n"
"空きメモリ: " + [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1) + "GB"
