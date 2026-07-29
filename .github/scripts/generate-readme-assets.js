const { mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');

const username = process.env.GITHUB_PROFILE_USERNAME || 'D162005';
const leetcodeUsername = process.env.LEETCODE_USERNAME || 'D_16';
const token = process.env.GITHUB_TOKEN || '';
const ownerRepo = process.env.GITHUB_REPOSITORY || 'D162005/D162005';

const outDir = join(process.cwd(), 'dist', 'assets');
mkdirSync(outDir, { recursive: true });

const githubHeaders = {
  'User-Agent': 'readme-assets-generator',
  Accept: 'application/vnd.github+json',
};

if (token) {
  githubHeaders.Authorization = `Bearer ${token}`;
}

async function githubGet(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: githubHeaders });
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

async function getLeetCodeStats(name) {
  const query = `
    query userProfile($username: String!) {
      matchedUser(username: $username) {
        profile {
          ranking
          reputation
          starRating
        }
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: `https://leetcode.com/${name}/`,
      },
      body: JSON.stringify({ query, variables: { username: name } }),
    });

    if (!response.ok) {
      throw new Error(`LeetCode request failed: ${response.status}`);
    }

    const json = await response.json();
    const user = json?.data?.matchedUser;
    const list = user?.submitStatsGlobal?.acSubmissionNum || [];
    const byDifficulty = new Map(list.map((entry) => [entry.difficulty, entry.count]));

    return {
      total: byDifficulty.get('All') || 0,
      easy: byDifficulty.get('Easy') || 0,
      medium: byDifficulty.get('Medium') || 0,
      hard: byDifficulty.get('Hard') || 0,
      ranking: user?.profile?.ranking || 0,
      reputation: user?.profile?.reputation || 0,
    };
  } catch {
    return {
      total: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      ranking: 0,
      reputation: 0,
    };
  }
}

async function getContributionStats(name) {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1).toISOString();
  const to = now.toISOString();
  const query = `
    query userContributions($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
          }
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;

  const parseContributionTotal = async () => {
    const response = await fetch(`https://github.com/users/${name}/contributions`, {
      headers: {
        'User-Agent': 'readme-assets-generator',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub contributions page failed: ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/([\d,]+) contributions in the last year/i);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        ...githubHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { login: name, from, to } }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL failed: ${response.status}`);
    }

    const json = await response.json();
    const data = json?.data?.user?.contributionsCollection;
    const pageTotal = await parseContributionTotal().catch(() => 0);
    const totalContributions = data?.contributionCalendar?.totalContributions || pageTotal || 0;

    return {
      total: totalContributions,
      commits: data?.totalCommitContributions || 0,
      issues: data?.totalIssueContributions || 0,
      prs: data?.totalPullRequestContributions || 0,
      reviews: data?.totalPullRequestReviewContributions || 0,
    };
  } catch {
    const pageTotal = await parseContributionTotal().catch(() => 0);
    return {
      total: pageTotal,
      commits: pageTotal,
      issues: 0,
      prs: 0,
      reviews: 0,
    };
  }
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
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function truncate(value, limit) {
  if (!value) {
    return '';
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function percentOf(value, max) {
  if (!max || max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function ringProgress(cx, cy, radius, percent, valueText, labelText, id) {
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="12" />
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="url(#${id})" stroke-width="12" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="${dash} ${circumference}" />
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="34" font-weight="700">${escapeXml(valueText)}</text>
      <text x="${cx}" y="${cy + radius + 28}" text-anchor="middle" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="12" letter-spacing="0.06em">${escapeXml(labelText.toUpperCase())}</text>
    </g>`;
}

function shell(title, subtitle, body, height = 330) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#07101f" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="accentA" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="accentB" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#ef4444" />
    </linearGradient>
    <linearGradient id="accentC" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#a78bfa" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <filter id="soft">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.35" />
    </filter>
  </defs>
  <rect width="100%" height="100%" rx="24" fill="url(#bg)" />
  <rect x="20" y="20" width="920" height="${height - 40}" rx="22" fill="#101b2f" stroke="rgba(148,163,184,0.25)" filter="url(#soft)" />
  <rect x="46" y="46" width="132" height="4" rx="2" fill="url(#accentA)" />
  <text x="46" y="84" fill="#f8fafc" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="30" font-weight="700">${escapeXml(title)}</text>
  <text x="46" y="112" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14">${escapeXml(subtitle)}</text>
  ${body}
</svg>`;
}

function buildStatsSvg(context) {
  const { user, publicRepos, totalStars, totalForks } = context;
  const maxValue = Math.max(user.public_repos || 0, user.followers || 0, totalStars || 0, totalForks || 0, 1);
  const body = `
    ${ringProgress(160, 214, 62, percentOf(user.public_repos || 0, maxValue), formatNumber(user.public_repos || 0), 'Public Repos', 'accentA')}
    ${ringProgress(390, 214, 62, percentOf(user.followers || 0, maxValue), formatNumber(user.followers || 0), 'Followers', 'accentC')}
    ${ringProgress(620, 214, 62, percentOf(totalStars || 0, maxValue), formatNumber(totalStars || 0), 'Total Stars', 'accentA')}
    ${ringProgress(850, 214, 62, percentOf(totalForks || 0, maxValue), formatNumber(totalForks || 0), 'Total Forks', 'accentB')}
  `;
  return shell('GitHub Snapshot', `${ownerRepo} key metrics`, body, 340);
}

function buildLanguagesSvg(context) {
  const sortedLanguages = context.sortedLanguages.slice(0, 6);
  const totalLanguageBytes = context.totalLanguageBytes;
  const rows = sortedLanguages.length > 0
    ? sortedLanguages.map(([language, bytes], index) => {
      const rowY = 188 + index * 30;
      const barWidth = Math.max(14, Math.round((bytes / Math.max(totalLanguageBytes, 1)) * 500));
      const pct = percentOf(bytes, Math.max(totalLanguageBytes, 1));
      const colors = ['#22d3ee', '#34d399', '#a78bfa', '#f59e0b', '#fb7185', '#60a5fa'];
      return `
      <g>
        <circle cx="64" cy="${rowY - 5}" r="8" fill="${colors[index % colors.length]}" />
        <text x="84" y="${rowY}" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(language)}</text>
        <rect x="250" y="${rowY - 14}" width="500" height="12" rx="6" fill="rgba(148,163,184,0.22)"/>
        <rect x="250" y="${rowY - 14}" width="${barWidth}" height="12" rx="6" fill="${colors[index % colors.length]}"/>
        <text x="770" y="${rowY}" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${pct}%</text>
      </g>`;
    }).join('')
    : '<text x="46" y="176" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18">No language data available.</text>';

  const body = `
    <text x="46" y="148" fill="#34d399" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="0.08em">LANGUAGE DISTRIBUTION</text>
    ${rows}
  `;

  return shell('Top Languages Spotlight', 'Most used languages across your repositories', body, 380);
}

function buildTrophiesSvg(context) {
  const { user, totalStars, totalForks, topRepo } = context;
  const trophyScore = Math.max(0, Math.min(100, (totalStars * 12) + (totalForks * 4) + (user.followers || 0)));
  const bestRepoStars = topRepo ? topRepo.stargazers_count || 0 : 0;
  const maxValue = Math.max(trophyScore, bestRepoStars, user.followers || 0, 1);

  const body = `
    ${ringProgress(220, 206, 66, percentOf(trophyScore, maxValue), formatNumber(trophyScore), 'Achievement Score', 'accentB')}
    ${ringProgress(480, 206, 66, percentOf(bestRepoStars, maxValue), formatNumber(bestRepoStars), 'Best Repo Stars', 'accentA')}
    ${ringProgress(740, 206, 66, percentOf(user.followers || 0, maxValue), formatNumber(user.followers || 0), 'Followers', 'accentC')}
    <text x="46" y="324" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">If any value is zero, it is shown as 0 (not hidden).</text>
  `;

  return shell('GitHub Tropies', 'Professional profile highlights in a circular layout', body, 360);
}

function buildRepoSvg(context) {
  const topTwo = context.rankableRepos.slice(0, 2);
  const cards = [0, 1].map((index) => {
    const repo = topTwo[index];
    const x = 46 + (index * 438);
    if (!repo) {
      return `
      <g>
        <rect x="${x}" y="138" width="412" height="142" rx="16" fill="#0d1628" stroke="rgba(148,163,184,0.25)" />
        <text x="${x + 20}" y="186" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="16">Not achieved yet.</text>
      </g>`;
    }

    return `
    <a href="${escapeXml(repo.html_url)}" target="_blank" rel="noopener noreferrer">
      <g style="cursor:pointer;">
        <rect x="${x}" y="138" width="412" height="142" rx="16" fill="#0d1628" stroke="rgba(148,163,184,0.25)" />
        <text x="${x + 20}" y="172" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="22" font-weight="700">${escapeXml(truncate(repo.name, 24))}</text>
        <text x="${x + 20}" y="198" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${escapeXml(truncate(repo.description || 'No description provided.', 48))}</text>
        <text x="${x + 20}" y="232" fill="#34d399" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13" font-weight="700">${formatNumber(repo.stargazers_count || 0)} stars</text>
        <text x="${x + 128}" y="232" fill="#60a5fa" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${escapeXml(repo.language || 'Unknown')}</text>
        <text x="${x + 250}" y="232" fill="#94a3b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${new Date(repo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</text>
      </g>
    </a>`;
  }).join('');

  return shell('Top Contribution Repositories', 'Two compact featured repositories', cards, 320);
}

function buildContributionScoreSvg(stats) {
  const total = stats.total || 0;
  const commits = stats.commits || 0;
  const issues = stats.issues || 0;
  const prs = stats.prs || 0;
  const reviews = stats.reviews || 0;
  const score = total + commits + issues + prs + reviews;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="56" viewBox="0 0 960 56" role="img" aria-label="Contribution Score Line">
  <text x="46" y="35" fill="#22d3ee" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18" font-weight="800">Contribution Score</text>
  <text x="229" y="35" fill="#f8fafc" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18" font-weight="800">${formatNumber(total)}</text>
  <text x="248" y="35" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18" font-weight="500">commits</text>
</svg>`;
}

function buildLeetCodeSvg(stats) {
  const total = stats.total || 0;
  const easy = stats.easy || 0;
  const medium = stats.medium || 0;
  const hard = stats.hard || 0;
  const goal = Math.max(300, total + 20);
  const completion = percentOf(total, goal);

  const body = `
    ${ringProgress(180, 214, 70, completion, formatNumber(total), 'Solved', 'accentB')}
    <g>
      <text x="330" y="170" fill="#34d399" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13" font-weight="700">EASY</text>
      <rect x="330" y="178" width="520" height="12" rx="6" fill="rgba(148,163,184,0.2)"/>
      <rect x="330" y="178" width="${Math.max(8, percentOf(easy, Math.max(total, 1)) * 5.2)}" height="12" rx="6" fill="#34d399"/>
      <text x="860" y="188" text-anchor="end" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${formatNumber(easy)}</text>

      <text x="330" y="220" fill="#fbbf24" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13" font-weight="700">MEDIUM</text>
      <rect x="330" y="228" width="520" height="12" rx="6" fill="rgba(148,163,184,0.2)"/>
      <rect x="330" y="228" width="${Math.max(8, percentOf(medium, Math.max(total, 1)) * 5.2)}" height="12" rx="6" fill="#fbbf24"/>
      <text x="860" y="238" text-anchor="end" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${formatNumber(medium)}</text>

      <text x="330" y="270" fill="#f87171" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13" font-weight="700">HARD</text>
      <rect x="330" y="278" width="520" height="12" rx="6" fill="rgba(148,163,184,0.2)"/>
      <rect x="330" y="278" width="${Math.max(8, percentOf(hard, Math.max(total, 1)) * 5.2)}" height="12" rx="6" fill="#f87171"/>
      <text x="860" y="288" text-anchor="end" fill="#e2e8f0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">${formatNumber(hard)}</text>
    </g>
    <text x="46" y="312" fill="#8aa0b8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="13">Ranking: ${stats.ranking ? formatNumber(stats.ranking) : 'Not available'} | Reputation: ${stats.reputation ? formatNumber(stats.reputation) : 'Not available'}</text>
  `;

  return shell('LeetCode Progress', `${leetcodeUsername} challenge overview`, body, 350);
}

async function build() {
  const user = await githubGet(`/users/${username}`);
  const repos = await githubGetAll(`/users/${username}/repos?type=owner&sort=pushed`);
  const publicRepos = repos.filter((repo) => !repo.fork && !repo.archived);
  const sourceRepos = publicRepos.length > 0 ? publicRepos : repos;

  const languageTotals = new Map();
  for (const repo of sourceRepos) {
    if (!repo.languages_url) {
      continue;
    }
    try {
      const path = repo.languages_url.replace('https://api.github.com', '');
      const languages = await githubGet(path);
      for (const [language, bytes] of Object.entries(languages)) {
        languageTotals.set(language, (languageTotals.get(language) || 0) + bytes);
      }
    } catch {
      // Keep rendering even if one repository language endpoint fails.
    }
  }

  const sortedLanguages = [...languageTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totalLanguageBytes = sortedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);
  const totalStars = sourceRepos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
  const totalForks = sourceRepos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);

  const rankableRepos = [...sourceRepos].sort((a, b) => {
    if ((b.stargazers_count || 0) !== (a.stargazers_count || 0)) {
      return (b.stargazers_count || 0) - (a.stargazers_count || 0);
    }
    if ((b.forks_count || 0) !== (a.forks_count || 0)) {
      return (b.forks_count || 0) - (a.forks_count || 0);
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const context = {
    user,
    publicRepos: sourceRepos,
    totalStars,
    totalForks,
    sortedLanguages,
    totalLanguageBytes,
    rankableRepos,
    topRepo: rankableRepos[0],
  };

  const leetCodeStats = await getLeetCodeStats(leetcodeUsername);
  const contributionStats = await getContributionStats(username);

  writeFileSync(join(outDir, 'github-stats.svg'), buildStatsSvg(context));
  writeFileSync(join(outDir, 'top-languages.svg'), buildLanguagesSvg(context));
  writeFileSync(join(outDir, 'github-trophies.svg'), buildTrophiesSvg(context));
  writeFileSync(join(outDir, 'top-contributed-repo.svg'), buildRepoSvg(context));
  writeFileSync(join(outDir, 'contribution-score.svg'), buildContributionScoreSvg(contributionStats));
  writeFileSync(join(outDir, 'leetcode-progress.svg'), buildLeetCodeSvg(leetCodeStats));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});