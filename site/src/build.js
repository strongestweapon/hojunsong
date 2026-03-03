const fs = require('fs');
const path = require('path');

const BUILD_VERSION = Date.now();

const SITE_URL = 'https://hojunsong.com';

const LICENSE = {
  type: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  name: 'Creative Commons Attribution 4.0 International'
};

const SAME_AS = [
  'https://www.instagram.com/hojunsong_studio',
  'https://www.youtube.com/@hojunsong',
];

const GA_SCRIPT = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZLYQTCD8FK"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-ZLYQTCD8FK');
</script>`;

// Extract first image filename from markdown text
function extractFirstImage(mdText) {
  if (!mdText) return null;
  const text = Array.isArray(mdText) ? mdText.join('\n') : mdText;
  const match = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match ? match[1] : null;
}

// Generate Open Graph + Twitter Card meta tags
function generateOgMeta({ title, description, url, imageUrl, type = 'article' }) {
  const tags = [
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="Hojun Song">`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  ];
  if (imageUrl) {
    tags.push(`<meta property="og:image" content="${imageUrl}">`);
    tags.push(`<meta name="twitter:image" content="${imageUrl}">`);
  }
  return tags.join('\n  ');
}

// Simple frontmatter parser (no dependencies)
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content };

  const yaml = match[1];
  const body = match[2];
  const data = {};

  let currentKey = null;
  let currentArray = null;

  yaml.split('\n').forEach(line => {
    if (line.match(/^(\w+):\s*$/)) {
      currentKey = line.match(/^(\w+):/)[1];
      currentArray = [];
      data[currentKey] = currentArray;
    } else if (line.match(/^\s+-\s+(.+)$/)) {
      const value = line.match(/^\s+-\s+(.+)$/)[1];
      if (currentArray) currentArray.push(value);
    } else if (line.match(/^(\w+):\s*(.+)$/)) {
      const [, key, value] = line.match(/^(\w+):\s*(.+)$/);
      data[key] = value;
      currentArray = null;
    }
  });

  return { data, content: body.trim() };
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// HTML escape
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Process inline markdown (links, bold, italic) within text
function processInlineMarkdown(text) {
  // Bold: **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `<a href="${url}" target="_blank" rel="noopener">${linkText}</a>`;
    }
    return `<a href="${url}">${linkText}</a>`;
  });
  return text;
}

// Generate image HTML with 404 fallback
function generateImageHtml(src, caption, imagesBasePath) {
  const escapedCaption = escapeHtml(caption);
  // Resolve relative paths against imagesBasePath
  let resolvedSrc = src;
  if (!src.startsWith('/') && !src.startsWith('http') && imagesBasePath) {
    resolvedSrc = `${imagesBasePath}/${src}`;
  }
  // Use onerror for 404 fallback (shows placeholder and logs error)
  return `<figure><img src="${resolvedSrc}" alt="${escapedCaption}" onerror="this.onerror=null; this.src='/images/404.svg'; this.parentElement.classList.add('image-error'); console.error('Image not found: ${resolvedSrc}');"><figcaption>${escapedCaption}</figcaption></figure>`;
}

// Parse grid block and return images HTML
function parseGridBlock(lines, gridType, imagesBasePath) {
  const images = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    // Supports filenames with parentheses
    const match = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
    if (match) {
      const [, caption, src] = match;
      images.push(generateImageHtml(src, caption, imagesBasePath));
    }
  });

  if (images.length === 0) return '';

  return `<div class="image-${gridType}">\n${images.join('\n')}\n</div>`;
}

// Simple markdown to HTML
// imagesBasePath: base path for relative image URLs (e.g., "/works/slug/images")
function markdownToHtml(md, imagesBasePath = null) {
  const lines = md.split('\n');
  const result = [];
  let inList = false;
  let inGrid = false;
  let gridType = null;
  let gridLines = [];

  lines.forEach(line => {
    const trimmed = line.trim();

    // Check for grid block start
    const gridStartMatch = trimmed.match(/^\[(grid-2|grid-3|masonry)\]$/);
    if (gridStartMatch) {
      if (inList) { result.push('</ul>'); inList = false; }
      inGrid = true;
      gridType = gridStartMatch[1];
      gridLines = [];
      return;
    }

    // Check for grid block end
    if (trimmed === '[/grid]' || trimmed === '[/masonry]') {
      if (inGrid) {
        result.push(parseGridBlock(gridLines, gridType, imagesBasePath));
        inGrid = false;
        gridType = null;
        gridLines = [];
      }
      return;
    }

    // If inside grid block, collect lines
    if (inGrid) {
      gridLines.push(line);
      return;
    }

    if (!trimmed) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      return;
    }

    if (trimmed.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h2>${trimmed.slice(3)}</h2>`);
      return;
    }

    // Blockquote: > text or >text
    if (trimmed.startsWith('>')) {
      if (inList) { result.push('</ul>'); inList = false; }
      const quoteText = trimmed.startsWith('> ') ? trimmed.slice(2) : trimmed.slice(1);
      result.push(`<blockquote>${processInlineMarkdown(quoteText)}</blockquote>`);
      return;
    }

    // Single image (outside grid) - supports filenames with parentheses
    if (trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/)) {
      if (inList) { result.push('</ul>'); inList = false; }
      const [, caption, src] = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
      result.push(generateImageHtml(src, caption, imagesBasePath));
      return;
    }

    // Video with play button: [video][caption](filename)
    if (trimmed.match(/^\[video\]\[([^\]]*)\]\((.+)\)$/i)) {
      if (inList) { result.push('</ul>'); inList = false; }
      const [, caption, src] = trimmed.match(/^\[video\]\[([^\]]*)\]\((.+)\)$/i);
      const videoSrc = src.startsWith('http') ? src : `${imagesBasePath}/${src}`;
      // Check if poster file exists
      const posterFileName = src.replace(/\.mp4$/i, '-poster.jpg');
      const posterFilePath = imagesBasePath.replace(/^\//, '') + '/' + posterFileName;
      const posterExists = fs.existsSync(path.join(__dirname, 'content', posterFilePath.replace(/^works\//, 'works/')));
      const posterAttr = posterExists ? `poster="${imagesBasePath}/${posterFileName}"` : 'preload="metadata"';
      const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : '';
      result.push(`<figure class="video-player"><video playsinline ${posterAttr}><source src="${videoSrc}" type="video/mp4"></video><button class="play-btn" aria-label="Play"></button>${captionHtml}</figure>`);
      return;
    }

    if (trimmed.match(/^\[(.+)\]\((.+)\)$/)) {
      if (inList) { result.push('</ul>'); inList = false; }
      const [, text, href] = trimmed.match(/^\[(.+)\]\((.+)\)$/);

      // Loop video (autoplay, muted, loop)
      if (text.toLowerCase() === 'loop') {
        result.push(`<div class="video-loop"><video autoplay loop muted playsinline><source src="${href}" type="video/mp4"></video></div>`);
        return;
      }

      // Embed iframe (for interactive content)
      if (text.toLowerCase() === 'embed') {
        const embedSrc = href.startsWith('http') ? href : `${imagesBasePath.replace('/images', '')}/${href}`;
        result.push(`<div class="embed"><iframe src="${embedSrc}" frameborder="0" allowfullscreen></iframe></div>`);
        return;
      }

      // YouTube embed
      if (text.toLowerCase() === 'youtube') {
        let videoId = null;
        if (href.includes('youtube.com/watch')) {
          videoId = href.match(/[?&]v=([^&]+)/)?.[1];
        } else if (href.includes('youtu.be/')) {
          videoId = href.match(/youtu\.be\/([^?]+)/)?.[1];
        } else if (href.includes('youtube.com/shorts/')) {
          videoId = href.match(/shorts\/([^?]+)/)?.[1];
        }
        if (videoId) {
          result.push(`<div class="video"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`);
          return;
        }
      }

      // Vimeo embed
      if (text.toLowerCase() === 'vimeo') {
        const videoId = href.match(/vimeo\.com\/(\d+)/)?.[1];
        if (videoId) {
          result.push(`<div class="video"><iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe></div>`);
          return;
        }
      }

      // External links open in new tab
      if (href.startsWith('http://') || href.startsWith('https://')) {
        result.push(`<p><a href="${href}" target="_blank" rel="noopener">${text}</a></p>`);
      } else {
        result.push(`<p><a href="${href}">${text}</a></p>`);
      }
      return;
    }

    // List items (- or *)
    if (trimmed.match(/^[-*]\s+(.+)$/)) {
      const content = trimmed.match(/^[-*]\s+(.+)$/)[1];
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${processInlineMarkdown(content)}</li>`);
      return;
    }

    if (inList) { result.push('</ul>'); inList = false; }
    result.push(`<p>${processInlineMarkdown(trimmed)}</p>`);
  });

  if (inList) result.push('</ul>');

  // Close unclosed grid block (in case [/grid] is missing)
  if (inGrid) {
    console.warn('Warning: Unclosed grid block detected');
    result.push(parseGridBlock(gridLines, gridType, imagesBasePath));
  }

  return result.join('\n');
}

// Read all works
// New structure: works/[slug]/[slug].md for main, works/[slug]/[sub-slug]/[sub-slug].md for presentations
function readWorks(contentDir) {
  const worksDir = path.join(contentDir, 'works');
  const works = [];

  const workFolders = fs.readdirSync(worksDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  workFolders.forEach(folderName => {
    const workFolder = path.join(worksDir, folderName);
    const mainMdPath = path.join(workFolder, `${folderName}.md`);

    if (!fs.existsSync(mainMdPath)) return;

    const content = fs.readFileSync(mainMdPath, 'utf-8');
    const { data, content: body } = parseFrontmatter(content);

    // slug comes from frontmatter, not folder name
    const slug = data.slug;
    if (!slug) {
      console.warn(`Warning: No slug in ${mainMdPath}, skipping...`);
      return;
    }

    const overview = body.split('\n\n').filter(p => p.trim());

    // Find presentations (sub-folders with matching .md file)
    const presentations = [];
    const subFolders = fs.readdirSync(workFolder, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      .map(d => d.name);

    subFolders.forEach(subFolderName => {
      const subFolder = path.join(workFolder, subFolderName);
      const subMdPath = path.join(subFolder, `${subFolderName}.md`);

      if (!fs.existsSync(subMdPath)) return;

      const subContent = fs.readFileSync(subMdPath, 'utf-8');
      const { data: subData, content: subBody } = parseFrontmatter(subContent);

      // sub-project slug from frontmatter
      const subSlug = subData.slug;
      if (!subSlug) {
        console.warn(`Warning: No slug in ${subMdPath}, skipping...`);
        return;
      }

      const sections = {};
      let currentSection = null;

      subBody.split('\n').forEach(line => {
        if (line.startsWith('## ')) {
          const sectionTitle = line.slice(3);
          currentSection = sectionTitle.toLowerCase().replace(/\s+/g, '');
          sections[currentSection] = [];
          // Store original title for display
          sections[`_sectionTitle_${currentSection}`] = sectionTitle;
        } else if (currentSection && line.trim()) {
          sections[currentSection].push(line);
        }
      });

      Object.keys(sections).forEach(key => {
        if (!key.startsWith('_sectionTitle_')) {
          sections[key] = sections[key].join('\n').trim();
        }
      });

      presentations.push({
        slug: subSlug,
        _folderName: subFolderName,  // for source path
        title: subData.title,
        event: subData.event,
        type: subData.type,
        location: subData.location,
        year: subData.year,
        description: subData.description,
        ...sections
      });
    });

    works.push({
      slug,
      _folderName: folderName,  // for source path
      order: data.order ? parseInt(data.order) : 999,
      title: data.title,
      year: data.year,
      description: data.description,
      overview,
      presentations,
      relatedProjects: data.relatedProjects || []
    });
  });

  return works;
}

// Read all projects (simpler than works - no presentations)
function readProjects(contentDir) {
  const projectsDir = path.join(contentDir, 'projects');
  const projects = [];

  if (!fs.existsSync(projectsDir)) return projects;

  const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  projectFolders.forEach(folderName => {
    const projectFolder = path.join(projectsDir, folderName);
    const mainMdPath = path.join(projectFolder, `${folderName}.md`);

    if (!fs.existsSync(mainMdPath)) return;

    const content = fs.readFileSync(mainMdPath, 'utf-8');
    const { data, content: body } = parseFrontmatter(content);

    const slug = data.slug;
    if (!slug) {
      console.warn(`Warning: No slug in ${mainMdPath}, skipping...`);
      return;
    }

    const overview = body.split('\n\n').filter(p => p.trim());

    projects.push({
      slug,
      _folderName: folderName,
      order: data.order ? parseInt(data.order) : 999,
      title: data.title,
      year: data.year,
      description: data.description,
      overview
    });
  });

  return projects;
}

// Read about page
function readAbout(contentDir) {
  const aboutPath = path.join(contentDir, 'about', 'about.md');

  if (!fs.existsSync(aboutPath)) return null;

  const content = fs.readFileSync(aboutPath, 'utf-8');
  const { data, content: body } = parseFrontmatter(content);

  return {
    title: data.title || 'About',
    content: body.trim()
  };
}


// Generate work HTML
function generateWorkHtml(work, allWorks) {
  const relatedLinks = work.relatedProjects
    .map(slug => {
      const related = allWorks.find(w => w.slug === slug);
      if (!related) return '';
      return `  <p><a href="../${slug}/">&rarr; ${escapeHtml(related.title)}</a></p>`;
    })
    .filter(Boolean)
    .join('\n');

  // Only show presentations if there are any
  const presentationsSection = work.presentations.length > 0
    ? `
<div class="work">
  <h2>Presentations</h2>
  <ul>
${work.presentations.map(p => `    <li><a href="${p.slug}/">${p.event ? escapeHtml(p.event) + ', ' : ''}${escapeHtml(p.type)}, ${escapeHtml(p.location)}, ${p.year}</a></li>`).join('\n')}
  </ul>
</div>
`
    : '';

  // Only show related if there are any
  const relatedSection = relatedLinks
    ? `
<div class="work">
  <h2>Related Projects</h2>
${relatedLinks}
</div>
`
    : '';

  const firstImg = extractFirstImage(work.overview);
  const ogImageUrl = firstImg ? `${SITE_URL}/works/${work.slug}/images/${firstImg}` : null;
  const pageUrl = `${SITE_URL}/works/${work.slug}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(work.title)} - Hojun Song</title>
  <meta name="description" content="${escapeHtml(work.description)}">
  <link rel="canonical" href="${pageUrl}">
  ${generateOgMeta({ title: `${escapeHtml(work.title)} - Hojun Song`, description: work.description, url: pageUrl, imageUrl: ogImageUrl })}
  <link rel="stylesheet" href="../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${escapeHtml(work.title)}",
    "description": "${escapeHtml(work.description)}",
    "url": "${pageUrl}",
    ${ogImageUrl ? `"image": "${ogImageUrl}",\n    ` : ''}"creator": {
      "@type": "Person",
      "name": "Hojun Song",
      "url": "${SITE_URL}"
    },
    "dateCreated": "${work.year.split('–')[0]}",
    "license": "${LICENSE.url}"
  }
  </script>
</head>
<body>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div class="work">
  <p><a href="../../">Hojun Song</a> / <a href="../../">Works</a> / ${escapeHtml(work.title)}</p>

  <h2>${escapeHtml(work.title)}</h2>
  <p>${work.year}</p>
</div>

<div class="work">
  <h2>Overview</h2>
  ${markdownToHtml(work.overview.join('\n\n'), `/works/${work.slug}/images`)}
</div>
${presentationsSection}${relatedSection}
<script>
document.querySelectorAll('.video-player').forEach(p=>{
  const v=p.querySelector('video'),b=p.querySelector('.play-btn');
  p.addEventListener('click',()=>{if(v.paused){v.play();p.classList.add('playing')}else{v.pause();p.classList.remove('playing')}});
  v.addEventListener('ended',()=>p.classList.remove('playing'));
});
</script>
</body>
</html>
`;
}

// Generate presentation (sub-project) HTML
function generatePresentationHtml(work, presentation) {
  const imagesBasePath = `/works/${work.slug}/${presentation.slug}/images`;

  // Overview section
  let overviewHtml = '';
  if (presentation.overview) {
    overviewHtml = `
<div class="work">
  <h2>Overview</h2>
  ${markdownToHtml(presentation.overview, imagesBasePath)}
</div>
`;
  }

  // Other sections - render all sections found in the markdown (except overview which is already rendered)
  const knownSectionTitles = {
    'context': 'Context',
    'focus': 'Focus',
    'development': 'Development',
    'credits': 'Credits',
    'technicalnotes': 'Technical Notes'
  };
  let sectionsHtml = '';
  Object.keys(presentation).forEach(section => {
    // Skip non-content fields, internal keys, and overview (already rendered above)
    if (['slug', '_folderName', 'title', 'event', 'type', 'location', 'year', 'description', 'overview'].includes(section)) return;
    if (section.startsWith('_sectionTitle_')) return;
    if (presentation[section]) {
      // Use known title if available, otherwise use the original section name from markdown
      const title = knownSectionTitles[section] || presentation[`_sectionTitle_${section}`] || section.charAt(0).toUpperCase() + section.slice(1);
      sectionsHtml += `
<div class="work">
  <h2>${title}</h2>
  ${markdownToHtml(presentation[section], imagesBasePath)}
</div>
`;
    }
  });

  const presFirstImg = extractFirstImage(presentation.overview);
  const presOgImageUrl = presFirstImg ? `${SITE_URL}/works/${work.slug}/${presentation.slug}/images/${presFirstImg}` : null;
  const presPageUrl = `${SITE_URL}/works/${work.slug}/${presentation.slug}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(presentation.title)} (${presentation.year}) - Hojun Song</title>
  <meta name="description" content="${escapeHtml(presentation.description)}">
  <link rel="canonical" href="${presPageUrl}">
  ${generateOgMeta({ title: `${escapeHtml(presentation.title)} (${presentation.year}) - Hojun Song`, description: presentation.description, url: presPageUrl, imageUrl: presOgImageUrl })}
  <link rel="stylesheet" href="../../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ExhibitionEvent",
    "name": "${escapeHtml(presentation.title)}",
    "description": "${escapeHtml(presentation.description)}",
    "url": "${presPageUrl}",
    ${presOgImageUrl ? `"image": "${presOgImageUrl}",\n    ` : ''}"location": {
      "@type": "Place",
      "name": "${escapeHtml(presentation.location)}"
    },
    "startDate": "${presentation.year}",
    "organizer": {
      "@type": "Person",
      "name": "Hojun Song",
      "url": "${SITE_URL}"
    },
    "license": "${LICENSE.url}"
  }
  </script>
</head>
<body>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div class="work">
  <p><a href="../../../">Hojun Song</a> / <a href="../../../">Works</a> / <a href="../">${escapeHtml(work.title)}</a> / ${presentation.event ? escapeHtml(presentation.event) + ', ' + presentation.year : escapeHtml(presentation.type) + ', ' + presentation.year}</p>

  <h2>${escapeHtml(presentation.title)}${presentation.event ? ': ' + escapeHtml(presentation.event) : ''}</h2>
  <p>${escapeHtml(presentation.type)}, ${escapeHtml(presentation.location)}, ${presentation.year}</p>
</div>
${overviewHtml}${sectionsHtml}
<p class="back-link">← Back to /<a href="../">${escapeHtml(work.title)}</a></p>

<script>
document.querySelectorAll('.video-player').forEach(p=>{
  const v=p.querySelector('video'),b=p.querySelector('.play-btn');
  p.addEventListener('click',()=>{if(v.paused){v.play();p.classList.add('playing')}else{v.pause();p.classList.remove('playing')}});
  v.addEventListener('ended',()=>p.classList.remove('playing'));
});
</script>
</body>
</html>
`;
}

// Generate project HTML
function generateProjectHtml(project) {
  const imagesBasePath = `/projects/${project.slug}/images`;

  const projFirstImg = extractFirstImage(project.overview);
  const projOgImageUrl = projFirstImg ? `${SITE_URL}/projects/${project.slug}/images/${projFirstImg}` : null;
  const projPageUrl = `${SITE_URL}/projects/${project.slug}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} - Hojun Song</title>
  <meta name="description" content="${escapeHtml(project.description)}">
  <link rel="canonical" href="${projPageUrl}">
  ${generateOgMeta({ title: `${escapeHtml(project.title)} - Hojun Song`, description: project.description, url: projPageUrl, imageUrl: projOgImageUrl })}
  <link rel="stylesheet" href="../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${escapeHtml(project.title)}",
    "description": "${escapeHtml(project.description)}",
    "url": "${projPageUrl}",
    ${projOgImageUrl ? `"image": "${projOgImageUrl}",\n    ` : ''}"creator": {
      "@type": "Person",
      "name": "Hojun Song",
      "url": "${SITE_URL}"
    },
    "dateCreated": "${project.year.split('–')[0]}",
    "license": "${LICENSE.url}"
  }
  </script>
</head>
<body>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div class="work">
  <p><a href="../../">Hojun Song</a> / <a href="../">Projects</a> / ${escapeHtml(project.title)}</p>

  <h2>${escapeHtml(project.title)}</h2>
  <p>${project.year}</p>
</div>

<div class="work">
  <h2>Overview</h2>
  ${markdownToHtml(project.overview.join('\n\n'), imagesBasePath)}
</div>
<script>
document.querySelectorAll('.video-player').forEach(p=>{
  const v=p.querySelector('video'),b=p.querySelector('.play-btn');
  p.addEventListener('click',()=>{if(v.paused){v.play();p.classList.add('playing')}else{v.pause();p.classList.remove('playing')}});
  v.addEventListener('ended',()=>p.classList.remove('playing'));
});
</script>
</body>
</html>
`;
}

// Generate projects index HTML
function generateProjectsIndexHtml(projects) {
  const projectsList = projects
    .map(p => `    <div class="work">
      <h2><a href="${p.slug}/">${escapeHtml(p.title)}</a></h2>
    </div>`)
    .join('\n');

  const projsDescription = 'Projects by Hojun Song - game development, planning, and more.';
  const projsUrl = `${SITE_URL}/projects/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projects - Hojun Song</title>
  <meta name="description" content="${projsDescription}">
  <link rel="canonical" href="${projsUrl}">
  ${generateOgMeta({ title: 'Projects - Hojun Song', description: projsDescription, url: projsUrl })}
  <link rel="stylesheet" href="../css/style.css?v=${BUILD_VERSION}">
</head>
<body>

<h1>Projects</h1>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div id="workcontents">
${projectsList}
</div>

</body>
</html>
`;
}

// Generate about HTML
function generateAboutHtml(about) {
  const contentHtml = about.content ? markdownToHtml(about.content, '/about/images') : '<p>(직접 작성)</p>';

  const aboutDescription = 'About Hojun Song - artist working with technology, science, and social issues.';
  const aboutUrl = `${SITE_URL}/about/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About - Hojun Song</title>
  <meta name="description" content="${aboutDescription}">
  <link rel="canonical" href="${aboutUrl}">
  ${generateOgMeta({ title: 'About - Hojun Song', description: aboutDescription, url: aboutUrl })}
  <link rel="stylesheet" href="../css/style.css?v=${BUILD_VERSION}">
</head>
<body>

<h1>About</h1>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div class="work">
${contentHtml}
</div>
<script>
document.querySelectorAll('.video-player').forEach(p=>{
  const v=p.querySelector('video'),b=p.querySelector('.play-btn');
  p.addEventListener('click',()=>{if(v.paused){v.play();p.classList.add('playing')}else{v.pause();p.classList.remove('playing')}});
  v.addEventListener('ended',()=>p.classList.remove('playing'));
});
</script>
</body>
</html>
`;
}

// Generate index HTML
function generateIndexHtml(works, koreanMap) {
  const worksList = works
    .map(w => {
      const kr = koreanMap[w.slug] || {};
      const krTitle = kr.title || w.title;
      return `    <div class="work">
      <h2><a href="works/${w.slug}/"><span lang="en">${escapeHtml(w.title)}, ${w.year}</span><span lang="ko">${escapeHtml(krTitle)}, ${w.year}</span></a></h2>
    </div>`;
    })
    .join('\n');

  const indexDescription = 'Hojun Song is an artist working with technology, science, and social issues.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hojun Song</title>
  <meta name="description" content="${indexDescription}">
  <link rel="canonical" href="${SITE_URL}/">
  ${generateOgMeta({ title: 'Hojun Song', description: indexDescription, url: `${SITE_URL}/`, type: 'website' })}
  <link rel="stylesheet" href="css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Hojun Song",
    "url": "${SITE_URL}",
    "sameAs": ${JSON.stringify(SAME_AS)},
    "jobTitle": "Artist",
    "description": "${indexDescription}",
    "nationality": {
      "@type": "Country",
      "name": "South Korea"
    },
    "birthDate": "1978",
    "knowsAbout": ["art", "technology", "DIY engineering", "satellites", "performance art", "media art"]
  }
  </script>
</head>
<body>

<h1><span lang="en">Hojun Song</span><span lang="ko">송호준</span></h1>

<nav>
  <a href="/"><span lang="en">Works</span><span lang="ko">작품</span></a> | <a href="/projects/">Projects</a> | <a href="/about/"><span lang="en">About</span><span lang="ko">소개</span></a> | <span class="lang-toggle" onclick="toggleLang()"><span lang="en">한국어</span><span lang="ko">EN</span></span>
</nav>

<div id="workcontents">
${worksList}
</div>

<script>
function toggleLang(){document.documentElement.classList.toggle('ko')}
if(navigator.language.startsWith('ko'))document.documentElement.classList.add('ko');
</script>
</body>
</html>
`;
}

// Main build function
function build() {
  const srcDir = __dirname;
  const publicDir = path.join(srcDir, '..', 'public');
  const contentDir = path.join(srcDir, 'content');
  const dataDir = path.join(publicDir, 'data');
  const worksOutputDir = path.join(publicDir, 'works');
  const projectsOutputDir = path.join(publicDir, 'projects');
  const aboutOutputDir = path.join(publicDir, 'about');

  // Ensure directories exist
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(worksOutputDir)) fs.mkdirSync(worksOutputDir, { recursive: true });
  if (!fs.existsSync(projectsOutputDir)) fs.mkdirSync(projectsOutputDir, { recursive: true });
  if (!fs.existsSync(aboutOutputDir)) fs.mkdirSync(aboutOutputDir, { recursive: true });

  // Read works from markdown
  console.log('Reading works...');
  const works = readWorks(contentDir);

  // Check for duplicate orders (works)
  const orderCounts = {};
  works.forEach(w => {
    if (w.order !== 999) {
      orderCounts[w.order] = (orderCounts[w.order] || []);
      orderCounts[w.order].push(w.slug);
    }
  });
  Object.entries(orderCounts).forEach(([order, slugs]) => {
    if (slugs.length > 1) {
      console.warn(`Warning: Duplicate order ${order}: ${slugs.join(', ')}`);
    }
  });

  // Sort by order, then by title as fallback
  works.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  console.log(`Found ${works.length} works`);

  // Korean metadata (titles + descriptions) - edit site/src/korean.json to modify
  const koreanMap = JSON.parse(fs.readFileSync(path.join(srcDir, 'korean.json'), 'utf-8'));

  // Read projects from markdown
  console.log('Reading projects...');
  const projects = readProjects(contentDir);
  projects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  console.log(`Found ${projects.length} projects`);

  // Read about page
  console.log('Reading about...');
  const about = readAbout(contentDir);

  // Generate works.json with license info (exclude internal fields)
  console.log('Generating works.json...');
  const cleanWorks = works.map(({ _folderName, order, presentations, ...rest }) => ({
    ...rest,
    presentations: presentations.map(({ _folderName, ...pres }) => pres)
  }));
  const worksJsonData = {
    site: {
      title: 'Hojun Song',
      url: 'https://hojunsong.com',
      description: 'Hojun Song is an artist working with technology, science, and social issues.'
    },
    license: LICENSE,
    works: cleanWorks
  };
  fs.writeFileSync(path.join(dataDir, 'works.json'), JSON.stringify(worksJsonData, null, 2));

  // Generate projects.json
  console.log('Generating projects.json...');
  const cleanProjects = projects.map(({ _folderName, order, ...rest }) => rest);
  const projectsJsonData = {
    site: {
      title: 'Hojun Song',
      url: 'https://hojunsong.com',
      description: 'Hojun Song is an artist working with technology, science, and social issues.'
    },
    license: LICENSE,
    projects: cleanProjects
  };
  fs.writeFileSync(path.join(dataDir, 'projects.json'), JSON.stringify(projectsJsonData, null, 2));

  // Generate index.html
  console.log('Generating index.html...');
  fs.writeFileSync(path.join(publicDir, 'index.html'), generateIndexHtml(works, koreanMap));

  // Generate work pages and copy images
  works.forEach(work => {
    const workDir = path.join(worksOutputDir, work.slug);
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

    console.log(`Generating works/${work.slug}/index.html...`);
    fs.writeFileSync(path.join(workDir, 'index.html'), generateWorkHtml(work, works));

    // Copy work images from images (use _folderName for source path)
    const srcImagesDir = path.join(contentDir, 'works', work._folderName, 'images');
    const destImagesDir = path.join(workDir, 'images');
    if (fs.existsSync(srcImagesDir)) {
      console.log(`Copying images for ${work.slug}...`);
      copyDir(srcImagesDir, destImagesDir);
    }

    // Generate presentation pages and copy images
    work.presentations.forEach(presentation => {
      const presDir = path.join(workDir, presentation.slug);
      if (!fs.existsSync(presDir)) fs.mkdirSync(presDir, { recursive: true });

      console.log(`Generating works/${work.slug}/${presentation.slug}/index.html...`);
      fs.writeFileSync(path.join(presDir, 'index.html'), generatePresentationHtml(work, presentation));

      // Copy presentation images from images folder
      const srcPresImagesDir = path.join(contentDir, 'works', work._folderName, presentation._folderName, 'images');
      const destPresImagesDir = path.join(presDir, 'images');
      if (fs.existsSync(srcPresImagesDir)) {
        console.log(`Copying images for ${work.slug}/${presentation.slug}...`);
        copyDir(srcPresImagesDir, destPresImagesDir);
      }
    });
  });

  // Generate projects index
  console.log('Generating projects/index.html...');
  fs.writeFileSync(path.join(projectsOutputDir, 'index.html'), generateProjectsIndexHtml(projects));

  // Generate project pages and copy images
  projects.forEach(project => {
    const projectDir = path.join(projectsOutputDir, project.slug);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    console.log(`Generating projects/${project.slug}/index.html...`);
    fs.writeFileSync(path.join(projectDir, 'index.html'), generateProjectHtml(project));

    // Copy project images from images
    const srcImagesDir = path.join(contentDir, 'projects', project._folderName, 'images');
    const destImagesDir = path.join(projectDir, 'images');
    if (fs.existsSync(srcImagesDir)) {
      console.log(`Copying images for project ${project.slug}...`);
      copyDir(srcImagesDir, destImagesDir);
    }
  });

  // Generate about page
  console.log('Generating about/index.html...');
  if (about) {
    fs.writeFileSync(path.join(aboutOutputDir, 'index.html'), generateAboutHtml(about));
  } else {
    // Create default about page if no about.md exists
    fs.writeFileSync(path.join(aboutOutputDir, 'index.html'), generateAboutHtml({ title: 'About', content: '' }));
  }

  // Copy about images
  const srcAboutImagesDir = path.join(contentDir, 'about', 'images');
  const destAboutImagesDir = path.join(aboutOutputDir, 'images');
  if (fs.existsSync(srcAboutImagesDir)) {
    console.log('Copying images for about...');
    copyDir(srcAboutImagesDir, destAboutImagesDir);
  }

  // Generate robots.txt
  console.log('Generating robots.txt...');
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);

  // Helper: strip image/video markdown, keep only text
  function stripMediaMarkdown(text) {
    if (!text) return '';
    const t = Array.isArray(text) ? text.join('\n\n') : text;
    return t
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (trimmed.match(/^!\[/)) return false;  // images
        if (trimmed.match(/^\[(youtube|vimeo|video|loop|embed)\]/i)) return false;  // media embeds
        if (trimmed.match(/^\[(grid-2|grid-3|masonry)\]$/)) return false;  // grid start
        if (trimmed.match(/^\[\/(grid|masonry)\]$/)) return false;  // grid end
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Read artist bios
  const bioEnPath = path.join(srcDir, '..', '..', 'hojunsong.md');
  const bioKrPath = path.join(srcDir, '..', '..', 'hojunsong_KR.md');
  let bioEn = '';
  let bioKr = '';
  if (fs.existsSync(bioEnPath)) {
    bioEn = fs.readFileSync(bioEnPath, 'utf-8')
      .replace(/^## Hojun Song.*\n/, '')  // remove header line with links
      .trim();
  }
  if (fs.existsSync(bioKrPath)) {
    bioKr = fs.readFileSync(bioKrPath, 'utf-8')
      .replace(/^## 송호준.*\n/, '')  // remove header line with links
      .trim();
  }

  // Generate llms.txt
  console.log('Generating llms.txt...');
  const llmsTxt = `# Hojun Song / 송호준
> Artist and engineer working at the intersection of art, technology, and social commentary.
> 예술과 기술, 사회적 코멘터리의 교차점에서 작업하는 아티스트이자 엔지니어.

## About / 소개
Hojun Song (송호준, b. 1978, South Korea) creates absurd yet functional objects and systems that question how society constructs heroes, produces knowledge, and surrenders diversity to efficiency. Working across DIY engineering, performance, mass production, live streaming, and music.

송호준(1978년생, 한국)은 사회가 영웅을 만들어내는 방식, 지식을 생산하는 방식, 다양성을 효율에 내어주는 방식에 질문을 던지는 작업을 한다. DIY 공학, 퍼포먼스, 대량생산, 라이브 스트리밍, 음악을 넘나든다.

In 2013, he launched OSSI-1 from Baikonur, Kazakhstan—the first satellite ever built and launched by an individual.
2013년 카자흐스탄 바이코누르에서 OSSI-1을 발사했다. 개인이 인공위성을 만들어 발사한 세계 최초의 사례.

His work has been presented at the Venice Architecture Biennale, Poznan Mediations Biennale, Zero1 Biennial, Leeum Samsung Museum of Art, MMCA Seoul, and Art Sonje Center. Featured in BBC, Wired, New Scientist, and Reuters.
베니스 건축 비엔날레, 포츠난 미디어 비엔날레, Zero1 비엔니얼, 리움삼성미술관, 국립현대미술관, 아트선재센터 등에서 작품을 발표. BBC, Wired, New Scientist, Reuters 등에 소개.

## Website / 웹사이트
- Homepage: ${SITE_URL}
- Full content (bilingual EN/KR / 영한 전체 내용): ${SITE_URL}/llms-full.txt
- About: ${SITE_URL}/about/
- Works JSON data: ${SITE_URL}/data/works.json
- Projects JSON data: ${SITE_URL}/data/projects.json

## Works / 작품
${works.map(w => {
    const kr = koreanMap[w.slug] || {};
    const krTitle = kr.title ? ` / ${kr.title}` : '';
    const krDesc = kr.description ? `\n  ${kr.description}` : '';
    return `- [${w.title}${krTitle}](${SITE_URL}/works/${w.slug}/): ${w.description}${krDesc} (${w.year})`;
  }).join('\n')}

## Projects / 프로젝트
${projects.map(p => `- [${p.title}](${SITE_URL}/projects/${p.slug}/): ${p.description} (${p.year})`).join('\n')}

## License / 라이선스
All content is licensed under ${LICENSE.name} (${LICENSE.url}).
이 콘텐츠는 크리에이티브 커먼즈 저작자표시 4.0 국제 라이선스에 따라 이용할 수 있습니다.

## Contact / 연락처
- Website: ${SITE_URL}
- Instagram: https://www.instagram.com/hojunsong_studio
- YouTube: https://www.youtube.com/@hojunsong
`;
  fs.writeFileSync(path.join(publicDir, 'llms.txt'), llmsTxt);

  // Generate llms-full.txt (bilingual EN/KR, full content)
  console.log('Generating llms-full.txt...');

  // Build full content for each work
  const worksFullContent = works.map(w => {
    const kr = koreanMap[w.slug] || {};
    const krTitle = kr.title || '';
    const krDesc = kr.description || '';
    const titleLine = krTitle ? `### ${w.title} / ${krTitle}` : `### ${w.title}`;
    const overviewText = stripMediaMarkdown(w.overview);

    let presentationsText = '';
    if (w.presentations.length > 0) {
      presentationsText = '\n\n**Presentations / 전시 이력:**\n' +
        w.presentations.map(p => {
          const presOverview = stripMediaMarkdown(p.overview);
          let entry = `- ${p.event || p.type}, ${p.location}, ${p.year}`;
          if (presOverview) {
            entry += `\n  ${presOverview.split('\n').join('\n  ')}`;
          }
          return entry;
        }).join('\n');
    }

    return `${titleLine}
**Year / 연도:** ${w.year}
**URL:** ${SITE_URL}/works/${w.slug}/

${w.description}
${krDesc ? `${krDesc}\n` : ''}
${overviewText}${presentationsText}`;
  }).join('\n\n---\n\n');

  const llmsFullTxt = `# Hojun Song / 송호준
> Artist and engineer working at the intersection of art, technology, and social commentary.
> 예술과 기술, 사회적 코멘터리의 교차점에서 작업하는 아티스트이자 엔지니어.

Website: ${SITE_URL}
Machine-readable data: ${SITE_URL}/data/works.json
License: ${LICENSE.name} (${LICENSE.url})

---

## Biography (English)

${bioEn}

---

## 약력 (한국어)

${bioKr}

---

## Works / 작품

${worksFullContent}

---

## Contact / 연락처
- Website: ${SITE_URL}
- Instagram: https://www.instagram.com/hojunsong_studio
- YouTube: https://www.youtube.com/@hojunsong

## License / 라이선스
All content is licensed under ${LICENSE.name} (${LICENSE.url}).
Content can be freely shared and adapted with attribution to Hojun Song (송호준).
이 콘텐츠는 크리에이티브 커먼즈 저작자표시 4.0 국제 라이선스에 따라 이용할 수 있습니다. 송호준을 출처로 표시하면 자유롭게 공유 및 변형할 수 있습니다.
`;
  fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), llmsFullTxt);

  // Generate sitemap.xml
  console.log('Generating sitemap.xml...');
  const today = new Date().toISOString().split('T')[0];
  let sitemapUrls = [
    { loc: 'https://hojunsong.com/', priority: '1.0' },
    { loc: 'https://hojunsong.com/about/', priority: '0.8' },
    { loc: 'https://hojunsong.com/projects/', priority: '0.8' }
  ];

  // Add work pages
  works.forEach(work => {
    sitemapUrls.push({ loc: `https://hojunsong.com/works/${work.slug}/`, priority: '0.9' });
    // Add presentation pages
    if (work.presentations) {
      work.presentations.forEach(pres => {
        sitemapUrls.push({ loc: `https://hojunsong.com/works/${work.slug}/${pres.slug}/`, priority: '0.7' });
      });
    }
  });

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml);

  console.log('Build complete!');
}

build();
