#!/usr/bin/env node
/**
 * Style-drift guard for the miniprogram WXSS token system.
 *
 * Rules (see miniprogram/app.wxss header for the system):
 *  1. No raw hex colors outside app.wxss (token definitions live there).
 *  2. No hex fallbacks in var(--token, #hex) — tokens are the single
 *     source of truth, fallbacks silently fork them.
 *  3. rgb()/rgba() channels must match a known token base colour
 *     (WXSS cannot derive alpha from a var; alpha of a token base is
 *     tolerated, foreign colours are not).
 *  4. font-size must use the even rpx ladder.
 *
 * Usage: node scripts/check-style-drift.mjs   (exit 1 on violations)
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const MINI = join(ROOT, 'miniprogram')

/** RGB channels of every token base colour (sync with app.wxss). */
const TOKEN_CHANNELS = new Set(
	[
		'#38003c', '#1d0520', '#2b0a33', '#00ff85', '#ff2882', '#f9f7f2',
		'#008545', '#00d16d', '#1a001e', '#c9183f', '#924a07', '#82208a',
		'#f9f8f4', '#301333', '#6e5a72', '#ffffff', '#ddd4de', '#f1efe9',
		'#dcf6ea', '#fbe3e9', '#f6ead9', '#f0e3f2', '#fbbf24', '#f87171',
		'#fcd34d', '#451a03', '#500724', '#000000',
	].map(hex => {
		const n = parseInt(hex.slice(1), 16)
		return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
	}),
)

const FONT_LADDER = new Set([18, 20, 22, 24, 26, 28, 30, 34, 38, 48, 56])

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		if (entry === 'miniprogram_npm' || entry === 'node_modules') continue
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) yield* walk(full)
		else if (entry.endsWith('.wxss')) yield full
	}
}

const violations = []
const HEX = /#[0-9a-fA-F]{3,8}\b/
const VAR_FALLBACK = /var\(\s*--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/
const RGBA = /rgba?\(([^)]+)\)/g
const FONT_SIZE = /font-size:\s*(\d+(?:\.\d+)?)rpx/g

for (const file of walk(MINI)) {
	const rel = relative(ROOT, file)
	const isTokenFile = rel.endsWith(join('miniprogram', 'app.wxss'))
	const lines = readFileSync(file, 'utf8').split('\n')
	lines.forEach((line, i) => {
		const at = `${rel}:${i + 1}`
		const isDefinition = /^\s*--[\w-]+\s*:/.test(line)
		if (!isTokenFile && !isDefinition && HEX.test(line)) {
			violations.push(`${at}  raw hex: ${line.trim()}`)
		}
		if (VAR_FALLBACK.test(line)) {
			violations.push(`${at}  hex fallback in var(): ${line.trim()}`)
		}
		for (const m of line.matchAll(RGBA)) {
			const channels = m[1].split(',').slice(0, 3).map(s => s.trim()).join(', ')
			if (!TOKEN_CHANNELS.has(channels)) {
				violations.push(`${at}  foreign rgb base (${channels}): ${line.trim()}`)
			}
		}
		for (const m of line.matchAll(FONT_SIZE)) {
			if (!FONT_LADDER.has(Number(m[1]))) {
				violations.push(`${at}  off-ladder font-size ${m[1]}rpx`)
			}
		}
	})
}

if (violations.length) {
	console.error(`style-drift: ${violations.length} violation(s)`)
	for (const v of violations) console.error(`  ${v}`)
	process.exit(1)
}
console.log('style-drift: clean ✓')
