const fs = require('fs');
const path = require('path');

const BUILD_VERSION = Date.now();

const LICENSE = {
  type: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  name: 'Creative Commons Attribution 4.0 International'
};

const GA_SCRIPT = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZLYQTCD8FK"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-ZLYQTCD8FK');
</script>`;

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(work.title)} - Hojun Song</title>
  <meta name="description" content="${escapeHtml(work.description)}">
  <link rel="canonical" href="https://hojunsong.com/works/${work.slug}/">
  <link rel="stylesheet" href="../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${escapeHtml(work.title)}",
    "description": "${escapeHtml(work.description)}",
    "creator": {
      "@type": "Person",
      "name": "Hojun Song"
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(presentation.title)} (${presentation.year}) - Hojun Song</title>
  <meta name="description" content="${escapeHtml(presentation.description)}">
  <link rel="canonical" href="https://hojunsong.com/works/${work.slug}/${presentation.slug}/">
  <link rel="stylesheet" href="../../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ExhibitionEvent",
    "name": "${escapeHtml(presentation.title)}",
    "description": "${escapeHtml(presentation.description)}",
    "location": {
      "@type": "Place",
      "name": "${escapeHtml(presentation.location)}"
    },
    "startDate": "${presentation.year}",
    "organizer": {
      "@type": "Person",
      "name": "Hojun Song"
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} - Hojun Song</title>
  <meta name="description" content="${escapeHtml(project.description)}">
  <link rel="canonical" href="https://hojunsong.com/projects/${project.slug}/">
  <link rel="stylesheet" href="../../css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${escapeHtml(project.title)}",
    "description": "${escapeHtml(project.description)}",
    "creator": {
      "@type": "Person",
      "name": "Hojun Song"
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Projects - Hojun Song</title>
  <meta name="description" content="Projects by Hojun Song - game development, planning, and more.">
  <link rel="canonical" href="https://hojunsong.com/projects/">
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About - Hojun Song</title>
  <meta name="description" content="About Hojun Song - artist working with technology, science, and social issues.">
  <link rel="canonical" href="https://hojunsong.com/about/">
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
function generateIndexHtml(works) {
  const worksList = works
    .map(w => `    <div class="work">
      <h2><a href="works/${w.slug}/">${escapeHtml(w.title)}, ${w.year}</a></h2>
    </div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${GA_SCRIPT}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hojun Song</title>
  <meta name="description" content="Hojun Song is an artist working with technology, science, and social issues.">
  <link rel="canonical" href="https://hojunsong.com/">
  <link rel="stylesheet" href="css/style.css?v=${BUILD_VERSION}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Hojun Song",
    "url": "https://hojunsong.com",
    "sameAs": [],
    "jobTitle": "Artist"
  }
  </script>
</head>
<body>

<h1>Hojun Song</h1>

<nav>
  <a href="/">Works</a> | <a href="/projects/">Projects</a> | <a href="/about/">About</a>
</nav>

<div id="workcontents">
${worksList}
</div>

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
  fs.writeFileSync(path.join(publicDir, 'index.html'), generateIndexHtml(works));

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
