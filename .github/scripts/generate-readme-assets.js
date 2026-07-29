const { mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');

const username = process.env.GITHUB_PROFILE_USERNAME || 'D162005';
const token = process.env.GITHUB_TOKEN || '';
const ownerRepo = process.env.GITHUB_REPOSITORY || 'D162005/D162005';

const outDir = join(process.cwd(), 'dist', 'assets');
mkdirSync(outDir, { recursive: true });

const headers = {
  'User-Agent': 'readme-assets-generator',
  Accept: 'application/vnd.github+json',
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}

async function githubGet(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API failed for ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function githubGetAll(path) {
  const items = [];
  let page = 1;

  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const chunk = await githubGet(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    items.push(...chunk);
    if (chunk.length < 100) {
      break;
    }

    page += 1;
  }

  return items;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function truncate(value, limit) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function svgShell(width, height, title, subtitle, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0b1220" />
      <stop offset="100%" stop-color="#0f1729" />
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.35" />
    </filter>
  </defs>
  <rect width="100%" height="100%" rx="24" fill="url(#bg)" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="#111827" stroke="rgba(148,163,184,0.16)" filter="url(#shadow)" />
  <rect x="48" y="42" width="120" height="4" rx="2" fill="url(#accent)" />
  <text x="48" y="78" fill="#e5eef7" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="28" font-weight="700">${escapeXml(title)}</text>
  <text x="48" y="108" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14">${escapeXml(subtitle)}</text>
  ${body}
</svg>`;
}

function cardLabel(x, y, label, value, color = '#7dd3fc') {
  return `
    <text x="${x}" y="${y}" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="12" letter-spacing="0.04em">${escapeXml(label.toUpperCase())}</text>
    <text x="${x}" y="${y + 40}" fill="${color}" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="28" font-weight="700">${escapeXml(value)}</text>`;
}

async function build() {
  const user = await githubGet(`/users/${username}`);
  const repos = await githubGetAll(`/users/${username}/repos?type=owner&sort=pushed`);
  const publicRepos = repos.filter((repo) => !repo.fork && !repo.archived);

  const repoDetails = publicRepos.length > 0 ? publicRepos : repos;
  const languageTotals = new Map();

  for (const repo of repoDetails) {
    if (!repo.languages_url) {
      continue;
    }

    try {
      const languages = await githubGet(repo.languages_url.replace('https://api.github.com', ''));
      for (const [language, bytes] of Object.entries(languages)) {
        languageTotals.set(language, (languageTotals.get(language) || 0) + bytes);
      }
    } catch {
      // Skip a repo if its language endpoint fails; the rest of the card still renders.
    }
  }

  const sortedLanguages = [...languageTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totalLanguageBytes = sortedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);

  const totalStars = publicRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = publicRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const topRepo = [...publicRepos].sort((a, b) => {
    if (b.stargazers_count !== a.stargazers_count) {
      return b.stargazers_count - a.stargazers_count;
    }
    if (b.forks_count !== a.forks_count) {
      return b.forks_count - a.forks_count;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0];

  const statsSvg = svgShell(
    960,
    280,
    'GitHub Stats',
    `${ownerRepo} profile snapshot`,
    `
      ${cardLabel(58, 152, 'Public repos', formatNumber(user.public_repos || 0))}
      ${cardLabel(288, 152, 'Followers', formatNumber(user.followers || 0), '#a78bfa')}
      ${cardLabel(518, 152, 'Stars', formatNumber(totalStars || 0), '#34d399')}
      ${cardLabel(748, 152, 'Forks', formatNumber(totalForks || 0), '#fbbf24')}
    `
  );

  const languageRows = sortedLanguages.slice(0, 5);
  const languageBody = languageRows.length > 0
    ? languageRows.map(([language, bytes], index) => {
      const y = 152 + index * 36;
      const percent = totalLanguageBytes === 0 ? 0 : Math.round((bytes / totalLanguageBytes) * 100);
      const barWidth = Math.max(8, Math.round((bytes / totalLanguageBytes) * 580));
      const colors = ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#fb7185'];
      return `
        <text x="58" y="${y}" fill="#e5eef7" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18" font-weight="600">${escapeXml(language)}</text>
        <text x="318" y="${y}" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14">${percent}%</text>
        <rect x="58" y="${y + 10}" width="580" height="10" rx="5" fill="#1f2937" />
        <rect x="58" y="${y + 10}" width="${barWidth}" height="10" rx="5" fill="${colors[index % colors.length]}" />
        <text x="652" y="${y + 20}" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="12">${formatNumber(bytes)} bytes</text>`;
    }).join('')
    : `<text x="58" y="166" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18">No language data yet.</text>`;

  const languagesSvg = svgShell(
    960,
    280,
    'Top Languages',
    `${ownerRepo} language usage`,
    languageBody
  );

  const trophySvg = svgShell(
    960,
    280,
    'GitHub Trophies',
    'Professional profile highlights',
    `
      ${cardLabel(58, 152, 'Trophies earned', totalStars > 0 ? formatNumber(Math.min(totalStars, 12)) : '0', totalStars > 0 ? '#fbbf24' : '#94a3b8')}
      ${cardLabel(318, 152, 'Most starred repo', topRepo ? formatNumber(topRepo.stargazers_count) : 'Not achieved yet', topRepo ? '#34d399' : '#94a3b8')}
      ${cardLabel(618, 152, 'Followers', formatNumber(user.followers || 0), '#38bdf8')}
      <text x="58" y="228" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">If a metric is still zero, it is shown as 0 instead of hiding the result.</text>
    `
  );

  const featuredRepo = topRepo || publicRepos[0];
  const repoSvg = svgShell(
    960,
    280,
    'Top Contributed Repo',
    'Featured public repository',
    featuredRepo
      ? `
          <text x="58" y="152" fill="#e5eef7" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(truncate(featuredRepo.name, 30))}</text>
          <text x="58" y="184" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="15">${escapeXml(truncate(featuredRepo.description || 'No description provided.', 72))}</text>
          <text x="58" y="224" fill="#34d399" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14" font-weight="600">${formatNumber(featuredRepo.stargazers_count || 0)} stars</text>
          <text x="188" y="224" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14">${escapeXml((featuredRepo.language || 'Unknown'))}</text>
          <text x="320" y="224" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14">Updated ${new Date(featuredRepo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</text>
        `
      : `<text x="58" y="166" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18">Not achieved yet.</text>`
  );

  writeFileSync(join(outDir, 'github-stats.svg'), statsSvg);
  writeFileSync(join(outDir, 'top-languages.svg'), languagesSvg);
  writeFileSync(join(outDir, 'github-trophies.svg'), trophySvg);
  writeFileSync(join(outDir, 'top-contributed-repo.svg'), repoSvg);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});