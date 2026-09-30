// Credential-shaped text detector used by verify:automation on the build output,
// tracked files and its own captured command output. Reports kind and offset
// only, never the matched text.
const PATTERNS = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/],
  ['Cloudflare API token value', /\bcfut_[A-Za-z0-9]{20,}/],
  ['Cloudflare token assignment', /CLOUDFLARE_API_TOKEN\s*[:=]\s*['"]?(?!\$\{\{|\$\{?[A-Z_]+|<)[A-Za-z0-9_-]{20,}/],
  ['Bearer credential', /Bearer\s+(?!\$\{?[A-Za-z_]|<)[A-Za-z0-9._-]{30,}/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['OAuth refresh token', /\b(?:refresh_token|oauth_token)["']?\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i],
];
export function findSecrets(text) {
  const found = [];
  for (const [kind, pattern] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) found.push({ kind, offset: match.index });
  }
  return found;
}
