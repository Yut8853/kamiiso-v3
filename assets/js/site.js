import * as THREE from './three.module.min.js';

const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const kvPhotoImages = [
  '0003',
  '0005',
  '0006',
  '0007',
  '0012',
  '0013',
  '0014',
  '0017',
  '0020',
  '0022',
  '0025',
  '0026',
  '0037',
  '0038',
  '0039',
  '0040',
  '0045',
  '0053',
  '0056',
  '0057',
  '0058',
  '0059',
  '0060',
  '0062',
  '0063',
  '0064',
  '0067',
  '0074',
  '0076',
  '0087',
  '0096',
  '0099',
  '0114',
  '0116',
  '0121',
  '0125',
].map(name => `assets/images/kv-random/photos/${name}`);

const excludedKvDotImageNumbers = new Set([
  19, 20, 21, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
]);

const kvDotImages = Array.from({ length: 75 }, (_, index) => index + 1)
  .filter(number => excludedKvDotImageNumbers.has(number) === false)
  .map(
    number =>
      `assets/images/kv-random/dots/dot-${String(number).padStart(3, '0')}`
  );

const largeKvDotImageNumbers = new Set([
  ...Array.from({ length: 13 }, (_, index) => index + 6),
  ...Array.from({ length: 8 }, (_, index) => index + 68),
]);

const fallbackVertexShader = `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aScale;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uSizeMultiplier;
  varying vec3 vColor;

  void main() {
    vec3 animated = position;
    animated.x += cos(uTime * aSpeed + aPhase) * aScale;
    animated.y += sin(uTime * aSpeed * 1.35 + aPhase) * aScale * 1.5;
    animated.z += sin(uTime * aSpeed * 0.8 + aPhase) * 0.22;

    float cx = cos(uPointer.y);
    float sx = sin(uPointer.y);
    float cy = cos(uPointer.x);
    float sy = sin(uPointer.x);
    animated = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * animated;
    animated = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx) * animated;

    vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_PointSize = 40.0 * uSizeMultiplier * (1.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vColor = color;
  }
`;

const fallbackFragmentShader = `
  precision highp float;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceFromCenter = length(point);
    if (distanceFromCenter > 0.5) discard;
    float core = 1.0 - smoothstep(0.08, 0.24, distanceFromCenter);
    float halo = 1.0 - smoothstep(0.18, 0.5, distanceFromCenter);
    vec3 glowColor = mix(vColor, vec3(1.0), 0.24 + core * 0.22);
    float alpha = core * 0.46 + halo * 0.28;
    gl_FragColor = vec4(glowColor, alpha);
  }
`;

const maxKvPhotoWidthPx = 640;
const kvDecorVisibleDuration = 5000;
const kvDecorFadeDuration = 1400;

function initializeLoadingScreen(extraTasks = []) {
  const loader = document.querySelector('.site-loader');
  if (!loader) return Promise.resolve();

  const value = loader.querySelector('[data-loading-value]');
  const bar = loader.querySelector('[data-loading-bar]');
  const tasks = createLoadingTasks(extraTasks);
  let completed = 0;
  let displayedProgress = 0;
  let targetProgress = tasks.length ? 0 : 100;
  let resolved = false;

  const renderProgress = progress => {
    const rounded = Math.min(100, Math.round(progress));
    if (value) value.textContent = String(rounded);
    if (bar) bar.style.setProperty('--loading-progress', String(rounded / 100));
  };

  const complete = () => {
    if (resolved) return;
    resolved = true;
    renderProgress(100);
    document.body.classList.remove('is-loading');
    document.body.classList.add('is-loaded');
    loader.classList.add('is-complete');
    loader.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      loader.hidden = true;
    }, 800);
  };

  const animate = () => {
    displayedProgress += (targetProgress - displayedProgress) * 0.16;
    if (targetProgress === 100 && 100 - displayedProgress < 0.35) {
      displayedProgress = 100;
    }
    renderProgress(displayedProgress);

    if (displayedProgress >= 100 && completed >= tasks.length) {
      complete();
      return;
    }
    requestAnimationFrame(animate);
  };

  tasks.forEach(task => {
    task.finally(() => {
      completed += 1;
      targetProgress = Math.min(100, (completed / tasks.length) * 100);
    });
  });

  if (!tasks.length) complete();
  else requestAnimationFrame(animate);
  return Promise.allSettled(tasks);
}

function createLoadingTasks(extraTasks) {
  const urls = collectLoadingImageUrls();
  const tasks = [...urls].map(preloadImage);
  tasks.push(...extraTasks);
  tasks.push(waitForWindowLoad());
  if (document.fonts?.ready) tasks.push(document.fonts.ready.catch(() => {}));
  return tasks;
}

function collectLoadingImageUrls() {
  const urls = new Set();
  document.querySelectorAll('link[rel="preload"][as="image"]').forEach(link => {
    addLoadingUrl(urls, link.getAttribute('href'));
  });
  document.querySelectorAll('img:not([loading="lazy"])').forEach(image => {
    addLoadingUrl(urls, image.currentSrc);
    addLoadingUrl(urls, image.getAttribute('src'));
    addSrcsetUrls(urls, image.getAttribute('srcset'));
  });
  document.querySelectorAll('source[srcset]').forEach(source => {
    if (source.closest('picture')?.querySelector('img[loading="lazy"]')) return;
    addSrcsetUrls(urls, source.getAttribute('srcset'));
  });
  return urls;
}

function addSrcsetUrls(urls, srcset) {
  if (!srcset) return;
  srcset.split(',').forEach(candidate => {
    addLoadingUrl(urls, candidate.trim().split(/\s+/)[0]);
  });
}

function addCssImageUrls(urls, imageValue) {
  if (!imageValue || imageValue === 'none') return;
  [...imageValue.matchAll(/url\(["']?([^"')]+)["']?\)/g)].forEach(match => {
    addLoadingUrl(urls, match[1]);
  });
}

function addLoadingUrl(urls, url) {
  if (!url || url.startsWith('data:')) return;
  try {
    urls.add(new URL(url, document.baseURI).href);
  } catch {
    urls.add(url);
  }
}

function preloadImage(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;
  });
}

function waitForWindowLoad() {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    window.addEventListener('load', resolve, { once: true });
  });
}

async function initializeKvRandomDecor() {
  const photoBlocks = [...document.querySelectorAll('.kv-photo-block')].slice(
    0,
    6
  );
  const dotBlocks = [...document.querySelectorAll('.kv-dot')].slice(0, 10);
  const decor = document.querySelector('.kv-decor');

  await applyKvRandomDecor(photoBlocks, dotBlocks);
  // Decor is placed a single time. The brief calls for a calm hero without
  // the constant re-randomizing / floating loop, so no rotation is scheduled.
  if (decor) decor.classList.add('is-settled');
}

function applyKvRandomDecor(photoBlocks, dotBlocks) {
  const shuffledPhotos = shuffleItems(kvPhotoImages);
  const shuffledDots = shuffleItems(kvDotImages);
  const photoPlacements = shuffleItems([
    { x: [4, 10], y: [8, 18], width: [22, 31] },
    { x: [66, 74], y: [8, 18], width: [21, 29] },
    { x: [30, 44], y: [-2, 1], width: [15, 20] },
    { x: [56, 70], y: [58, 70], width: [19, 26] },
    { x: [5, 12], y: [58, 70], width: [22, 31] },
    { x: [34, 48], y: [70, 78], width: [21, 29] },
  ]);
  const occupiedPhotoRects = getKvContentProtectedRects();
  const dotPlacements = shuffleItems([
    { x: [8, 18], y: [32, 47] },
    { x: [22, 34], y: [22, 38] },
    { x: [43, 54], y: [18, 32] },
    { x: [63, 74], y: [22, 38] },
    { x: [80, 90], y: [34, 50] },
    { x: [6, 18], y: [56, 72] },
    { x: [25, 38], y: [66, 82] },
    { x: [50, 62], y: [68, 84] },
    { x: [70, 82], y: [58, 76] },
    { x: [82, 90], y: [70, 80] },
    { x: [12, 26], y: [12, 24] },
    { x: [72, 86], y: [10, 22] },
  ]);

  const photoUpdates = photoBlocks.map((block, index) =>
    setRandomPhotoDecor(
      block,
      shuffledPhotos[index],
      photoPlacements[index],
      occupiedPhotoRects
    )
  );
  dotBlocks.forEach((block, index) => {
    setResponsiveBackground(block, shuffledDots[index]);
    setRandomDotDecor(block, dotPlacements[index], shuffledDots[index]);
  });
  return Promise.all(photoUpdates);
}

function wait(duration) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setResponsiveBackground(element, path) {
  if (!element || !path) return;
  element.style.backgroundImage = `url("${path}.webp")`;
  element.style.backgroundImage = `image-set(url("${path}.avif") type("image/avif"), url("${path}.webp") type("image/webp"))`;
}

function setRandomPhotoDecor(block, path, placement, occupiedRects) {
  const photo = block.closest('.kv-photo');
  if (!photo || !placement || !path) return Promise.resolve();

  photo.style.display = '';
  photo.style.right = 'auto';
  photo.style.bottom = 'auto';
  photo.style.height = 'auto';
  photo.style.maxWidth = `${maxKvPhotoWidthPx}px`;
  photo.style.aspectRatio = '3 / 2';
  setResponsiveBackground(block, path);

  const image = new Image();
  return new Promise(resolve => {
    image.onload = () => {
      let aspectRatio = 3 / 2;
      if (image.naturalWidth && image.naturalHeight) {
        aspectRatio = image.naturalWidth / image.naturalHeight;
        photo.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
      }
      let rect = createNonOverlappingPhotoRect(
        placement,
        aspectRatio,
        occupiedRects
      );
      if (!rect) {
        rect = createFallbackPhotoRect(placement, aspectRatio);
      }
      occupiedRects.push(rect);
      photo.style.top = `${rect.top}%`;
      photo.style.left = `${rect.left}%`;
      photo.style.width = `${rect.width}%`;
      photo.style.rotate = `${randomBetween(-2, 2)}deg`;
      resolve();
    };
    image.onerror = () => {
      let rect = createNonOverlappingPhotoRect(placement, 3 / 2, occupiedRects);
      if (!rect) {
        rect = createFallbackPhotoRect(placement, 3 / 2);
      }
      occupiedRects.push(rect);
      photo.style.top = `${rect.top}%`;
      photo.style.left = `${rect.left}%`;
      photo.style.width = `${rect.width}%`;
      photo.style.rotate = `${randomBetween(-2, 2)}deg`;
      resolve();
    };
    image.src = `${path}.webp`;
  });
}

function createNonOverlappingPhotoRect(placement, aspectRatio, occupiedRects) {
  const minPhotoWidth = 18;
  const maxPhotoWidth = getMaxKvPhotoWidthPercent();
  const maxContentOverlapRatio = 0.1;
  const widthScales = [1.22, 1.14, 1.06, 1, 0.94, 0.88, 0.82];
  const gaps = [8, 6, 4, 2, 0];

  for (const gap of gaps) {
    for (const widthScale of widthScales) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const baseWidth = randomBetween(...placement.width) * widthScale;
        const width = Math.min(
          maxPhotoWidth,
          Math.max(
            minPhotoWidth,
            aspectRatio < 1 ? baseWidth * 0.62 : baseWidth
          )
        );
        const height = width / aspectRatio;
        const maxLeft = Math.min(placement.x[1], 94 - width);
        const maxTop = Math.min(placement.y[1], 86 - height);
        if (maxLeft < placement.x[0] || maxTop < placement.y[0]) continue;

        const rect = {
          top: randomBetween(placement.y[0], maxTop),
          left: randomBetween(placement.x[0], maxLeft),
          width,
          height,
        };
        if (
          isAllowedKvPhotoRect(rect, occupiedRects, gap, maxContentOverlapRatio)
        ) {
          return rect;
        }
      }
    }
  }

  return createLeastOverlappingPhotoRect(placement, aspectRatio, occupiedRects);
}

function createLeastOverlappingPhotoRect(
  placement,
  aspectRatio,
  occupiedRects
) {
  const minPhotoWidth = 18;
  const maxPhotoWidth = getMaxKvPhotoWidthPercent();
  const maxContentOverlapRatio = 0.1;
  let bestRect;
  let bestOverlapArea = Infinity;

  for (let attempt = 0; attempt < 240; attempt++) {
    const baseWidth =
      randomBetween(...placement.width) * randomBetween(0.86, 1.08);
    const width = Math.min(
      maxPhotoWidth,
      Math.max(minPhotoWidth, aspectRatio < 1 ? baseWidth * 0.62 : baseWidth)
    );
    const height = width / aspectRatio;
    const maxLeft = Math.min(placement.x[1], 94 - width);
    const maxTop = Math.min(placement.y[1], 86 - height);
    if (maxLeft < placement.x[0] || maxTop < placement.y[0]) continue;

    const rect = {
      top: randomBetween(placement.y[0], maxTop),
      left: randomBetween(placement.x[0], maxLeft),
      width,
      height,
    };
    if (!isAllowedKvPhotoRect(rect, occupiedRects, 0, maxContentOverlapRatio)) {
      continue;
    }
    const overlapArea = occupiedRects.reduce(
      (total, occupied) => total + getRectOverlapArea(rect, occupied),
      0
    );
    if (overlapArea < bestOverlapArea) {
      bestRect = rect;
      bestOverlapArea = overlapArea;
    }
  }

  return bestRect || null;
}

function createFallbackPhotoRect(placement, aspectRatio) {
  const minPhotoWidth = 18;
  const maxPhotoWidth = getMaxKvPhotoWidthPercent();
  const baseWidth =
    randomBetween(...placement.width) * randomBetween(0.88, 1.12);
  const width = Math.min(
    maxPhotoWidth,
    Math.max(minPhotoWidth, aspectRatio < 1 ? baseWidth * 0.62 : baseWidth)
  );
  const height = width / aspectRatio;
  const left = Math.min(placement.x[1], Math.max(placement.x[0], 94 - width));
  const top = Math.min(placement.y[1], Math.max(placement.y[0], 86 - height));

  return { top, left, width, height };
}

function getKvContentProtectedRects() {
  const hero = document.querySelector('.kv-hero');
  const content = document.querySelector('.kv-content');
  if (!hero || !content) return [];

  const heroRect = hero.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  if (!heroRect.width || !heroRect.height) return [];

  const gapX = 2.5;
  const gapY = 2;
  const left = ((contentRect.left - heroRect.left) / heroRect.width) * 100;
  const top = ((contentRect.top - heroRect.top) / heroRect.height) * 100;
  const width = (contentRect.width / heroRect.width) * 100;
  const height = (contentRect.height / heroRect.height) * 100;

  return [
    {
      type: 'content',
      top: Math.max(0, top - gapY),
      left: Math.max(0, left - gapX),
      width: Math.min(100, width + gapX * 2),
      height: Math.min(100, height + gapY * 2),
    },
  ];
}

function isAllowedKvPhotoRect(
  rect,
  occupiedRects,
  gap,
  maxContentOverlapRatio
) {
  const maxContentOverlapArea =
    rect.width * rect.height * maxContentOverlapRatio;
  return occupiedRects.every(occupied => {
    if (occupied.type === 'content') {
      return getRectOverlapArea(rect, occupied) <= maxContentOverlapArea;
    }
    return !rectsOverlap(rect, occupied, gap);
  });
}

function getMaxKvPhotoWidthPercent() {
  const viewportWidth =
    window.innerWidth ||
    document.documentElement.clientWidth ||
    maxKvPhotoWidthPx;
  return (maxKvPhotoWidthPx / viewportWidth) * 100;
}

function getRectOverlapArea(rect, otherRect) {
  const overlapWidth = Math.max(
    0,
    Math.min(rect.left + rect.width, otherRect.left + otherRect.width) -
      Math.max(rect.left, otherRect.left)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(rect.top + rect.height, otherRect.top + otherRect.height) -
      Math.max(rect.top, otherRect.top)
  );
  return overlapWidth * overlapHeight;
}

function rectsOverlap(rect, otherRect, gap) {
  return !(
    rect.left + rect.width + gap <= otherRect.left ||
    otherRect.left + otherRect.width + gap <= rect.left ||
    rect.top + rect.height + gap <= otherRect.top ||
    otherRect.top + otherRect.height + gap <= rect.top
  );
}

function setRandomDotDecor(dot, placement, imagePath) {
  if (!dot || !placement) return;
  const imageNumber = Number(imagePath?.match(/dot-(\d{3})/)?.[1]);
  const isLargeDot = largeKvDotImageNumbers.has(imageNumber);
  const size = isLargeDot ? randomBetween(12, 16) : randomBetween(7.2, 10.2);
  dot.style.top = `${randomBetween(...placement.y)}%`;
  dot.style.left = `${randomBetween(...placement.x)}%`;
  dot.style.right = 'auto';
  dot.style.bottom = 'auto';
  dot.style.width = isLargeDot ? `${size}vw` : `${size}rem`;
  dot.style.height = isLargeDot ? 'auto' : `${size}rem`;
  const floatX = isLargeDot
    ? randomSignedBetween(34, 58)
    : randomSignedBetween(18, 34);
  const floatY = isLargeDot ? -randomBetween(34, 64) : -randomBetween(22, 42);
  dot.style.removeProperty('rotate');
  dot.style.setProperty('--dot-rotate', `${randomBetween(-13, 13)}deg`);
  dot.style.setProperty('--float-delay', `${randomBetween(-7, 0)}s`);
  dot.style.setProperty('--float-duration', `${randomBetween(7, 11)}s`);
  dot.style.setProperty('--float-x', `${floatX}px`);
  dot.style.setProperty('--float-y', `${floatY}px`);
  dot.style.setProperty('--float-x-mid', `${floatX * -0.55}px`);
  dot.style.setProperty('--float-y-mid', `${floatY * 0.45}px`);
  dot.style.setProperty('--float-x-end', `${floatX * 0.35}px`);
  dot.style.setProperty('--float-y-end', '8px');
  dot.style.setProperty('--float-rotate', `${randomSignedBetween(4, 8)}deg`);
  dot.style.setProperty(
    '--float-rotate-mid',
    `${randomSignedBetween(3, 6)}deg`
  );
  dot.style.setProperty(
    '--float-rotate-end',
    `${randomSignedBetween(2, 4)}deg`
  );
}

function randomSignedBetween(min, max) {
  return randomBetween(min, max) * (Math.random() < 0.5 ? -1 : 1);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function initializeMenu() {
  const header = document.querySelector('header');
  const button = header?.querySelector('button');
  const navigation = document.querySelector('#global-nav');
  if (!header || !button || !navigation) return;

  let open = false;
  const menuIcon = button.innerHTML;
  const closeIcon =
    '<span class="sr-only">メニューを閉じる</span><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x menu-button__icon" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

  const render = () => {
    button.setAttribute('aria-expanded', String(open));
    button.innerHTML = open ? closeIcon : menuIcon;
    navigation.setAttribute('aria-hidden', String(!open));
    navigation.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    updateHeader();
  };

  const updateHeader = () => {
    const scrolled = window.scrollY > 40 && !open;
    header.classList.toggle('is-scrolled', scrolled);
  };

  button.addEventListener('click', () => {
    open = !open;
    render();
  });
  navigation.querySelectorAll('a').forEach(link =>
    link.addEventListener('click', () => {
      open = false;
      render();
    })
  );
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

function initializeAccordions() {
  document.querySelectorAll('#faq li').forEach(item => {
    const button = item.querySelector('button');
    const panel = item.querySelector('h3 + div');
    const icon = button?.querySelector('svg');
    if (!button || !panel) return;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      panel.classList.toggle('is-open', !open);
      icon?.classList.toggle('is-open', !open);
    });
  });
}

function initializeTabsAndKeywords() {
  const requirements = document.querySelector('#requirements');
  const tabs = [...(requirements?.querySelectorAll('[role="tab"]') ?? [])];
  const tabsContainer = requirements?.querySelector('.requirements-tabs');
  const marker = tabsContainer?.querySelector('.requirements-tabs__marker');
  const panels = [
    ...(requirements?.querySelectorAll('[role="tabpanel"]') ?? []),
  ];
  const updateMarker = tab => {
    if (!tabsContainer || !marker || !tab) return;
    const inset = window.innerWidth >= 768 ? 48 : 16;
    tabsContainer.style.setProperty(
      '--marker-x',
      `${tab.offsetLeft + inset}px`
    );
    tabsContainer.style.setProperty(
      '--marker-width',
      `${Math.max(0, tab.offsetWidth - inset * 2)}px`
    );
  };
  tabs.forEach((tab, index) =>
    tab.addEventListener('click', () => {
      tabs.forEach((other, otherIndex) => {
        const selected = index === otherIndex;
        other.setAttribute('aria-selected', String(selected));
        other.classList.toggle('is-selected', selected);
      });
      updateMarker(tab);
      panels.forEach(panel => {
        const selected = panel.id === tab.getAttribute('aria-controls');
        panel.hidden = !selected;
        panel.classList.toggle('is-hidden', !selected);
      });
    })
  );
  updateMarker(tabs.find(tab => tab.classList.contains('is-selected')));
  window.addEventListener('resize', () => {
    updateMarker(tabs.find(tab => tab.classList.contains('is-selected')));
  });

  const keyword = document.querySelector('#keyword');
  const buttons = [...(keyword?.querySelectorAll('button') ?? [])];
  const selectedNumber = keyword?.querySelector('aside span.font-serif');
  const selectedLabel = keyword?.querySelector('aside .py-12 p:first-child');
  const selectedValue = keyword?.querySelector('aside .py-12 p:last-child');
  buttons.forEach((button, index) =>
    button.addEventListener('click', () => {
      buttons.forEach((other, otherIndex) => {
        const selected = index === otherIndex;
        other.setAttribute('aria-pressed', String(selected));
        other.classList.toggle('is-selected', selected);
      });
      if (selectedNumber)
        selectedNumber.textContent = String(index + 1).padStart(2, '0');
      const label = button.querySelector('.flex-1 > span:first-child');
      const value = button.querySelector('.flex-1 > span:last-child');
      if (selectedLabel && label) selectedLabel.textContent = label.textContent;
      if (selectedValue && value) selectedValue.innerHTML = value.innerHTML;
    })
  );
}

function initializeKineticKeywords() {
  const grid = document.querySelector('.keyword-grid');
  const cards = [...document.querySelectorAll('.keyword-grid > article')];
  const host = grid?.querySelector('.keyword-webgl');
  if (!grid || !host || !cards.length || reducedMotion) return;

  const canvas = document.createElement('canvas');
  host.append(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 160);
  camera.position.set(0, 0.4, 54);
  const spiral = new THREE.Group();
  spiral.position.y = 1.3;
  scene.add(spiral);

  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const rayPointer = new THREE.Vector2();
  let isPaused = false;
  let travelTime = 0;
  let lastElapsed = 0;
  const palette = [
    ['#f8d7bf', '#fff7bd', '#d9e3dd'],
    ['#dce6de', '#fffdef', '#f4ccb8'],
    ['#fff0b7', '#e8eef4', '#f8d7bf'],
  ];

  const makeTexture = (card, index) => {
    const number =
      card.querySelector('p:first-child')?.textContent?.trim() ?? '';
    const label = card.querySelector('h3')?.textContent?.trim() ?? '';
    const paragraphs = [...card.querySelectorAll('p')].slice(1);
    const value = paragraphs.map(item => item.textContent.trim()).join(' / ');
    const width = value.length > 34 ? 1360 : value.length > 18 ? 1120 : 860;
    const height = value.length > 18 ? 660 : 560;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = width;
    textureCanvas.height = height;
    const context = textureCanvas.getContext('2d');
    const colors = palette[index % palette.length];

    context.fillStyle = '#fffdef';
    context.fillRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.52, colors[1]);
    gradient.addColorStop(1, colors[2]);
    context.globalAlpha = 0.86;
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(37, 37, 37, 0.13)';
    context.lineWidth = 8;
    context.strokeRect(4, 4, width - 8, height - 8);

    context.fillStyle = '#d72b2f';
    context.font = '700 34px sans-serif';
    context.letterSpacing = '4px';
    context.fillText(number, 52, 82);
    context.fillRect(52, 106, 70, 4);

    context.fillStyle = 'rgba(37, 37, 37, 0.58)';
    context.font = '700 40px sans-serif';
    wrapCanvasText(context, label, 52, 166, width - 104, 54, 2);

    context.fillStyle = '#252525';
    fitCanvasText(context, value, {
      x: 52,
      y: 270,
      maxWidth: width - 104,
      maxHeight: height - 320,
      maxLines: 5,
      fontFamily: 'serif',
      maxFontSize: 60,
      minFontSize: 46,
      lineRatio: 1.22,
    });

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, aspect: width / height };
  };

  const helixTurns = 2.15;
  const helixHeight = 22;
  const helixRadius = 9.2;
  const getHelixState = progress => {
    const angle = progress * Math.PI * 2 * helixTurns - 1.35;
    return {
      angle,
      position: new THREE.Vector3(
        Math.cos(angle) * helixRadius,
        -helixHeight / 2 + progress * helixHeight,
        Math.sin(angle) * helixRadius
      ),
    };
  };
  const initialFrontPhase = (Math.PI / 2 + 1.35) / (Math.PI * 2 * helixTurns);

  const meshes = cards.map((card, index) => {
    const { texture, aspect } = makeTexture(card, index);
    const geometry = new THREE.PlaneGeometry(4.15 * aspect, 4.15);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const phase = (initialFrontPhase - index / cards.length + 1) % 1;
    const { angle, position } = getHelixState(phase);
    mesh.position.copy(position);
    mesh.rotation.z = (index % 2 ? -1 : 1) * (0.04 + index * 0.0025);
    mesh.userData.baseScale = 1.1 + Math.sin(index * 0.7) * 0.04;
    mesh.userData.phase = phase;
    mesh.scale.setScalar(mesh.userData.baseScale);
    spiral.add(mesh);
    return mesh;
  });

  const helixCurve = new THREE.CatmullRomCurve3(
    Array.from(
      { length: 220 },
      (_, index) => getHelixState(index / 219).position
    )
  );
  const helixGeometry = new THREE.BufferGeometry().setFromPoints(
    helixCurve.getPoints(180)
  );
  const helixLine = new THREE.Line(
    helixGeometry,
    new THREE.LineBasicMaterial({
      color: '#d72b2f',
      transparent: true,
      opacity: 0.28,
    })
  );
  spiral.add(helixLine);

  spiral.rotation.x = -0.1;
  spiral.rotation.y = -0.35;

  const resize = () => {
    const width = Math.ceil(canvas.offsetWidth || host.clientWidth);
    const height = Math.ceil(canvas.offsetHeight || host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  host.addEventListener(
    'pointermove',
    event => {
      const rect = canvas.getBoundingClientRect();
      rayPointer.set(
        ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        -((event.clientY - rect.top) / rect.height - 0.5) * 2
      );
      raycaster.setFromCamera(rayPointer, camera);
      spiral.updateMatrixWorld(true);
      isPaused = raycaster
        .intersectObjects(meshes, false)
        .some(hit => hit.object.material.opacity > 0.18);
      pointer.set(
        isPaused ? rayPointer.x * 0.5 : 0,
        isPaused ? -rayPointer.y * 0.5 : 0
      );
    },
    { passive: true }
  );
  host.addEventListener('pointerleave', () => {
    isPaused = false;
    pointer.set(0, 0);
  });
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frameId = null;
  let onScreen = true;
  let contextLost = false;
  const shouldRun = () => onScreen && !document.hidden && !contextLost;

  const stop = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
  const render = () => {
    frameId = null;
    if (!shouldRun()) return;
    const elapsed = clock.getElapsedTime();
    const delta = elapsed - lastElapsed;
    lastElapsed = elapsed;
    if (!isPaused) travelTime += delta;
    const targetY = -0.35 + pointer.x * 0.85;
    spiral.rotation.y += (targetY - spiral.rotation.y) * 0.05;
    spiral.rotation.x += (-0.08 - pointer.y * 0.32 - spiral.rotation.x) * 0.05;
    meshes.forEach((mesh, index) => {
      const progress = (mesh.userData.phase + travelTime * 0.012) % 1;
      const { position } = getHelixState(progress);
      position.y += Math.sin(travelTime * 1.2 + index) * 0.04;
      mesh.position.copy(position);
      mesh.quaternion.copy(camera.quaternion);
      mesh.rotateZ((index % 2 ? -1 : 1) * (0.04 + index * 0.0025));
      const depthScale = 0.94 + progress * 0.12;
      mesh.scale.setScalar(mesh.userData.baseScale * depthScale);
      const fadeIn = smoothstep(0.04, 0.16, progress);
      const fadeOut = 1 - smoothstep(0.84, 0.96, progress);
      mesh.material.opacity = fadeIn * fadeOut;
    });
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };
  const start = () => {
    if (frameId === null && shouldRun()) {
      lastElapsed = clock.getElapsedTime();
      frameId = requestAnimationFrame(render);
    }
  };

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  new IntersectionObserver(
    entries => {
      onScreen = entries.some(entry => entry.isIntersecting);
      if (onScreen) start();
      else stop();
    },
    { threshold: 0 }
  ).observe(grid);

  start();
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const characters = [...text];
  let line = '';
  const lines = [];
  for (const character of characters) {
    const testLine = line + character;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => {
    const clipped =
      index === maxLines - 1 && characters.join('') !== lines.join('');
    context.fillText(`${item}${clipped ? '…' : ''}`, x, y + index * lineHeight);
  });
}

function fitCanvasText(context, text, options) {
  const {
    x,
    y,
    maxWidth,
    maxHeight,
    maxLines,
    fontFamily,
    maxFontSize,
    minFontSize,
    lineRatio,
  } = options;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    context.font = `700 ${fontSize}px ${fontFamily}`;
    const lineHeight = Math.round(fontSize * lineRatio);
    const lines = buildCanvasLines(context, text, maxWidth, maxLines);
    if (lines.length * lineHeight <= maxHeight) {
      lines.forEach((line, index) => {
        context.fillText(line, x, y + index * lineHeight);
      });
      return;
    }
  }

  context.font = `700 ${minFontSize}px ${fontFamily}`;
  const lineHeight = Math.round(minFontSize * lineRatio);
  buildCanvasLines(context, text, maxWidth, maxLines).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function buildCanvasLines(context, text, maxWidth, maxLines) {
  const characters = [...text];
  const lines = [];
  let line = '';
  for (const character of characters) {
    const testLine = line + character;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines.join('') !== text) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  }
  return lines;
}

function smoothstep(edge0, edge1, value) {
  const amount = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return amount * amount * (3 - 2 * amount);
}

function initializePathDecorations() {
  const decorations = [
    {
      selector: '#about',
      variant: 'ribbon-arc',
      placement: 'right-high',
      paths: ['M1200 -220 A620 860 0 0 0 1200 1260'],
    },
    {
      selector: '#products',
      variant: 'ribbon-line',
      placement: 'line-low',
      count: 1,
      paths: ['M-120 430 L1120 38', 'M-120 246 L1120 468'],
    },
    {
      selector: '#interview',
      variant: 'ribbon-arc',
      placement: 'left-hero',
      paths: ['M-320 -300 A920 940 0 0 1 -320 1360'],
    },
    {
      selector: '#keyword',
      variant: 'ribbon-line',
      placement: 'line-high',
      count: 1,
      paths: ['M-120 222 L1120 148'],
    },
    {
      selector: '#environment',
      variant: 'ribbon-arc',
      placement: 'right-hero',
      paths: ['M1260 -420 A1180 1540 0 0 0 1260 1660'],
    },
    {
      selector: '#welfare',
      variant: 'ribbon-line',
      placement: 'line-middle',
      count: 2,
      paths: ['M-120 382 L1120 88', 'M-120 136 L1120 390'],
    },
    {
      selector: '#requirements',
      variant: 'ribbon-arc',
      placement: 'left-middle',
      paths: ['M-320 -200 A680 850 0 0 1 -320 1240'],
    },
    {
      selector: '#faq',
      variant: 'ribbon-arc',
      placement: 'left-high',
      paths: ['M-320 -260 A1040 900 0 0 1 -320 1320'],
    },
  ];

  decorations.forEach(
    ({ selector, variant, placement, paths, count }, index) => {
      const section = document.querySelector(selector);
      if (!section || section.querySelector('.section-path-decor')) return;
      section.classList.add('has-section-path');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add(
        'section-path-decor',
        `section-path-decor--${variant}`,
        `section-path-decor--${placement}`
      );
      svg.setAttribute(
        'viewBox',
        variant === 'ribbon-arc' ? '-320 -320 1520 1760' : '0 0 1000 520'
      );
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'defs'
      );
      const gradient = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'linearGradient'
      );
      const gradientId = `section-path-gradient-${section.id || index}`;
      gradient.setAttribute('id', gradientId);
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('x2', '100%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('y2', '100%');
      [
        ['0%', '#f5b8b7'],
        ['28%', '#f7df9a'],
        ['54%', '#c9dec1'],
        ['78%', '#cbd8f2'],
        ['100%', '#fffdef'],
      ].forEach(([offset, color]) => {
        const stop = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'stop'
        );
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        gradient.append(stop);
      });
      defs.append(gradient);
      svg.append(defs);
      const stickerPaths = paths;
      stickerPaths
        .slice(0, count ?? stickerPaths.length)
        .forEach((pathData, pathIndex) => {
          const element = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
          );
          const randomSeed = index * 13 + pathIndex * 7;
          element.setAttribute('d', pathData);
          element.setAttribute('pathLength', '1');
          element.setAttribute('stroke', `url(#${gradientId})`);
          element.classList.toggle(
            'is-reverse-draw',
            variant === 'ribbon-line' && pathIndex % 2 === 1
          );
          element.style.stroke = `url(#${gradientId})`;
          element.style.setProperty(
            '--path-delay',
            `${pathIndex * 0.24 + index * 0.04}s`
          );
          element.style.setProperty(
            '--path-duration',
            `${5.8 + (randomSeed % 5) * 0.55}s`
          );
          element.style.setProperty(
            '--path-drift-x',
            `${(randomSeed % 2 ? 1 : -1) * (10 + (randomSeed % 4) * 4)}px`
          );
          element.style.setProperty(
            '--path-drift-y',
            `${((randomSeed % 3) - 1) * 10}px`
          );
          element.style.setProperty(
            '--path-rotate',
            `${(randomSeed % 7) - 3}deg`
          );
          svg.append(element);
        });
      section.prepend(svg);
    }
  );

  const paths = [...document.querySelectorAll('.section-path-decor path')];
  paths.forEach(path => {
    const length = path.getTotalLength();
    path.style.setProperty('--path-length', length);
  });

  if (reducedMotion) {
    document.querySelectorAll('.has-section-path').forEach(section => {
      section.classList.add('is-path-visible');
    });
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const section = entry.target.matches('.has-section-path')
          ? entry.target
          : entry.target.closest('.has-section-path');
        section?.classList.add('is-path-visible');
      });
    },
    { rootMargin: '0px 0px -50% 0px', threshold: 0 }
  );
  document
    .querySelectorAll('.has-section-path')
    .forEach(element => observer.observe(element));
}

function initializeParallax() {
  const section = document.querySelector('#environment');
  if (!section || reducedMotion) return;
  const layers = [...section.querySelectorAll('[data-parallax]')];
  let frame = 0;
  const update = () => {
    const rect = section.getBoundingClientRect();
    const progress = (innerHeight - rect.top) / (innerHeight + rect.height);
    layers.forEach(layer => {
      layer.style.transform = `translate3d(0, ${(progress - 0.5) * Number(layer.dataset.parallax)}px, 0)`;
    });
    frame = 0;
  };
  const requestUpdate = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate);
}

function initializeEnvironmentImagePreload() {
  const section = document.querySelector('#environment');
  if (!section) return;
  const galleryImages = [
    ...section.querySelectorAll('.env-gallery img[loading="lazy"]'),
  ];
  const sliderImages = [
    ...section.querySelectorAll('.env-slider img[loading="lazy"]'),
  ];

  const preloadImages = images => {
    images.forEach(image => {
      image.loading = 'eager';
      image.fetchPriority = 'high';
      const picture = image.closest('picture');
      picture?.querySelectorAll('source[srcset]').forEach(source => {
        source
          .getAttribute('srcset')
          ?.split(',')
          .forEach(candidate => {
            const url = candidate.trim().split(/\s+/)[0];
            if (url) preloadImage(new URL(url, document.baseURI).href);
          });
      });
      if (image.currentSrc || image.src)
        preloadImage(image.currentSrc || image.src);
    });
  };
  preloadImages(sliderImages);
  if (!galleryImages.length) return;

  if (!('IntersectionObserver' in window)) {
    preloadImages(galleryImages);
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      preloadImages(galleryImages);
      observer.disconnect();
    },
    { rootMargin: '900px 0px', threshold: 0 }
  );
  observer.observe(section);
}

async function initializeParticles() {
  const host = document.querySelector('.kv-particles');
  if (!host) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'particle-canvas';
  host.append(canvas);

  let vertexShader = fallbackVertexShader;
  let fragmentShader = fallbackFragmentShader;
  try {
    [vertexShader, fragmentShader] = await Promise.all([
      fetch('assets/shader/particles.vert?v=particle-size-5').then(response => {
        if (!response.ok) throw new Error('Vertex shader could not be loaded');
        return response.text();
      }),
      fetch('assets/shader/particles.frag?v=particle-size-5').then(response => {
        if (!response.ok)
          throw new Error('Fragment shader could not be loaded');
        return response.text();
      }),
    ]);
  } catch {
    // Direct file previews can block fetch(). The embedded copies keep the KV
    // animation available while hosted pages continue using /assets/shader.
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#fffdef', 8, 15);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  camera.position.z = 8;

  const count = innerWidth < 768 ? 48 : 96;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const scales = new Float32Array(count);
  const palette = ['#f6a9b8', '#f8d98a', '#a9d8c8', '#9fc9ee', '#f7c8a6'].map(
    color => new THREE.Color(color)
  );
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.8 + Math.random() * 3.3;
    positions.set(
      [
        Math.cos(angle) * radius * 1.2,
        Math.sin(angle) * radius * 0.62,
        (Math.random() - 0.5) * 4.5,
      ],
      i * 3
    );
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.05 + Math.random() * 0.12;
    scales[i] = 0.06 + Math.random() * 0.14;
    const color = palette[Math.floor(Math.random() * palette.length)];
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
    uSizeMultiplier: { value: 1 },
  };
  const aboutSection = document.querySelector('#about');
  let targetSizeMultiplier = 1;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geometry, material));

  [[3.75, -2.25, -0.4, '#f6a9b8', 0.11]].forEach(([x, y, z, color, size]) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 24, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
  });

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const updateSizeMultiplier = () => {
    // Keep the particle scale constant. The previous scroll-triggered burst
    // drew attention to the animation itself, which the brief asks to avoid.
    targetSizeMultiplier = 1;
  };
  addEventListener('resize', resize);
  addEventListener('scroll', updateSizeMultiplier, { passive: true });
  addEventListener('resize', updateSizeMultiplier);
  addEventListener(
    'pointermove',
    event => {
      uniforms.uPointer.value.set(
        (event.clientX / innerWidth - 0.5) * 0.14,
        -(event.clientY / innerHeight - 0.5) * 0.08
      );
    },
    { passive: true }
  );
  resize();
  updateSizeMultiplier();

  const clock = new THREE.Clock();
  let frameId = null;
  let onScreen = true;
  let contextLost = false;
  const shouldRun = () => onScreen && !document.hidden && !contextLost;

  const stop = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
  const render = () => {
    frameId = null;
    if (!shouldRun()) return;
    uniforms.uTime.value = reducedMotion ? 0 : clock.getElapsedTime();
    uniforms.uSizeMultiplier.value +=
      (targetSizeMultiplier - uniforms.uSizeMultiplier.value) * 0.08;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };
  const start = () => {
    if (frameId === null && shouldRun()) frameId = requestAnimationFrame(render);
  };

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  new IntersectionObserver(
    entries => {
      onScreen = entries.some(entry => entry.isIntersecting);
      if (onScreen) start();
      else stop();
    },
    { threshold: 0 }
  ).observe(host);

  start();
}

function initializeScrollReveal() {
  const selectors = [
    '.section-header',
    '.about-copy',
    '.about-figure',
    '.product-figure',
    '.product-body',
    '.interview-card',
    '.keyword-featured',
    '.keyword-card',
    '.welfare-card',
    '.flow-card',
    '.faq-item',
    '.env-copy',
    '.env-gallery-photo',
    '.env-grid-item',
    '.env-feature-card',
    '.entry-inner',
  ];
  const items = [...document.querySelectorAll(selectors.join(','))];
  if (!items.length) return;

  if (reducedMotion) {
    items.forEach(element => element.classList.add('reveal', 'is-visible'));
    return;
  }

  items.forEach(element => element.classList.add('reveal'));
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        const parent = element.parentElement;
        const group = parent
          ? [...parent.children].filter(child =>
              child.classList.contains('reveal')
            )
          : [element];
        const index = Math.max(0, group.indexOf(element));
        element.style.transitionDelay = `${Math.min(index, 6) * 80}ms`;
        element.classList.add('is-visible');
        obs.unobserve(element);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );
  items.forEach(element => observer.observe(element));
}

const kvDecorReady = initializeKvRandomDecor();
initializeLoadingScreen([kvDecorReady]);
initializeMenu();
initializeAccordions();
initializeTabsAndKeywords();
initializeParallax();
initializeScrollReveal();
initializeEnvironmentImagePreload();
initializeParticles();
