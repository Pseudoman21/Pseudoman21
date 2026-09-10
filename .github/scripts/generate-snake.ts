// Generates the "snake eats your contributions" animation SVG.
//
// This is run from inside a checkout of https://github.com/Platane/snk
// (see .github/workflows/main.yml) so the @snk/* workspace packages, and
// the relative imports into packages/svg-creator below, resolve.
//
// Two things this does differently from the packaged snk action:
//
// 1. Real GitHub contribution data is fetched first, then empty days are
//    randomly (and optionally) padded with invented "contributions" so the
//    snake always has plenty to eat -- purely decorative, no effect on your
//    real GitHub profile / contribution graph. Days that already have real
//    contributions are never touched.
//
// 2. Unlike upstream (where the snake is always a fixed 4-segment body that
//    never changes size), this snake actually grows by one segment every
//    time it eats a dot -- classic Snake-game behaviour -- up to a cap.
//    svg-creator's own createSnake() assumes every frame has the same
//    body length, so growth needed a small rewrite (createGrowingSnake
//    below); createGrid/createStack (the dots + the little eaten-dot
//    stack) are reused unmodified from svg-creator.
import { getGithubUserContribution } from "@snk/github-user-contribution";
import { getBestRoute } from "@snk/solver/getBestRoute";
import { getPathToPose } from "@snk/solver/getPathToPose";
import { snake4 } from "@snk/types/__fixtures__/snake";
import {
  copyGrid,
  createEmptyGrid,
  getColor,
  isEmpty,
  isInside,
  setColor,
  setColorEmpty,
} from "@snk/types/grid";
import { getHeadX, getHeadY } from "@snk/types/snake";
import { createAnimation, minifyCss } from "./packages/svg-creator/css-utils";
import { createGrid } from "./packages/svg-creator/grid";
import { createStack } from "./packages/svg-creator/stack";
import { h } from "./packages/svg-creator/xml-utils";

const username = process.env.SNK_USERNAME;
const githubToken = process.env.GITHUB_TOKEN;
const outSvg = process.env.SNAKE_OUT_SVG ?? "dist/github-contribution-grid-snake.svg";

// 0 = only ever draw real contributions. 1 = fill in every empty day.
const fillProbability = Number(process.env.SNAKE_FILL_PROBABILITY ?? "0.4");

// Snake starts at this many segments and grows by one per dot eaten, up to
// this cap (a cap keeps the tail legible instead of turning into a blob).
const baseLength = 4;
const maxLength = Number(process.env.SNAKE_MAX_LENGTH ?? "20");

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

// -- growing snake ----------------------------------------------------

const lerp = (k: number, a: number, b: number) => (1 - k) * a + k * b;

const removeInterpolatedPositions = <T extends { x: number; y: number }>(arr: T[]) =>
  arr.filter((u, i, arr) => {
    if (i - 1 < 0 || i + 1 >= arr.length) return true;
    const a = arr[i - 1];
    const b = arr[i + 1];
    return !(Math.abs((a.x + b.x) / 2 - u.x) < 0.01 && Math.abs((a.y + b.y) / 2 - u.y) < 0.01);
  });

const createGrowingSnake = (
  chain: any[],
  grid: any,
  { colorSnake, sizeCell, sizeDot }: any,
  duration: number,
) => {
  const headTrail = chain.map((s) => ({ x: getHeadX(s), y: getHeadY(s) }));

  // Replay the exact same "landing on a colored cell eats it" rule
  // svg-creator uses for the dots, just to know how long the body should
  // be at every frame.
  const gridCopy = copyGrid(grid);
  const lengths: number[] = [];
  let eaten = 0;
  for (const { x, y } of headTrail) {
    if (isInside(gridCopy, x, y) && !isEmpty(getColor(gridCopy, x, y))) {
      setColorEmpty(gridCopy, x, y);
      eaten++;
    }
    lengths.push(Math.min(maxLength, baseLength + eaten));
  }

  const snakeN = Math.max(...lengths, baseLength);

  // Position history per body segment, one entry per frame. A segment
  // that hasn't "grown in" yet is parked on the current tail tip, so it
  // sits hidden underneath it until the frame it's born.
  const snakeParts: { x: number; y: number }[][] = Array.from({ length: snakeN }, () => []);
  for (let f = 0; f < chain.length; f++) {
    const len = lengths[f];
    for (let i = 0; i < snakeN; i++) {
      const src = i < len ? Math.max(0, f - i) : Math.max(0, f - len + 1);
      snakeParts[i].push(headTrail[src]);
    }
  }

  const svgElements = snakeParts.map((_, i) => {
    const dMin = sizeDot * 0.8;
    const dMax = sizeCell * 0.9;
    const iMax = Math.min(4, snakeN);
    const u = (1 - Math.min(i, iMax) / iMax) ** 2;
    const s = lerp(u, dMin, dMax);
    const m = (sizeCell - s) / 2;
    const r = Math.min(4.5, (4 * s) / sizeDot);
    return h("rect", {
      class: `s s${i}`,
      x: m.toFixed(1),
      y: m.toFixed(1),
      width: s.toFixed(1),
      height: s.toFixed(1),
      rx: r.toFixed(1),
      ry: r.toFixed(1),
    });
  });

  const transform = ({ x, y }: { x: number; y: number }) =>
    `transform:translate(${x * sizeCell}px,${y * sizeCell}px)`;

  const styles = [
    `.s{ shape-rendering: geometricPrecision; fill: var(--cs); animation: none linear ${duration}ms infinite }`,
    ...snakeParts
      .map((positions, i) => {
        const id = `s${i}`;
        const keyframes = removeInterpolatedPositions(
          positions.map((p, f) => ({ ...p, t: f / chain.length })),
        ).map(({ t, ...p }) => ({ t, style: transform(p) }));

        return [
          createAnimation(id, keyframes),
          `.s.${id}{ ${transform(positions[0])}; animation-name: ${id} }`,
        ];
      })
      .flat(),
  ];

  return { svgElements, styles };
};

// -- assemble the svg (mirrors @snk/svg-creator's createSvg, swapping in
//    createGrowingSnake instead of its fixed-length createSnake) --------

const animationOptions = { stepDurationMs: 100 };
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

const svgWidth = (grid.width + 2) * drawOptions.sizeCell;
const svgHeight = (grid.height + 5) * drawOptions.sizeCell;
const duration = animationOptions.stepDurationMs * chain.length;

const getCellsFromGrid = ({ width, height }: any) =>
  Array.from({ length: width }, (_, x) => Array.from({ length: height }, (_, y) => ({ x, y }))).flat();

const livingCells = (cells.length ? cells : getCellsFromGrid(grid)).map(({ x, y }: any) => ({
  x,
  y,
  t: null as number | null,
  color: getColor(grid, x, y),
}));
{
  const gridForEating = copyGrid(grid);
  for (let i = 0; i < chain.length; i++) {
    const x = getHeadX(chain[i]);
    const y = getHeadY(chain[i]);
    if (isInside(gridForEating, x, y) && !isEmpty(getColor(gridForEating, x, y))) {
      setColorEmpty(gridForEating, x, y);
      const cell = livingCells.find((c: any) => c.x === x && c.y === y)!;
      cell.t = i / chain.length;
    }
  }
}

const elements = [
  createGrid(livingCells, drawOptions, duration),
  createStack(livingCells, drawOptions, grid.width * drawOptions.sizeCell, (grid.height + 2) * drawOptions.sizeCell, duration),
  createGrowingSnake(chain, grid, drawOptions, duration),
];

const viewBox = [-drawOptions.sizeCell, -drawOptions.sizeCell * 2, svgWidth, svgHeight].join(" ");

const colorVars =
  `:root{--cb:${drawOptions.colorDotBorder};--cs:${drawOptions.colorSnake};--ce:${drawOptions.colorEmpty};` +
  drawOptions.colorDots.map((color: string, i: number) => `--c${i}:${color};`).join("") +
  `}`;

const style = colorVars + elements.map((e) => e.styles).flat().join("\n");

const svg = [
  h("svg", { viewBox, width: svgWidth, height: svgHeight, xmlns: "http://www.w3.org/2000/svg" }).replace("/>", ">"),
  "<desc>Generated with https://github.com/Platane/snk (grown by a custom script)</desc>",
  "<style>",
  minifyCss(style),
  "</style>",
  ...elements.map((e) => e.svgElements).flat(),
  "</svg>",
].join("");

await Bun.write(outSvg, svg);
console.log(`wrote ${outSvg} (snake grows up to ${maxLength} segments)`);
