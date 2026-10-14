import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

// Shows a jumping Claude mascot holding a "~12.4k saved" sign, thumbs up, above the prompt (terminal and desktop).
// Figures come from the JSONL files scripts/stats.js appends to, ~/.claude/token-saver/stats.
const saved = atom({ plugin: 'token-saver', key: 'total' } as const, 0)

const REFRESH_MS = 3000
const JUMP_MS = 500
const frame = atom({ plugin: 'token-saver', key: 'frame' } as const, 0)

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const safe = (id: string) => String(id || 'unknown').replace(/[^\w-]/g, '_')

const sum = (text: string) => {
  let total = 0
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      total += JSON.parse(line).tokens || 0
    } catch {
      // skip a bad line
    }
  }
  return total
}

// Desktop: the mascot and sign are drawn as SVG (text-glyph art can't be aligned there). Crab geometry follows
// savvy-progress's pixel Clawd: a 30x28 grid, scaled by CRAB_SCALE.
const CLAY = '#D97757'
const INK = '#1F1E1D'
const CRAB_SCALE = 1.5
const SVG_H = 48

const px = (x: number, y: number, w: number, h: number, fill: string, cls: string = ''): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`

const crabSvg = (text: string, boxW: number, W: number): string => {
  const crab: string = [
    `<g class="bd">`,
    px(7, 10, 16, 12, CLAY),
    px(3, 14, 4, 4, CLAY),
    px(23, 14, 4, 4, CLAY),
    px(9, 12, 2, 2, INK),
    px(19, 12, 2, 2, INK),
    `</g>`,
    px(7, 22, 2, 4, CLAY, 'la'),
    px(17, 22, 2, 4, CLAY, 'la'),
    px(11, 22, 2, 4, CLAY, 'lb'),
    px(21, 22, 2, 4, CLAY, 'lb'),
  ].join('')
  const bx: number = 48
  const by: number = 10
  const bh: number = 30
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${SVG_H}" viewBox="0 0 ${W} ${SVG_H}">
<style>
.t{fill:#1f1f1f}.ln{stroke:#1f1f1f}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.ln{stroke:#ececec}}
.hop{animation:hop 1s ease-in-out infinite}
.la{animation:st .5s steps(1) infinite}.lb{animation:st .5s steps(1) infinite -.25s}
@keyframes hop{50%{transform:translateY(-3px)}}@keyframes st{50%{transform:translateY(-1px)}}
@media (prefers-reduced-motion: reduce){.hop,.la,.lb{animation:none}}
</style>
<g class="hop"><g transform="translate(0 3) scale(${CRAB_SCALE})">${crab}</g>
<rect class="ln" x="${bx}" y="${by}" width="${boxW - 2}" height="${bh}" rx="6" fill="none" stroke-width="1.5"/>
<text class="t" x="${bx + 12}" y="${by + 20}" font-family="system-ui,sans-serif" font-size="14" font-weight="700">${text}</text>
<text x="${bx + boxW - 30}" y="${by + 21}" font-size="15">👍</text></g>
</svg>`
}

async function load($: Engine) {
  try {
    const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
    if (!home) return
    const id = await $.session.id()
    const text = await $.fs.read(`${home}/.claude/token-saver/stats/${safe(id)}.jsonl`)
    await update($, saved, () => sum(String(text)))
  } catch {
    // no stats yet
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await load($)
    $.clock.every(REFRESH_MS, () => load($))
    $.clock.every(JUMP_MS, () => update($, frame, (f: number) => 1 - f))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await load($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const total = await read($, saved)
    const up = (await read($, frame)) === 1

    if (e.props.hasSurvey || total <= 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    if ('Svg' in ui) {
      const { Svg } = ui
      const text: string = '~' + fmt(total) + ' saved'
      const boxW: number = Math.round(text.length * 8.4 + 52)
      const W: number = 48 + boxW
      return (
        <Svg
          source={crabSvg(text, boxW, W)}
          alt={`token-saver: ${text}`}
          width={W}
          height={SVG_H}
        />
      )
    }

    const label = ' ~' + fmt(total) + ' saved '
    const sign = ['┌' + '─'.repeat(label.length), '│' + label, '└' + '─'.repeat(label.length)]
    const nbsp = (row: string): string => row.replace(/ /g, ' ')
    const mascot: string[] = [' ▐▛███▜▌ ', '▝▜█████▛▘', ' █ █ █ █ '].map(nbsp)
    const lift = (rows: string[]) => (up ? [' ', ...rows] : [...rows, ' '])
    const m = lift(mascot)
    const s3 = lift(sign)
    const thumb = lift([' ', '👍', ' '])

    return (
      <Box flexDirection="column">
        {m.map((row, i) => (
          <Box key={i}>
            <Box width={11}>
              <Text color="#D77757">{row}</Text>
            </Box>
            <Box width={label.length + 2}>
              <Text bold>{s3[i]}</Text>
            </Box>
            <Box marginLeft={1}>
              <Text>{thumb[i]}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}
