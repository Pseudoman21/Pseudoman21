// Generates the "snake eats your contributions" animation SVG.
//
// This is run from inside a checkout of https://github.com/Platane/snk
// (see .github/workflows/main.yml) so the @snk/* workspace packages resolve.
//
// Why this file exists: the packaged snk GitHub Action only ever draws your
// *real* contribution calendar, which looks pretty empty (and makes for a
// short, boring snake) if you don't have many public contributions. This
// script fetches your real calendar first, then invents extra contributions
// on days that are still empty, before handing the grid to snk's own
// pathfinder + SVG renderer. Days that already have real contributions are
// never touched. This only changes the look of the animation SVG -- it has
// no effect on your actual GitHub profile / contribution graph.
import { getGithubUserContribution } from "@snk/github-user-contribution";
import { getBestRoute } from "@snk/solver/getBestRoute";
import { getPathToPose } from "@snk/solver/getPathToPose";
import { createSvg } from "@snk/svg-creator";
import { snake4 } from "@snk/types/__fixtures__/snake";
import { createEmptyGrid, setColor } from "@snk/types/grid";

const username = process.env.SNK_USERNAME;
const githubToken = process.env.GITHUB_TOKEN;
const outSvg = process.env.SNAKE_OUT_SVG ?? "dist/github-contribution-grid-snake.svg";

// 0 = only ever draw real contributions. 1 = fill in every empty day.
const fillProbability = Number(process.env.SNAKE_FILL_PROBABILITY ?? "0.4");

if (!username) throw new Error("SNK_USERNAME env var is required");
if (!githubToken) throw new Error("GITHUB_TOKEN env var is required");

const cells = await getGithubUserContribution(username, { githubToken });

const today = new Date().toISOString().slice(0, 10);

// Roughly mimics how a real, organic contribution graph skews: lots of
// small days, fewer big ones.
const pickInventedLevel = () => {
  const r = Math.random();
  if (r < 0.5) return 1;
  if (r < 0.8) return 2;
  if (r < 0.95) return 3;
  return 4;
};

let invented = 0;
for (const cell of cells) {
  if (cell.level === 0 && cell.date <= today && Math.random() < fillProbability) {
    cell.level = pickInventedLevel() as typeof cell.level;
    cell.count = cell.level * (1 + Math.floor(Math.random() * 3));
    invented++;
  }
}
console.log(`invented ${invented} extra contribution day(s) out of ${cells.length}`);

const width = Math.max(0, ...cells.map((c) => c.x)) + 1;
const height = Math.max(0, ...cells.map((c) => c.y)) + 1;
const grid = createEmptyGrid(width, height);
for (const c of cells) if (c.level > 0) setColor(grid, c.x, c.y, c.level as any);

const chain = getBestRoute(grid, snake4)!;
chain.push(...getPathToPose(chain.slice(-1)[0], snake4)!);

// Same values snk's own CLI uses by default (the "github" light palette).
const drawOptions = {
  sizeDotBorderRadius: 2,
  sizeCell: 16,
  sizeDot: 12,
  colorBackground: "#ffffff",
  colorDotBorder: "#1b1f230a",
  colorDots: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  colorEmpty: "#ebedf0",
  colorSnake: "purple",
} as any;

const svg = createSvg(grid, cells, chain, drawOptions, { stepDurationMs: 100 });

await Bun.write(outSvg, svg);
console.log(`wrote ${outSvg}`);
