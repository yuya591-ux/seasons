// 2026-11-03: 「本番の問いに『はい』と答えた直後は Claude Code が git push origin main を打つ」（裁定記録 49行・2026-10-13 の裕也さんの決め）を、
// この案件の手元の設定にも当てる台本。Claude Code は自分の権限の設定を書き換えられないので、裕也さんが PC で1回だけ打つ:
//   ! node scripts/_push-unlock.cjs
// する事（これだけ）:
//   1 .claude/settings.local.json の「git push を一律に止める」行（Bash(git push *)）を外し、git push origin main だけを許す。強制の push（--force・-f）は止めたまま
//   2 .claude/shindan/config.md の本番の出し方の push の行に取り消し線を引き、新しい形（CLAUDE.md の push の行と同じ）を書く
//   前の中身は .claude/*.bak_20261103 に控える
const fs = require('fs')
const S = '.claude/settings.local.json', C = '.claude/shindan/config.md'
fs.copyFileSync(S, S + '.bak_20261103')
const j = JSON.parse(fs.readFileSync(S, 'utf8'))
j.permissions.deny = j.permissions.deny.filter((d) => d !== 'Bash(git push *)')
for (const d of ['Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git push * --force*)', 'Bash(git push * -f*)']) if (!j.permissions.deny.includes(d)) j.permissions.deny.push(d)
j.permissions.allow = [...new Set([...(j.permissions.allow || []), 'Bash(git push origin main)'])]
fs.writeFileSync(S, JSON.stringify(j, null, 2) + '\n')
fs.copyFileSync(C, C + '.bak_20261103')
let c = fs.readFileSync(C, 'utf8')
const old = 'push は裕也さんが `! git push origin main` の1行で打つ（Claude Code は push しない）'
if (c.includes(old) && !c.includes('~~' + old + '~~')) c = c.replace(old, '~~' + old + '~~【2026-11-03】本番の問いへの「はい」（または `/qa-gate seasons 本番`）の直後に、Claude Code が `git push origin main` を打つ（CLAUDE.md の push の行）')
fs.writeFileSync(C, c)
console.log('済み: 止める行 ' + j.permissions.deny.join('・') + ' ／ 許す行 ' + j.permissions.allow.join('・'))
