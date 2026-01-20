const fs = require('fs');
const path = require('path');

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

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    if (line.startsWith('## ')) {
      result.push(`<h2>${line.slice(3)}</h2>`);
      return;
    }

    if (line.match(/^!\[(.+)\]\((.+)\)$/)) {
      const [, alt, src] = line.match(/^!\[(.+)\]\((.+)\)$/);
      result.push(`<figure><img src="${src}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`);
      return;
    }

    if (line.match(/^\[(.+)\]\((.+)\)$/)) {
      const [, text, href] = line.match(/^\[(.+)\]\((.+)\)$/);
      result.push(`<p><a href="${href}">${text}</a></p>`);
      return;
    }

    result.push(`<p>${line}</p>`);
  });

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

      // Get presentation images (all images in the sub-folder, excluding .md)
      const presImages = getImages(subFolder, `/works/${slug}/${subSlug}`);

      presentations.push({
        slug: subSlug,
        _folderName: subFolderName,  // for source path
        title: subData.title,
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
${work.presentations.map(p => `  <p><a href="${p.slug}/">${escapeHtml(p.type)}, ${escapeHtml(p.location)}, ${p.year}</a></p>`).join('\n')}
</div>
`
    : '';

  // Only show images if there are any (no heading)
  const imagesSection = work.images && work.images.length > 0
    ? `
<div class="work">
${generateImagesHtml(work.images)}
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(work.title)} - Hojun Song</title>
  <meta name="description" content="${escapeHtml(work.description)}">
  <link rel="canonical" href="https://hojunsong.com/works/${work.slug}/">
  <link rel="stylesheet" href="../../css/style.css">
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

<div class="work">
  <p><a href="../../">Hojun Song</a> / <a href="../../">Works</a> / ${escapeHtml(work.title)}</p>

  <h2>${escapeHtml(work.title)}</h2>
  <p>${work.year}</p>
</div>

<div class="work">
  <h2>Overview</h2>
${work.overview.map(p => `  <p>${escapeHtml(p)}</p>`).join('\n')}
</div>
${imagesSection}${presentationsSection}${relatedSection}
</body>
</html>
`;
}

// Generate presentation (sub-project) HTML
function generatePresentationHtml(work, presentation) {
  const sections = ['overview', 'context', 'focus', 'development', 'credits', 'technicalnotes'];

  let sectionsHtml = '';
  sections.forEach(section => {
    if (presentation[section]) {
      const title = section === 'technicalnotes' ? 'Technical Notes' :
                    section.charAt(0).toUpperCase() + section.slice(1);
      sectionsHtml += `
<div class="work">
  <h2>${title}</h2>
  ${markdownToHtml(presentation[section])}
</div>
`;
    }
  });

  // Images section (from folder)
  const imagesSection = presentation.images && presentation.images.length > 0
    ? `
<div class="work">
  <h2>Documentation</h2>
${generateImagesHtml(presentation.images)}
</div>
`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(presentation.title)} (${presentation.year}) - Hojun Song</title>
  <meta name="description" content="${escapeHtml(presentation.description)}">
  <link rel="canonical" href="https://hojunsong.com/works/${work.slug}/${presentation.slug}/">
  <link rel="stylesheet" href="../../../css/style.css">
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

<div class="work">
  <p><a href="../../../">Hojun Song</a> / <a href="../../../">Works</a> / <a href="../">${escapeHtml(work.title)}</a> / ${escapeHtml(presentation.type)}, ${presentation.year}</p>

  <h2>${escapeHtml(presentation.title)}</h2>
  <p>${escapeHtml(presentation.type)}, ${escapeHtml(presentation.location)}, ${presentation.year}</p>
</div>

<div class="work">
  <h2>Project</h2>
  <p>Part of the ongoing project: <a href="../">&rarr; ${escapeHtml(work.title)}</a></p>
</div>
${sectionsHtml}${imagesSection}
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
  <link rel="stylesheet" href="css/style.css">
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

  // Ensure directories exist
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(worksOutputDir)) fs.mkdirSync(worksOutputDir, { recursive: true });

  // Read works from markdown
  console.log('Reading markdown files...');
  const works = readWorks(contentDir);

  // Check for duplicate orders
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

  // Generate JSON with license info (exclude internal fields)
  console.log('Generating works.json...');
  const cleanWorks = works.map(({ _folderName, order, presentations, ...rest }) => ({
    ...rest,
    presentations: presentations.map(({ _folderName, ...pres }) => pres)
  }));
  const jsonData = {
    site: {
      title: 'Hojun Song',
      url: 'https://hojunsong.com',
      description: 'Hojun Song is an artist working with technology, science, and social issues.'
    },
    license: LICENSE,
    works: cleanWorks
  };
  fs.writeFileSync(path.join(dataDir, 'works.json'), JSON.stringify(jsonData, null, 2));

  // Generate index.html
  console.log('Generating index.html...');
  fs.writeFileSync(path.join(publicDir, 'index.html'), generateIndexHtml(works));

  // Generate work pages and copy images
  works.forEach(work => {
    const workDir = path.join(worksOutputDir, work.slug);
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

    console.log(`Generating ${work.slug}/index.html...`);
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

      console.log(`Generating ${work.slug}/${presentation.slug}/index.html...`);
      fs.writeFileSync(path.join(presDir, 'index.html'), generatePresentationHtml(work, presentation));

      // Copy presentation images (use _folderName for source path)
      const srcPresDir = path.join(contentDir, 'works', work._folderName, presentation._folderName);
      if (fs.existsSync(srcPresDir)) {
        const imageFiles = fs.readdirSync(srcPresDir).filter(f =>
          ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(f).toLowerCase())
        );
        if (imageFiles.length > 0) {
          console.log(`Copying images for ${work.slug}/${presentation.slug}...`);
          imageFiles.forEach(f => {
            fs.copyFileSync(
              path.join(srcPresDir, f),
              path.join(presDir, f)
            );
          });
        }
      }
    });
  });

  console.log('Build complete!');
}

build();
