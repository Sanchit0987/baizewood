import { BALL } from '../config/table';
import { ballColour } from '../config/ballcolours';
import { el } from './dom';

/** A small CSS ball: solid colour, or white with a colour band for stripes, with its number. */
export function ballIcon(id: number, dim = false): HTMLElement {
  const node = el('span.ball', el('i', String(id)));
  node.style.setProperty('--c', ballColour(id));
  if (id > BALL.eight) node.classList.add('stripe');
  if (dim) node.classList.add('dim');
  node.setAttribute('aria-label', `${id} ball${dim ? ', pocketed' : ''}`);
  return node;
}

const SVG = 'http://www.w3.org/2000/svg';

/** The mark: a lamp shade over a ball. */
export function logoMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.innerHTML = `
    <defs><radialGradient id="bw-glow" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient></defs>
    <path d="M32 2v8" stroke="#c9a253" stroke-width="2.5"/>
    <path d="M12 26c2-10 10-16 20-16s18 6 20 16z" fill="#17463b" stroke="#c9a253" stroke-width="2"/>
    <path d="M14 26h36L62 62H2z" fill="url(#bw-glow)"/>
    <circle cx="32" cy="46" r="13" fill="#111"/><circle cx="32" cy="43" r="6" fill="#f4efe2"/>
    <text x="32" y="46.4" font-size="8.5" font-weight="800" text-anchor="middle" fill="#111" font-family="Arial">8</text>`;
  return svg;
}
