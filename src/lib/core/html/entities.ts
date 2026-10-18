/**
 * HTML character references: numeric ones (&#8217; &#x2019;) and the named
 * ones that actually turn up in titles, bylines and descriptions — all of
 * HTML 4 plus a handful of common HTML 5 additions. Unknown names are left
 * exactly as written, as browsers do.
 */

/** Latin-1 supplement, U+00A0 to U+00FF in order. */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute " +
  "micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig " +
  "Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash " +
  "Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc " +
  "euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml " +
  "yacute thorn yuml";

/** Greek capitals from U+0391 (U+03A2 is unassigned) and small letters from U+03B1. */
const GREEK_UPPER = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho _ Sigma Tau Upsilon Phi Chi Psi Omega";
const GREEK_LOWER = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega";

/** Everything else, by code point. */
const CODE_POINTS: Record<string, number> = {
  quot: 34, amp: 38, apos: 39, lt: 60, gt: 62, QUOT: 34, AMP: 38, LT: 60, GT: 62, COPY: 169, REG: 174,
  OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710, tilde: 732,
  thetasym: 977, upsih: 978, piv: 982,
  ensp: 8194, emsp: 8195, numsp: 8199, puncsp: 8200, thinsp: 8201, hairsp: 8202, ZeroWidthSpace: 8203,
  zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207, hyphen: 8208, dash: 8208, ndash: 8211, mdash: 8212, horbar: 8213,
  lsquo: 8216, rsquo: 8217, rsquor: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, rdquor: 8221, bdquo: 8222,
  dagger: 8224, Dagger: 8225, bull: 8226, bullet: 8226, nldr: 8229, hellip: 8230, mldr: 8230, permil: 8240,
  prime: 8242, Prime: 8243, lsaquo: 8249, rsaquo: 8250, oline: 8254, frasl: 8260, MediumSpace: 8287, euro: 8364,
  image: 8465, weierp: 8472, real: 8476, trade: 8482, alefsym: 8501,
  larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, crarr: 8629,
  lArr: 8656, uArr: 8657, rArr: 8658, dArr: 8659, hArr: 8660,
  forall: 8704, part: 8706, exist: 8707, empty: 8709, nabla: 8711, isin: 8712, notin: 8713, ni: 8715, prod: 8719,
  sum: 8721, minus: 8722, lowast: 8727, radic: 8730, prop: 8733, infin: 8734, ang: 8736, and: 8743, or: 8744,
  cap: 8745, cup: 8746, int: 8747, there4: 8756, sim: 8764, cong: 8773, asymp: 8776, ne: 8800, equiv: 8801,
  le: 8804, ge: 8805, sub: 8834, sup: 8835, nsub: 8836, sube: 8838, supe: 8839, oplus: 8853, otimes: 8855,
  perp: 8869, sdot: 8901, lceil: 8968, rceil: 8969, lfloor: 8970, rfloor: 8971, loz: 9674,
  spades: 9824, clubs: 9827, hearts: 9829, diams: 9830, starf: 9733, star: 9734, check: 10003, cross: 10007,
  lang: 10216, rang: 10217,
  Tab: 9, NewLine: 10, excl: 33, num: 35, dollar: 36, percnt: 37, lpar: 40, rpar: 41, ast: 42, plus: 43,
  comma: 44, period: 46, sol: 47, colon: 58, semi: 59, equals: 61, quest: 63, commat: 64, lsqb: 91, lbrack: 91,
  bsol: 92, rsqb: 93, rbrack: 93, Hat: 94, lowbar: 95, grave: 96, lcub: 123, lbrace: 123, verbar: 124, vert: 124,
  rcub: 125, rbrace: 125, NonBreakingSpace: 160, half: 189, centerdot: 183,
};

function buildNamed(): Map<string, string> {
  const named = new Map<string, string>();
  LATIN1.split(" ").forEach((name, index) => named.set(name, String.fromCharCode(0xa0 + index)));
  GREEK_UPPER.split(" ").forEach((name, index) => {
    if (name !== "_") named.set(name, String.fromCharCode(0x391 + index));
  });
  GREEK_LOWER.split(" ").forEach((name, index) => named.set(name, String.fromCharCode(0x3b1 + index)));
  for (const [name, code] of Object.entries(CODE_POINTS)) named.set(name, String.fromCodePoint(code));
  return named;
}

const NAMED = buildNamed();

/**
 * The few names browsers also decode without a trailing semicolon. In
 * attribute values they don't when the next character is alphanumeric or
 * "=", so "?a=1&copy=2" in a URL survives intact.
 */
const LEGACY = new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg", "AMP", "LT", "GT", "QUOT", "COPY", "REG"]);

/** What browsers show for &#128; to &#159;: the windows-1252 characters, not C1 controls. */
const WINDOWS_1252_C1 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function fromCodePoint(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "\ufffd";
  if (code >= 0x80 && code <= 0x9f) return String.fromCharCode(WINDOWS_1252_C1[code - 0x80] ?? code);
  return String.fromCodePoint(code);
}

function isLetter(code: number): boolean {
  const lower = code | 0x20;
  return lower >= 0x61 && lower <= 0x7a;
}

function isAlphanumeric(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || isLetter(code);
}

/** The value of a hex or decimal digit, or -1. */
function digitValue(code: number, hex: boolean): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  const lower = code | 0x20;
  return hex && lower >= 0x61 && lower <= 0x66 ? lower - 0x61 + 10 : -1;
}

/**
 * Decodes character references the way a browser shows them: numeric ones
 * (decimal or hex, with or without the semicolon; NUL, surrogates and code
 * points beyond U+10FFFF become U+FFFD) and named ones from the table above.
 * Anything unrecognised stays as written. One pass, never throws.
 */
export function decodeEntities(text: string): string {
  if (typeof text !== "string") return "";
  let amp = text.indexOf("&");
  if (amp === -1) return text;

  let result = "";
  let copied = 0;
  while (amp !== -1) {
    let value: string | undefined;
    let end = amp + 1;
    const next = text.charCodeAt(amp + 1);

    if (next === 0x23 /* # */) {
      const hex = (text.charCodeAt(amp + 2) | 0x20) === 0x78; // "x" or "X"
      let index = amp + (hex ? 3 : 2);
      const first = index;
      let code = 0;
      for (let digit = digitValue(text.charCodeAt(index), hex); digit !== -1; digit = digitValue(text.charCodeAt(index), hex)) {
        // Saturates past U+10FFFF instead of overflowing on absurdly long numbers.
        if (code <= 0x10ffff) code = code * (hex ? 16 : 10) + digit;
        index++;
      }
      if (index > first) {
        value = fromCodePoint(code);
        end = text.charCodeAt(index) === 0x3b ? index + 1 : index;
      }
    } else if (isLetter(next)) {
      let index = amp + 1;
      while (index - amp <= 32 && isAlphanumeric(text.charCodeAt(index))) index++;
      const name = text.slice(amp + 1, index);
      const after = text.charCodeAt(index);
      if (after === 0x3b /* ; */) {
        value = NAMED.get(name);
        end = index + 1;
      } else if (LEGACY.has(name) && after !== 0x3d /* = */ && !isAlphanumeric(after)) {
        value = NAMED.get(name);
        end = index;
      }
    }

    if (value !== undefined) {
      result += text.slice(copied, amp) + value;
      copied = end;
      amp = text.indexOf("&", end);
    } else {
      amp = text.indexOf("&", amp + 1);
    }
  }
  return result + text.slice(copied);
}
