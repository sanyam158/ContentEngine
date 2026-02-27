/**
 * =============================================================================
 * Noise2Article — Master Image Prompts (Style-First, Not Subject-First)
 * =============================================================================
 *
 * Expanded style system with 12 distinct visual directions and a powerful
 * AI art director that derives visual metaphors from article content.
 *
 * Styles:
 *   A) Retro-Futurist Collage — deep dives, complex topics
 *   B) Editorial Vector Illustration — opinion pieces, hot takes
 *   C) Modern Minimalist & UI — tutorials, serious tech news
 *   D) Isometric Tech Diorama — architecture, systems, infrastructure
 *   E) Risograph Print — indie/OSS, community, grassroots topics
 *   F) Botanical Tech Fusion — AI/ML, organic growth, emergence
 *   G) Blueprint Schematic — protocols, specs, low-level engineering
 *   H) Ink Wash Painting — philosophy, ethics, big-picture pieces
 *   Auto) AI art director — Gemini analyzes topic and writes unique prompt
 *
 * =============================================================================
 */

import type { GoogleGenAI } from '@google/genai';

export type ImagePromptStrategy = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'auto';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Strategy A: Retro-Futurist Collage */
function buildStrategyA(title: string): string {
  const backgrounds = [
    'Aged graph paper with handwritten notes and gritty halftone dots. Vaporwave gradient mesh in corners.',
    'Old newspaper halftone print. Faded blueprint grid with neon pink and cyan bands at edges.',
    'Aged parchment with engraved line work. Heavy film grain, deep magenta and electric blue wash.',
    'Creased kraft paper texture with risograph-style overprint artifacts and scan line distortion.',
  ];
  const subjects = [
    'A classical marble bust modified with glowing fiber optic cables threading through cracks, one eye replaced by a camera lens.',
    'A vintage radio tower morphing into a neural network diagram, signals rendered as flowing data particles.',
    'An antique compass overlaid with a holographic star map, navigation meets computation.',
    'A mechanical typewriter with keys that transform into microchips, ribbon producing binary code.',
  ];
  const palettes = [
    'Cyan (#00BCD4), magenta (#E91E63), deep yellow (#FFC107), and black.',
    'Electric blue (#2979FF), hot pink (#FF4081), acid yellow (#EEFF41), black.',
    'Teal (#009688), coral (#FF7043), gold (#FFD54F), and black with halftone texture.',
    'Vermillion (#E53935), sea green (#26A69A), cream (#FFF8E1), and charcoal (#37474F).',
  ];
  return `Mixed media collage illustration, 16:9. Juxtaposition of vintage and cyberpunk aesthetics.
Background: ${pick(backgrounds)}
Subject: ${pick(subjects)}
The headline text in the image reads: "${title}".
Color palette: ${pick(palettes)} Overall feel: intellectual, chaotic, surreal.`;
}

/** Strategy B: Editorial Vector Illustration */
function buildStrategyB(title: string): string {
  const colorSchemes = [
    'Vermillion red (#E53935) and cream (#FFF8E1) with black accents',
    'Electric blue (#2979FF) and mustard yellow (#F9A825) with black outlines',
    'Coral (#FF7043) and mint (#80CBC4) with charcoal accents',
    'Burnt orange (#E65100) and slate blue (#5C6BC0) with ivory background',
    'Forest green (#2E7D32) and hot pink (#F50057) with off-white',
  ];
  const metaphors = [
    'A giant magnifying glass revealing hidden layers beneath a surface, each layer showing different complexity',
    'A tightrope walker balancing between two towering stacks of different technologies',
    'A massive key unlocking a door that opens into a sprawling landscape of connected systems',
    'Hands assembling a complex puzzle where each piece is a different technology or concept',
    'A fork in a road where each path is lined with different tech iconography',
  ];
  return `Bold editorial illustration for a magazine header, 16:9. Style: thick black outlines, flat color blocks, hand-drawn vector art feel.
Central metaphor: ${pick(metaphors)}, relating to the topic "${title}".
The headline text in bold hand-drawn block letters: "${title}".
Colors: ${pick(colorSchemes)}. No realistic shading, only flat fills. No photorealism.`;
}

/** Strategy C: Modern Minimalist */
function buildStrategyC(title: string): string {
  const gradients = [
    'deep indigo (#1A237E) transitioning to emerald (#00C853), aurora-like',
    'midnight charcoal (#212121) to warm amber (#FF8F00), like a sunset horizon',
    'deep teal (#004D40) to soft lavender (#B39DDB), underwater bioluminescence',
    'rich burgundy (#880E4F) to slate grey (#546E7A), sophisticated and moody',
  ];
  const shapes = [
    'a precise wireframe polyhedron slowly rotating, edges catching soft light',
    'concentric circles with subtle data visualization patterns, like ripples in water',
    'a minimal line drawing of an abstract machine or mechanism, white on dark',
    'floating geometric fragments that suggest a deconstructed interface or dashboard',
  ];
  return `Sleek, ultra-modern tech header, 16:9. Clean, premium, minimalist aesthetic.
Background: Smooth abstract gradient of ${pick(gradients)}.
Center-left: Clean bold white sans-serif text reading: "${title}".
Right side: ${pick(shapes)}.
Mood: Expensive, precise, futuristic. No logos, no realistic people, no clutter.`;
}

/** Strategy D: Isometric Tech Diorama */
function buildStrategyD(title: string): string {
  const scenes = [
    'A miniature server room with tiny glowing racks, cooling pipes, and blinking status lights, viewed from above at 30-degree isometric angle.',
    'A cross-section of a multi-layered tech ecosystem: cloud layer on top, API layer in middle, database layer at bottom, all connected by tiny flowing data particles.',
    'A small workshop desk with miniature screens, keyboards, tools, and a robotic arm assembling something intricate.',
    'A tiny city block where every building is a different software component — a database tower, an API gateway bridge, a load balancer roundabout.',
  ];
  const palettes = [
    'Soft pastels: sky blue (#90CAF9), peach (#FFAB91), mint (#A5D6A7), warm cream background.',
    'Rich warm tones: terracotta (#D84315), golden oak (#F57F17), forest green (#1B5E20), warm grey (#BDBDBD).',
    'Cool tech: slate blue (#546E7A), electric cyan (#00E5FF), soft white (#FAFAFA), charcoal shadow (#263238).',
  ];
  return `Isometric 3D diorama illustration, 16:9. Tilt-shift miniature world with warm directional lighting casting soft shadows.
Scene: ${pick(scenes)}
The headline text overlaid cleanly at the top: "${title}".
Palette: ${pick(palettes)}. Everything has a handcrafted, tactile quality.`;
}

/** Strategy E: Risograph Print */
function buildStrategyE(title: string): string {
  const colorCombos = [
    'Fluorescent pink (#FF6EC7) and teal (#008B8B) with deliberate misregistration between layers',
    'Bright orange (#FF6D00) and ultramarine (#1565C0) with visible grain and dot patterns',
    'Olive green (#827717) and burgundy (#880E4F) with halftone textures throughout',
    'Golden yellow (#F9A825) and deep violet (#4A148C) with offset printing artifacts',
  ];
  const subjects = [
    'Bold geometric shapes — triangles, circles, rectangles — arranged in a dynamic asymmetric composition suggesting motion and progress.',
    'A stylized hand reaching toward or interacting with abstract tech symbols, rendered in chunky simplified forms.',
    'Overlapping transparent shapes creating new colors at intersections, suggesting convergence and synthesis.',
    'A simplified landscape of mountains or waves made from geometric blocks, representing data or knowledge layers.',
  ];
  return `Risograph-style print illustration, 16:9. Grainy texture, limited color palette, zine aesthetic, visible print artifacts.
Composition: ${pick(subjects)}
The title "${title}" in bold, slightly rough-edged sans-serif type.
Colors: ${pick(colorCombos)}. Deliberately imperfect, tactile, indie feel.`;
}

/** Strategy F: Botanical Tech Fusion */
function buildStrategyF(title: string): string {
  const fusions = [
    'Circuit board traces growing and branching like ivy vines, with LED lights blooming like flowers at junction points.',
    'A tree whose roots are fiber optic cables and whose leaves are solar panels, trunk made of stacked server components.',
    'Mushroom network (mycelium) rendered as a neural network, with data packets flowing through organic pathways.',
    'Coral reef structure where each coral form is a different data structure — stacks, queues, trees — teeming with small glowing fish-like data points.',
  ];
  const palettes = [
    'Deep forest green (#1B5E20), electric emerald (#00E676), warm amber (#FFB300), dark earth (#3E2723).',
    'Moss (#558B2F), copper (#BF360C), cream (#FFF8E1), deep water blue (#0D47A1).',
    'Sage (#689F38), rose gold (#FFAB91), midnight (#1A237E), ivory (#FAFAFA).',
  ];
  return `Botanical-tech fusion illustration, 16:9. Nature merging with technology in an organic, beautiful way.
Subject: ${pick(fusions)}
The title "${title}" integrated elegantly into the composition.
Palette: ${pick(palettes)}. Mood: growth, emergence, harmony between organic and digital.`;
}

/** Strategy G: Blueprint Schematic */
function buildStrategyG(title: string): string {
  const subjects = [
    'A detailed technical drawing of an abstract machine that represents the article concept — with callout labels, measurement lines, and section views.',
    'An exploded view diagram showing the layers of a system being pulled apart to reveal inner workings, each layer labeled.',
    'A flow diagram rendered as an architectural blueprint, with precise lines showing how components connect and data moves.',
    'A cross-section of something complex — like a submarine or space station — but every component is a tech concept.',
  ];
  const styles = [
    'White lines on deep Prussian blue (#1A237E) background, with subtle grid lines and compass marks.',
    'Cream/sepia lines on dark navy (#0D1B2A), like a vintage engineering drawing with aged paper texture at edges.',
    'Bright cyan (#00BCD4) lines on near-black (#121212), modern CAD aesthetic with neon accent highlights.',
  ];
  return `Technical blueprint schematic, 16:9. Engineering drawing aesthetic with precise lines and annotations.
Subject: ${pick(subjects)}
The title "${title}" rendered in a clean monospace or technical font.
Style: ${pick(styles)}. Mood: precision, intelligence, depth of understanding.`;
}

/** Strategy H: Ink Wash Painting */
function buildStrategyH(title: string): string {
  const subjects = [
    'A mountain landscape where peaks dissolve into abstract data streams, painted with flowing ink gradients and deliberate negative space.',
    'A solitary figure (silhouette only) contemplating a vast expanse that transitions from natural landscape to digital grid, brush strokes visible.',
    'Flowing water that transforms into flowing code or data, rendered in expressive brush strokes with ink pooling effects.',
    'A bamboo grove where each stalk is a different thickness representing different data dimensions, wind-bent and dynamic.',
  ];
  const palettes = [
    'Traditional sumi-e: black ink gradients from deepest black to pale grey, with a single accent of vermillion red (#E53935).',
    'Modern ink wash: charcoal (#37474F) to light grey (#ECEFF1), accented with indigo (#283593) and gold leaf (#FFD54F).',
    'Warm ink: sepia (#795548) to cream (#FFF8E1), with a single stroke of teal (#00897B).',
  ];
  return `Ink wash painting style, 16:9. Expressive brush strokes, flowing ink gradients, deliberate negative space.
Subject: ${pick(subjects)}
The title "${title}" rendered in elegant calligraphic or clean serif type.
Palette: ${pick(palettes)}. Mood: contemplative, philosophical, timeless.`;
}

export function buildMasterPrompt(title: string, strategy: ImagePromptStrategy): string {
  switch (strategy) {
    case 'A': return buildStrategyA(title);
    case 'B': return buildStrategyB(title);
    case 'C': return buildStrategyC(title);
    case 'D': return buildStrategyD(title);
    case 'E': return buildStrategyE(title);
    case 'F': return buildStrategyF(title);
    case 'G': return buildStrategyG(title);
    case 'H': return buildStrategyH(title);
    case 'auto': return buildStrategyC(title); // Caller should use generateCreativePrompt for 'auto'
    default: return buildStrategyC(title);
  }
}

export const STRATEGY_LABELS: Record<ImagePromptStrategy, string> = {
  A: 'Retro-Futurist Collage (deep dives, complex topics)',
  B: 'Editorial Vector Illustration (opinion pieces, hot takes)',
  C: 'Modern Minimalist & UI (tutorials, serious tech news)',
  D: 'Isometric Tech Diorama (architecture, systems, infrastructure)',
  E: 'Risograph Print (indie/OSS, community, grassroots)',
  F: 'Botanical Tech Fusion (AI/ML, organic growth, emergence)',
  G: 'Blueprint Schematic (protocols, specs, engineering)',
  H: 'Ink Wash Painting (philosophy, ethics, big-picture)',
  auto: 'Auto (AI art director analyzes topic and creates unique prompt)',
};

const ART_DIRECTOR_SYSTEM = `You are a senior art director for a premium tech/AI media publication (think: Stripe's blog design quality, Vercel's aesthetic, or The Pudding's data storytelling). Your job: analyze an article title, understand its core tension/concept, and write a single detailed image generation prompt.

PROCESS (internal, do not output):
1. What is this article REALLY about? Not surface level — the deeper concept.
2. What VISUAL METAPHOR captures that concept? (e.g., "scaling databases" → geological layers being drilled through; "open source sustainability" → a lone gardener tending a massive forest)
3. Which art style from the palette below best fits the MOOD of this article?
4. Write the prompt with extreme specificity: exact colors, exact composition, exact textures.

STYLE PALETTE — pick ONE and go deep:
1. Retro-futurist collage: halftone dots, vaporwave gradients, classical sculpture + tech mashup, aged paper textures, cyan/magenta/yellow
2. Bold editorial vector: thick black outlines, flat color blocks, hand-drawn feel, magazine cover energy, visual metaphor as centerpiece
3. Modern minimalist: deep smooth gradients, single abstract geometric element, typography-led, negative space, premium tech
4. Isometric diorama: 3D miniature scene viewed from above, warm lighting, tiny detailed objects, tilt-shift depth, handcrafted feel
5. Risograph print: limited 2-3 color palette, deliberate misregistration, halftone grain, zine aesthetic, chunky shapes
6. Botanical tech fusion: organic plant/nature forms merging with circuits/tech, growth metaphor, nature meets machine
7. Blueprint schematic: white/cyan lines on deep blue/black, technical drawing aesthetic, annotations, exploded views
8. Ink wash painting: flowing brush strokes, ink gradients, negative space, East Asian painting influence, contemplative mood
9. Woodblock print: bold black outlines, limited flat fills, Japanese ukiyo-e influenced but with modern/tech subjects
10. Paper cut layers: multi-layered paper cutout effect, sharp shadows between layers, depth through layering, craft aesthetic
11. Glitch art: RGB channel splitting, databent visuals, scan line corruption, digital decay as intentional aesthetic
12. Neon noir: deep matte black, selective neon glow in 1-2 specific colors, cinematic shadows, moody atmosphere

ABSOLUTE RULES:
- The image MUST be about the article's actual topic. Derive visuals from the title.
- Name SPECIFIC colors (hex codes or precise names like "burnt sienna", not "vibrant colors")
- Describe EXACT composition: what is where, foreground/midground/background
- Include 2-3 specific visual elements that relate to the article topic
- 16:9 aspect ratio, article header format

FORBIDDEN — never do any of these:
- Photorealistic 3D orbs/spheres floating in empty white/dark rooms
- Generic purple-on-black with glowing particles (the #1 AI image cliché)
- Random hexagons, honeycombs, or floating geometric shapes with no meaning
- Vague "futuristic cityscape" or "digital landscape" with no specificity
- Silhouette of a person standing before a giant screen/portal (overused)
- Circuit board patterns used as generic "tech" background
- Brain illustrations with glowing neurons (AI cliché)
- Earth/globe with network connections overlaid (stock photo territory)
- Generic gradient blurs with no subject or focal point
- Any composition you've likely generated before — push for something NEW

OUTPUT: A single image prompt. No preamble, no explanation, no markdown formatting.`;

const STYLE_HINTS = [
  'Choose between isometric diorama, paper cut layers, or risograph print.',
  'Choose between bold editorial vector, woodblock print, or neon noir.',
  'Choose between botanical tech fusion, ink wash painting, or blueprint schematic.',
  'Choose between retro-futurist collage, glitch art, or modern minimalist.',
  'Choose between paper cut layers, isometric diorama, or ink wash painting.',
  'Choose between neon noir, risograph print, or botanical tech fusion.',
  'Choose between woodblock print, blueprint schematic, or bold editorial vector.',
  'Choose between glitch art, retro-futurist collage, or paper cut layers.',
];

/**
 * Uses Gemini 3 Pro to generate a unique image prompt for the given title (and optional hook).
 * The returned prompt always includes the title for the image model.
 */
export async function generateCreativePrompt(
  gemini: GoogleGenAI,
  title: string,
  hook?: string
): Promise<string> {
  const styleHint = pick(STYLE_HINTS);
  const userContent = hook
    ? `Article title: "${title}"
Hook: ${hook.slice(0, 250)}

Style direction: ${styleHint}

Analyze this article's core concept. Find a visual metaphor that captures it (NOT a literal depiction). Write a highly specific image prompt with exact colors, composition, and style. The system will pass this directly to an image generation model.`
    : `Article title: "${title}"

Style direction: ${styleHint}

Analyze this article's core concept. Find a visual metaphor that captures it (NOT a literal depiction). Write a highly specific image prompt with exact colors, composition, and style. The system will pass this directly to an image generation model.`;

  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ role: 'user', parts: [{ text: `${ART_DIRECTOR_SYSTEM}\n\n${userContent}` }] }],
    config: { temperature: 0.92, maxOutputTokens: 700 },
  });

  const generated = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (!generated) throw new Error('Art director returned no prompt');

  return `Article header image, 16:9. The headline text in the image must read exactly: "${title}".\n\n${generated}`;
}
