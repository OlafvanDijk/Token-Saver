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

    const { Box, Text } = $.ui.resolve(e)

    const label = ' ~' + fmt(total) + ' saved '
    const sign = ['┌' + '─'.repeat(label.length) + '┐', '│' + label + '│', '└' + '─'.repeat(label.length) + '┘']
    const mascot = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▀▀ ▀▀  ']
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
