/**
 * Which IP addresses the server may connect to on a user's behalf.
 *
 * Saved links are user input, so before the server fetches one it checks that
 * every address the host resolves to is an ordinary public address — never
 * loopback, a private or link-local network (where cloud metadata services
 * live), or a reserved range. IPv6 forms that carry an IPv4 address inside
 * them (mapped, compatible, NAT64, 6to4, Teredo) are judged by that IPv4
 * address, so ::ffff:127.0.0.1 is as private as 127.0.0.1.
 */

/** [first address, prefix length] for every IPv4 range that is not publicly routable. */
const NON_PUBLIC_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this network", including the unspecified address
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata services)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation (TEST-NET-1)
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation (TEST-NET-2)
  ["203.0.113.0", 24], // documentation (TEST-NET-3)
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including the broadcast address
];

const IPV4_RANGES = NON_PUBLIC_IPV4.map(([first, prefix]) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: parseIPv4(first)!, mask };
});

/**
 * True only for a syntactically valid IPv4 or IPv6 address that is publicly
 * routable. Anything unparseable is treated as not public. Accepts the
 * bracketed form URLs use for IPv6 hosts ("[2606:4700::1]").
 */
export function isPublicAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  const bracketed = address.startsWith("[") && address.endsWith("]");
  const text = bracketed ? address.slice(1, -1) : address;

  if (bracketed || text.includes(":")) {
    // A zone index ("fe80::1%eth0") only ever qualifies a non-global address.
    if (text.includes("%")) return false;
    const groups = parseIPv6(text);
    return groups !== null && isPublicIPv6(groups);
  }

  const value = parseIPv4(text);
  return value !== null && isPublicIPv4(value);
}

function isPublicIPv4(value: number): boolean {
  return !IPV4_RANGES.some(({ network, mask }) => ((value & mask) >>> 0) === network);
}

function isPublicIPv6(groups: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groups;
  const lastTwo = g * 0x10000 + h;

  // ::ffff:a.b.c.d (IPv4-mapped), including the hex spelling ::ffff:7f00:1.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return isPublicIPv4(lastTwo);
  // ::ffff:0:a.b.c.d (IPv4-translated).
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0xffff && f === 0) return isPublicIPv4(lastTwo);
  // ::a.b.c.d (IPv4-compatible, deprecated). Also covers :: (0.0.0.0) and ::1 (0.0.0.1).
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) return isPublicIPv4(lastTwo);
  // 64:ff9b::/96 (NAT64, well-known prefix).
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return isPublicIPv4(lastTwo);
  // 64:ff9b:1::/48 (NAT64, local use). Only the /96 layout is understood; anything else is refused.
  if (a === 0x64 && b === 0xff9b && c === 1) return d === 0 && e === 0 && f === 0 && isPublicIPv4(lastTwo);
  // 2002::/16 (6to4): the IPv4 address follows the prefix.
  if (a === 0x2002) return isPublicIPv4(b * 0x10000 + c);
  // 2001::/32 (Teredo): the server's IPv4 address, then the client's, bit-inverted.
  if (a === 0x2001 && b === 0) {
    return isPublicIPv4(c * 0x10000 + d) && isPublicIPv4((g ^ 0xffff) * 0x10000 + (h ^ 0xffff));
  }

  // Only global unicast (2000::/3) is routed on the public internet. This
  // excludes ::/128, ::1, 100::/64 (discard), fc00::/7 (unique local),
  // fe80::/10 (link-local), fec0::/10 (site-local), ff00::/8 (multicast) and
  // every other reserved block.
  if ((a & 0xe000) !== 0x2000) return false;
  // 2001::/23: IETF protocol assignments (benchmarking, ORCHID, …).
  if (a === 0x2001 && b < 0x0200) return false;
  // 2001:db8::/32 and 3fff::/20: documentation.
  if (a === 0x2001 && b === 0x0db8) return false;
  if (a === 0x3fff && b < 0x1000) return false;
  return true;
}

/** Strict dotted-quad IPv4 ("1.2.3.4"; no leading zeros, no shorthand) as an unsigned 32-bit number. */
function parseIPv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** IPv6 text (with optional "::" and dotted IPv4 tail) as eight 16-bit groups. */
function parseIPv6(text: string): number[] | null {
  if (!/^[0-9a-f:.]+$/i.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;

  if (halves.length === 1) {
    const groups = parseGroups(text, true);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseGroups(halves[0] ?? "", false);
  const tail = parseGroups(halves[1] ?? "", true);
  if (!head || !tail || head.length + tail.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

function parseGroups(part: string, allowIPv4Tail: boolean): number[] | null {
  if (part === "") return [];
  const pieces = part.split(":");
  const groups: number[] = [];
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index] ?? "";
    if (allowIPv4Tail && index === pieces.length - 1 && piece.includes(".")) {
      const value = parseIPv4(piece);
      if (value === null) return null;
      groups.push(Math.floor(value / 0x10000), value % 0x10000);
    } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
      groups.push(parseInt(piece, 16));
    } else {
      return null;
    }
  }
  return groups;
}
