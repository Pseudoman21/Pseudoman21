// Generates a custom "engineering activity" SVG card for the README.
//
// The numbers are sourced from github-stats-extended (a hosted fork of
// github-readme-stats) purely as a data feed -- we parse the plain-text
// <desc> it embeds in its own SVG rather than embedding that SVG. The
// rendered card here is fully custom, styled like a CI checks list /
// terminal log instead of the icon-list-with-rank-gauge card that source
// normally produces, so it doesn't read as a copy of anyone else's README.
const username = process.env.SNK_USERNAME;
const outSvg = process.env.CARD_OUT_SVG ?? "dist/engineering-activity.svg";

if (!username) throw new Error("SNK_USERNAME env var is required");

const statsUrl =
  `https://github-stats-extended.vercel.app/api` +
  `?username=${encodeURIComponent(username)}` +
  `&show_icons=true&include_all_commits=true&count_private=true` +
  `&show=prs_merged,prs_merged_percentage,prs_authored,prs_reviewed,reviews,issues_authored` +
  `&hide=contribs,stars`;

const res = await fetch(statsUrl);
if (!res.ok) throw new Error(`stats fetch failed: ${res.status} ${await res.text().catch(() => "")}`);
const rawSvg = await res.text();

const desc = rawSvg.match(/<desc id="descId">([^<]*)<\/desc>/)?.[1] ?? "";
const stats: Record<string, number> = {};
for (const part of desc.split(",")) {
  const i = part.indexOf(":");
  if (i === -1) continue;
  const key = part.slice(0, i).trim();
  const value = parseFloat(part.slice(i + 1).trim());
  if (!Number.isNaN(value)) stats[key] = value;
}
if (Object.keys(stats).length === 0) throw new Error(`couldn't parse any stats out of: ${desc}`);

const rows = [
  { label: "commits", value: stats["Total Commits"] ?? 0 },
  { label: "prs opened", value: stats["Total PRs"] ?? 0 },
  { label: "prs merged", value: stats["Total PRs Merged"] ?? 0 },
  { label: "reviews given", value: stats["Total PRs Reviewed"] ?? 0 },
  { label: "prs reviewed", value: stats["PRs Reviewed"] ?? 0 },
  { label: "issues opened", value: stats["Total Issues"] ?? 0 },
];
const mergeRate = stats["Merged PRs Percentage"] ?? 0;

// -- design tokens ------------------------------------------------------
const color = {
  surface: "#171A24",
  border: "#262B3A",
  text: "#EDEBE6",
  muted: "#767C8C",
  accent: "#35D399",
};
const font = `ui-monospace,'SF Mono','Cascadia Code','Roboto Mono',Menlo,Consolas,monospace`;
const charW = (fontSize: number) => fontSize * 0.6; // monospace advance-width approximation

// -- layout ---------------------------------------------------------------
const width = 480;
const padX = 24;
const headerY = 34;
const dividerAY = 54;
const rowStartY = dividerAY + 30;
const rowGap = 27;
const dividerBY = rowStartY + (rows.length - 1) * rowGap + 16;
const footerLabelY = dividerBY + 24;
const barY = footerLabelY + 10;
const height = barY + 30;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const headerText = `${username}/engineering-activity`;
const headerFontSize = 13;
const cursorX = padX + 16 + headerText.length * charW(headerFontSize) + 4;

const pillW = 54;
const pillX = width - padX - pillW;

const rowsSvg = rows
  .map((row, i) => {
    const y = rowStartY + i * rowGap;
    const active = row.value > 0;
    const glyph = active ? "✓" : "–"; // check / en-dash
    const glyphColor = active ? color.accent : color.muted;
    const labelColor = active ? color.text : color.muted;
    const valueColor = active ? color.text : color.muted;
    const valueStr = String(row.value);

    const labelX = padX + 22;
    const leaderStart = labelX + row.label.length * charW(13) + 8;
    const valueX = width - padX;
    const leaderEnd = valueX - valueStr.length * charW(13) - 10;

    return `
    <text x="${padX}" y="${y}" font-family="${font}" font-size="13" fill="${glyphColor}">${glyph}</text>
    <text x="${labelX}" y="${y}" font-family="${font}" font-size="13" fill="${labelColor}">${esc(row.label)}</text>
    ${leaderEnd > leaderStart ? `<line x1="${leaderStart.toFixed(1)}" y1="${y - 4}" x2="${leaderEnd.toFixed(1)}" y2="${y - 4}" stroke="${color.border}" stroke-width="1" stroke-dasharray="1,4"/>` : ""}
    <text x="${valueX}" y="${y}" text-anchor="end" font-family="${font}" font-size="13" font-weight="700" fill="${valueColor}">${valueStr}</text>`;
  })
  .join("");

const barTrackW = width - padX * 2 - 54;
const barFillW = Math.max(2, barTrackW * Math.min(1, mergeRate / 100));

const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(username)} engineering activity">
<desc>Total Commits: ${rows[0].value}, PRs Opened: ${rows[1].value}, PRs Merged: ${rows[2].value}, Merge Rate: ${mergeRate}%, Reviews Given: ${rows[3].value}, PRs Reviewed: ${rows[4].value}, Issues Opened: ${rows[5].value}</desc>
<style>
  .cursor { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
</style>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${color.surface}" stroke="${color.border}"/>
<circle cx="${padX + 4}" cy="${headerY - 4}" r="4" fill="${color.accent}"/>
<text x="${padX + 16}" y="${headerY}" font-family="${font}" font-size="${headerFontSize}" font-weight="600" fill="${color.text}">${esc(headerText)}</text>
<rect class="cursor" x="${cursorX.toFixed(1)}" y="${headerY - 11}" width="7" height="14" fill="${color.accent}"/>
<rect x="${pillX}" y="20" width="${pillW}" height="20" rx="10" fill="${color.accent}" fill-opacity="0.14" stroke="${color.accent}" stroke-opacity="0.4"/>
<text x="${pillX + pillW / 2}" y="34" text-anchor="middle" font-family="${font}" font-size="10" font-weight="700" letter-spacing="1" fill="${color.accent}">PASS</text>
<line x1="${padX}" y1="${dividerAY}" x2="${width - padX}" y2="${dividerAY}" stroke="${color.border}" stroke-width="1"/>
${rowsSvg}
<line x1="${padX}" y1="${dividerBY}" x2="${width - padX}" y2="${dividerBY}" stroke="${color.border}" stroke-width="1"/>
<text x="${padX}" y="${footerLabelY}" font-family="${font}" font-size="11" fill="${color.muted}">merge rate</text>
<text x="${width - padX}" y="${footerLabelY}" text-anchor="end" font-family="${font}" font-size="13" font-weight="700" fill="${color.accent}">${mergeRate.toFixed(0)}%</text>
<rect x="${padX}" y="${barY}" width="${barTrackW}" height="6" rx="3" fill="${color.border}"/>
<rect x="${padX}" y="${barY}" width="${barFillW.toFixed(1)}" height="6" rx="3" fill="${color.accent}"/>
</svg>`;

await Bun.write(outSvg, svg);
console.log(`wrote ${outSvg}`);
