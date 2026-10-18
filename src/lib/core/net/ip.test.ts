import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isPublicAddress } from "./ip";

function expectAll(addresses: string[], expected: boolean) {
  for (const address of addresses) {
    assert.equal(isPublicAddress(address), expected, `isPublicAddress(${JSON.stringify(address)})`);
  }
}

describe("isPublicAddress: IPv4", () => {
  it("accepts ordinary public addresses, including the edges of blocked ranges", () => {
    expectAll(
      [
        "8.8.8.8",
        "1.1.1.1",
        "93.184.216.34",
        "1.0.0.0",
        "9.255.255.255",
        "11.0.0.0",
        "100.63.255.255",
        "100.128.0.0",
        "126.255.255.255",
        "128.0.0.0",
        "169.253.255.255",
        "169.255.0.0",
        "172.15.255.255",
        "172.32.0.0",
        "191.255.255.255",
        "192.0.1.0",
        "192.0.3.0",
        "192.88.98.255",
        "192.88.100.0",
        "192.167.255.255",
        "192.169.0.0",
        "198.17.255.255",
        "198.20.0.0",
        "198.51.99.255",
        "198.51.101.0",
        "203.0.112.255",
        "203.0.114.0",
        "223.255.255.255",
      ],
      true,
    );
  });

  it("rejects unspecified, loopback, private, shared and link-local addresses", () => {
    expectAll(
      [
        "0.0.0.0",
        "0.1.2.3",
        "0.255.255.255",
        "127.0.0.1",
        "127.0.1.1",
        "127.255.255.255",
        "10.0.0.0",
        "10.0.0.5",
        "10.255.255.255",
        "172.16.0.0",
        "172.20.1.1",
        "172.31.255.255",
        "192.168.0.0",
        "192.168.1.1",
        "192.168.255.255",
        "100.64.0.0",
        "100.100.100.200",
        "100.127.255.255",
        "169.254.0.0",
        "169.254.169.254",
        "169.254.255.255",
      ],
      false,
    );
  });

  it("rejects special-purpose, documentation, benchmarking, multicast and reserved ranges", () => {
    expectAll(
      [
        "192.0.0.0",
        "192.0.0.8",
        "192.0.0.170",
        "192.0.0.255",
        "192.0.2.0",
        "192.0.2.123",
        "192.88.99.1",
        "198.18.0.0",
        "198.19.255.255",
        "198.51.100.7",
        "203.0.113.9",
        "224.0.0.1",
        "239.255.255.250",
        "240.0.0.1",
        "250.1.2.3",
        "255.255.255.254",
        "255.255.255.255",
      ],
      false,
    );
  });
});

describe("isPublicAddress: IPv6", () => {
  it("accepts global unicast addresses", () => {
    expectAll(
      [
        "2606:4700:4700::1111",
        "2001:4860:4860::8888",
        "2a00:1450:4001:80b::200e",
        "2606:4700:0:0:0:0:0:1111",
        "2606:4700::1.2.3.4",
        "2001:200::1",
        "2001:db9::1",
        "2001:da8::1",
        "3fff:1000::1",
        "[2606:4700::1]",
        "2001:4860:4860:0000:0000:0000:0000:8888",
      ],
      true,
    );
  });

  it("rejects unspecified, loopback, unique-local, link-local, site-local and multicast", () => {
    expectAll(
      [
        "::",
        "::1",
        "[::1]",
        "0:0:0:0:0:0:0:1",
        "0000:0000:0000:0000:0000:0000:0000:0000",
        "fc00::",
        "fc00::1",
        "fd12:3456:789a::1",
        "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
        "fe80::",
        "fe80::1",
        "FE80::1",
        "fe80::1%eth0",
        "fe80::1%25en0",
        "febf:ffff::1",
        "fec0::1",
        "feff::1",
        "ff00::",
        "ff02::1",
        "ff05::1:3",
        "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      ],
      false,
    );
  });

  it("rejects documentation, discard, protocol-assignment and unallocated space", () => {
    expectAll(
      [
        "2001:db8::",
        "2001:db8::1",
        "2001:0db8:85a3::8a2e:370:7334",
        "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
        "3fff::1",
        "3fff:fff:ffff::1",
        "100::",
        "100::1",
        "100::ffff:ffff:ffff:ffff",
        "2001:2::1",
        "2001:10::1",
        "2001:20::1",
        "2001:1ff:ffff::1",
        "5f00::1",
        "4000::1",
        "1::",
        "1:2:3:4:5:6:7::",
        "1:2:3:4:5:6:1.2.3.4",
      ],
      false,
    );
  });

  it("judges IPv4-mapped and IPv4-translated addresses by the IPv4 inside", () => {
    expectAll(["::ffff:8.8.8.8", "::ffff:808:808", "::FFFF:0808:0808", "::ffff:0:8.8.8.8", "[::ffff:1.1.1.1]"], true);
    expectAll(
      [
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "::FFFF:7F00:0001",
        "0:0:0:0:0:ffff:7f00:1",
        "::ffff:10.0.0.5",
        "::ffff:a00:5",
        "::ffff:169.254.169.254",
        "::ffff:a9fe:a9fe",
        "::ffff:192.168.0.1",
        "::ffff:0.0.0.0",
        "::ffff:255.255.255.255",
        "::ffff:0:127.0.0.1",
        "::ffff:0:a00:1",
        "[::ffff:127.0.0.1]",
      ],
      false,
    );
  });

  it("judges IPv4-compatible addresses by the IPv4 inside", () => {
    expectAll(["::8.8.8.8", "::808:808"], true);
    expectAll(["::127.0.0.1", "::7f00:1", "::10.0.0.1", "::2", "::0.0.0.1", "::169.254.169.254"], false);
  });

  it("judges NAT64 addresses by the IPv4 inside", () => {
    expectAll(["64:ff9b::8.8.8.8", "64:ff9b::808:808", "64:ff9b:1::8.8.8.8", "64:ff9b:1::808:808"], true);
    expectAll(
      [
        "64:ff9b::127.0.0.1",
        "64:ff9b::7f00:1",
        "64:ff9b::a00:1",
        "64:ff9b::169.254.169.254",
        "64:ff9b::",
        "64:ff9b:1::10.0.0.1",
        "64:ff9b:1::c0a8:1",
        // Local-use NAT64 with an embedding other than /96 isn't understood, so it's refused.
        "64:ff9b:1:808:8:800::",
        "64:ff9b:1:1::8.8.8.8",
      ],
      false,
    );
  });

  it("judges 6to4 addresses by the IPv4 inside", () => {
    expectAll(["2002:808:808::1", "2002:0808:0808:1234::5678"], true);
    expectAll(["2002:7f00:1::1", "2002:a00:5::", "2002:c0a8:101::1", "2002:a9fe:a9fe::1", "2002::1", "2002:e000:1::"], false);
  });

  it("judges Teredo addresses by both the server and the (inverted) client IPv4", () => {
    // Server 65.54.227.120, client 8.8.8.8 (stored inverted as f7f7:f7f7).
    expectAll(["2001:0:4136:e378:8000:63bf:f7f7:f7f7", "2001::4136:e378:8000:63bf:f7f7:f7f7"], true);
    expectAll(
      [
        // Client 10.0.0.1 (f5ff:fffe), 127.0.0.1 (80ff:fffe), 192.168.1.1 (3f57:fefe).
        "2001:0:4136:e378:8000:63bf:f5ff:fffe",
        "2001:0:4136:e378:8000:63bf:80ff:fffe",
        "2001:0:4136:e378:8000:63bf:3f57:fefe",
        // Server 127.0.0.1 or 10.0.0.1.
        "2001:0:7f00:1:8000:63bf:f7f7:f7f7",
        "2001:0:a00:1:8000:63bf:f7f7:f7f7",
        "2001::",
        "2001::1",
      ],
      false,
    );
  });
});

describe("isPublicAddress: invalid input", () => {
  it("treats anything that isn't an IP address as not public", () => {
    expectAll(
      [
        "",
        "localhost",
        "example.com",
        "8.8.8.8.nip.io",
        "1.2.3",
        "1.2.3.4.5",
        "256.1.1.1",
        "1.2.3.256",
        "01.2.3.4",
        "8.8.8.08",
        "0x8.8.8.8",
        "0x7f.0.0.1",
        "127.1",
        "2130706433",
        "1.2.3.-4",
        "1..2.3",
        " 8.8.8.8",
        "8.8.8.8 ",
        "8.8.8.8/32",
        "8.8.8.8:80",
        "[8.8.8.8]",
        "1:2:3:4:5:6:7:8:9",
        "1:2:3:4:5:6:7",
        "2606:4700::1::1",
        ":::",
        ":1:2:3:4:5:6:7",
        "1:2:3:4:5:6:7:",
        "12345::",
        "g::1",
        "2606:4700::1/64",
        "1:2:3:4:5:6:7:8::",
        "::ffff:1.2.3",
        "::ffff:256.0.0.1",
        "::ffff:01.2.3.4",
        "1.2.3.4::",
        "::1.2.3.4:5",
        "[2606:4700::1",
        "2606:4700::1]",
        "[[2606:4700::1]]",
      ],
      false,
    );
  });

  it("returns false for non-string input instead of throwing", () => {
    for (const value of [null, undefined, 8, {}, ["8.8.8.8"]]) {
      assert.equal(isPublicAddress(value as unknown as string), false);
    }
  });
});
