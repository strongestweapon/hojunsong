const fs = require('fs');
const path = require('path');

const BUILD_VERSION = Date.now();

const LICENSE = {
  type: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  name: 'Creative Commons Attribution 4.0 International'
};

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

// Convert filename to caption: "01-installation-view.jpg" → "Installation view"
function filenameToCaption(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  return name
    .replace(/^\d+[-_\s]*/, '')  // remove leading numbers and separator
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

// Get images from a directory (sorted by filename)
function getImages(dir, urlBase) {
  if (!fs.existsSync(dir)) return [];

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const files = fs.readdirSync(dir);

  return files
    .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(f => ({
      src: `${urlBase}/${f}`,
      filename: f,
      caption: filenameToCaption(f)
    }));
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

// Simple markdown to HTML
function markdownToHtml(md) {
  const lines = md.split('\n');
  const result = [];
  let inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();
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

    if (trimmed.match(/^!\[(.+)\]\((.+)\)$/)) {
      if (inList) { result.push('</ul>'); inList = false; }
      const [, alt, src] = trimmed.match(/^!\[(.+)\]\((.+)\)$/);
      result.push(`<figure><img src="${src}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`);
      return;
    }

    // Images placeholder
    if (trimmed === '[images]') {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('{{IMAGES}}');
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

      // YouTube embed
      if (text.toLowerCase() === 'youtube') {
        let videoId = null;
        if (href.includes('youtube.com/watch')) {
          videoId = href.match(/[?&]v=([^&]+)/)?.[1];
        } else if (href.includes('youtu.be/')) {
          videoId = href.match(/youtu\.be\/([^?]+)/)?.[1];
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
      result.push(`<li>${content}</li>`);
      return;
    }

    if (inList) { result.push('</ul>'); inList = false; }
    result.push(`<p>${trimmed}</p>`);
  });

  if (inList) result.push('</ul>');

  return result.join('\n');
}

// HTML escape
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

    // Get work images from _images folder
    const workImagesDir = path.join(workFolder, '_images');
    const workImages = getImages(workImagesDir, `/works/${slug}/_images`);
    const thumbnail = workImages.length > 0 ? workImages[0].src : null;

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
          currentSection = line.slice(3).toLowerCase().replace(/\s+/g, '');
          sections[currentSection] = [];
        } else if (currentSection && line.trim()) {
          sections[currentSection].push(line);
        }
      });

      Object.keys(sections).forEach(key => {
        sections[key] = sections[key].join('\n').trim();
      });

      // Get presentation images from _images folder
      const presImagesDir = path.join(subFolder, '_images');
      const presImages = getImages(presImagesDir, `/works/${slug}/${subSlug}/_images`);

      presentations.push({
        slug: subSlug,
        _folderName: subFolderName,  // for source path
        title: subData.title,
        event: subData.event,
        type: subData.type,
        location: subData.location,
        year: subData.year,
        description: subData.description,
        images: presImages,
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
      thumbnail,
      images: workImages,
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

    // Get project images from _images folder
    const projectImagesDir = path.join(projectFolder, '_images');
    const projectImages = getImages(projectImagesDir, `/projects/${slug}/_images`);
    const thumbnail = projectImages.length > 0 ? projectImages[0].src : null;

    projects.push({
      slug,
      _folderName: folderName,
      order: data.order ? parseInt(data.order) : 999,
      title: data.title,
      year: data.year,
      description: data.description,
      overview,
      thumbnail,
      images: projectImages
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

// Generate images HTML
function generateImagesHtml(images) {
  if (!images || images.length === 0) return '';

  return images.map(img =>
    `  <figure><img src="${img.src}" alt="${escapeHtml(img.caption)}"><figcaption>${escapeHtml(img.caption)}</figcaption></figure>`
  ).join('\n');
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
${work.presentations.map(p => `  <p><a href="${p.slug}/">${p.event ? escapeHtml(p.event) + ', ' : ''}${escapeHtml(p.type)}, ${escapeHtml(p.location)}, ${p.year}</a></p>`).join('\n')}
</div>
`
    : '';

  // Images HTML for placeholder
  const imagesHtml = work.images && work.images.length > 0
    ? generateImagesHtml(work.images)
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
  ${(() => {
    let content = markdownToHtml(work.overview.join('\n\n'));
    if (content.includes('{{IMAGES}}')) {
      return content.replace('{{IMAGES}}', imagesHtml);
    } else if (imagesHtml) {
      return content + '\n' + imagesHtml;
    }
    return content;
  })()}
</div>
${presentationsSection}${relatedSection}
</body>
</html>
`;
}

// Generate presentation (sub-project) HTML
function generatePresentationHtml(work, presentation) {
  const imagesHtml = presentation.images && presentation.images.length > 0
    ? generateImagesHtml(presentation.images)
    : '';

  // Overview section - check for [images] placeholder
  let overviewHtml = '';
  let imagesPlaced = false;
  if (presentation.overview) {
    let overviewContent = markdownToHtml(presentation.overview);
    // Replace {{IMAGES}} placeholder with actual images
    if (overviewContent.includes('{{IMAGES}}')) {
      overviewContent = overviewContent.replace('{{IMAGES}}', imagesHtml);
      imagesPlaced = true;
    }
    // If no placeholder, add images at end of overview
    if (!imagesPlaced && imagesHtml) {
      overviewContent += '\n' + imagesHtml;
      imagesPlaced = true;
    }
    overviewHtml = `
<div class="work">
  <h2>Overview</h2>
  ${overviewContent}
</div>
`;
  }

  // Other sections - also support [images] placeholder
  const otherSections = ['context', 'focus', 'development', 'credits', 'technicalnotes'];
  let sectionsHtml = '';
  otherSections.forEach(section => {
    if (presentation[section]) {
      const title = section === 'technicalnotes' ? 'Technical Notes' :
                    section.charAt(0).toUpperCase() + section.slice(1);
      let sectionContent = markdownToHtml(presentation[section]);
      sectionContent = sectionContent.replace('{{IMAGES}}', imagesHtml);
      sectionsHtml += `
<div class="work">
  <h2>${title}</h2>
  ${sectionContent}
</div>
`;
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
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

  <h2>${escapeHtml(work.title)}${presentation.event ? ': ' + escapeHtml(presentation.event) : ''}</h2>
  <p>${escapeHtml(presentation.type)}, ${escapeHtml(presentation.location)}, ${presentation.year}</p>
</div>
${overviewHtml}${sectionsHtml}
</body>
</html>
`;
}

// Generate project HTML
function generateProjectHtml(project) {
  // Only show images if there are any (no heading)
  const imagesSection = project.images && project.images.length > 0
    ? `
<div class="work">
${generateImagesHtml(project.images)}
</div>
`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
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
${project.overview.map(p => `  <p>${escapeHtml(p)}</p>`).join('\n')}
</div>
${imagesSection}
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
  const contentHtml = about.content ? markdownToHtml(about.content) : '<p>(직접 작성)</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
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

</body>
</html>
`;
}

// Generate index HTML
function generateIndexHtml(works) {
  const worksList = works
    .map(w => `    <div class="work">
      <h2><a href="works/${w.slug}/">${escapeHtml(w.title)}</a></h2>
    </div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
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

    // Copy work images from _images (use _folderName for source path)
    const srcImagesDir = path.join(contentDir, 'works', work._folderName, '_images');
    const destImagesDir = path.join(workDir, '_images');
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

      // Copy presentation images from _images folder
      const srcPresImagesDir = path.join(contentDir, 'works', work._folderName, presentation._folderName, '_images');
      const destPresImagesDir = path.join(presDir, '_images');
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

    // Copy project images from _images
    const srcImagesDir = path.join(contentDir, 'projects', project._folderName, '_images');
    const destImagesDir = path.join(projectDir, '_images');
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

  console.log('Build complete!');
}

build();
