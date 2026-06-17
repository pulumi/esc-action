// Selective masking of injected ESC values.
//
// By default the action registers every injected value as a masked secret
// (`mask: all`). The GitHub runner then masks every *substring* match of each
// registered value across the run logs and `$GITHUB_STEP_SUMMARY`, so plaintext
// config that ESC also exports gets masked too -- making logs unreadable and
// redacting unrelated text. `mask: secrets` restricts masking to values that
// come from encrypted/secret ESC sources.
//
// `pulumi env open --format dotenv` (used for the actual values + materialized
// files) carries no secret-vs-plaintext signal. `pulumi env open --format detailed` encodes
// the full `esc.Value` tree where every node is
// `{ "value": <data|nested>, "secret"?: true, "trace": {...} }`, so it is the
// reliable source for which keys are secret.

export type MaskMode = 'all' | 'secrets';

// Parse the `mask` input. Empty/unset defaults to 'all' (today's behavior, so
// the env-var fallback keeps working -- see action.yml). Anything other than
// the two documented values is rejected rather than silently treated as a mode.
export function parseMaskMode(raw: string | undefined): MaskMode {
    const val = (raw ?? '').trim();
    if (val === '' || val === 'all') {
        return 'all';
    }
    if (val === 'secrets') {
        return 'secrets';
    }
    throw new Error(`Invalid value for 'mask': '${raw}'. Must be 'all' or 'secrets'.`);
}

// A node in `pulumi env open --format detailed` output. The `value` field holds the
// resolved data (a scalar, an array of nodes, or an object mapping keys to
// nodes), and `secret` is true when the node resolved from a secret source.
interface DetailedNode {
    value?: unknown;
    secret?: boolean;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// A detailed node represents a secret if it -- or any nested node beneath it --
// is marked secret. Environment-variable and file values are scalars in
// practice, so this is usually just a flag check; the recursion is defensive.
function nodeContainsSecret(node: unknown): boolean {
    if (!isObject(node)) {
        return false;
    }
    const detailed = node as DetailedNode;
    if (detailed.secret === true) {
        return true;
    }
    const inner = detailed.value;
    if (Array.isArray(inner)) {
        return inner.some(nodeContainsSecret);
    }
    if (isObject(inner)) {
        return Object.values(inner).some(nodeContainsSecret);
    }
    return false;
}

// Given the stdout of `pulumi env open --format detailed`, return the set of keys --
// across `environmentVariables` and `files`, the two sections that become env
// vars -- whose value came from a secret source. Throws if the output is not
// valid JSON (the caller fails the action rather than risk leaking secrets);
// tolerates missing sections by returning what it can.
export function collectSecretKeys(detailedStdout: string): Set<string> {
    const keys = new Set<string>();

    let root: unknown;
    try {
        root = JSON.parse(detailedStdout);
    } catch {
        throw new Error('Could not parse `pulumi env open --format detailed` output as JSON.');
    }

    const top = isObject(root) ? root.value : undefined;
    if (!isObject(top)) {
        return keys;
    }

    for (const section of ['environmentVariables', 'files']) {
        const sectionNode = top[section];
        const entries = isObject(sectionNode) ? sectionNode.value : undefined;
        if (!isObject(entries)) {
            continue;
        }
        for (const [key, node] of Object.entries(entries)) {
            if (nodeContainsSecret(node)) {
                keys.add(key);
            }
        }
    }

    return keys;
}
