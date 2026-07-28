// The `pulumi env open --format detailed` output only marks which values are
// secret from this CLI version onward. Older CLIs must fall back to the dotenv
// format, which carries no secret markers.
export const DETAILED_FORMAT_MIN_VERSION = '3.255.0';

// Compare two dot-separated version strings numerically, ignoring any leading
// `v` and any prerelease/build suffix (e.g. `3.255.0-alpha.1` compares equal to
// `3.255.0`). Returns a negative number if a < b, 0 if equal, positive if a > b.
export function compareVersions(a: string, b: string): number {
    const parts = (v: string) =>
        v.trim().replace(/^v/, '').split(/[-+]/, 1)[0].split('.').map(p => Number(p) || 0);

    const pa = parts(a);
    const pb = parts(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

// Whether the given Pulumi CLI version supports the secret markers we rely on
// in the detailed format. Unparseable versions sort below every release and so
// take the legacy path, which masks every value.
export function supportsDetailedFormat(version: string): boolean {
    return compareVersions(version, DETAILED_FORMAT_MIN_VERSION) >= 0;
}
