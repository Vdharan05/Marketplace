/**
 * AI Listing Optimizer
 * Uses Claude to analyze and optimize listings for each platform's algorithm.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const PLATFORM_GUIDES = {
  amazon: `
Amazon India (A9/A10 Algorithm) best practices:
- Title: ≤200 chars. Format: Brand + Product Name + Key Feature + Material + Size/Color/Qty
- Mobile truncation at 80 chars — put main keyword + brand first
- 5 bullet points: Start each with CAPS keyword phrase. Focus on benefits, not just features.
- Backend keywords: No repetition, no punctuation needed, include synonyms, misspellings, Hindi equivalents
- Description: Use storytelling, target emotional benefits, ≤2000 chars
- A9 rewards: conversion rate, relevant keywords, good images, low returns, Prime eligibility
- Category keywords improve search ranking — include sub-category terms
- Price competitiveness affects Buy Box algorithm
`,
  amazon_vendor: `
Amazon Vendor Central best practices:
- Same A9/A10 algorithm as Seller Central but vendor-specific optimizations
- Retail-readiness score matters — complete all attributes
- Focus on brand consistency and premium positioning
- Bundle opportunities increase AMS (Amazon Marketing Services) efficiency
- Vendor negotiates retail price — focus on MSRP framing
- Enhanced Brand Content (EBC/A+) is critical for vendor listings
- NIS (Net In Stock) rate affects search ranking — ensure stable supply
`,
  flipkart: `
Flipkart Search Algorithm best practices:
- Title: ≤100 chars, Brand + Product + Key Specs + Color/Size
- Key features: 6 bullet points, crisp, specific specs and benefits
- Include FSS (Flipkart Smart Store) compatible content
- Category-specific mandatory attributes must be filled
- Flipkart favors competitive pricing + fast delivery for ranking
- Use Flipkart's suggested keywords from Seller Hub
- Description: ≤2000 chars, focus on Indian buyer concerns (durability, value)
- Main image must be white background (Flipkart policy)
- Higher-rated sellers get search boost
`,
  meesho: `
Meesho Platform best practices:
- Catalog name: Simple, clear, reseller-friendly (resellers are your customers)
- Description: Explain why resellers should pick this — profit potential, trending item, popular
- Price: Set low enough for resellers to add their margin (typically 20-40% on top)
- Highlight: Quick delivery, easy returns, quality assurance — resellers care about this
- Images: Multiple angles, clear product, include size chart for clothing
- Catalog should ideally include color/size variants for maximum reach
- Avoid brand names unless licensed — resellers prefer generic descriptors
- Trending keywords in Meesho: "latest", "trending", "best seller", "aesthetic"
`,
  shopify: `
Shopify SEO & Conversion best practices:
- SEO Title: ≤60 chars, primary keyword first, include brand
- SEO Meta Description: ≤160 chars, include call-to-action, keyword-rich
- Product URL handle: lowercase, hyphens, keyword-focused (no stop words)
- Tags: Use for collections, filtering, and internal search (10-15 relevant tags)
- Body content: Include H2/H3 structure, FAQ section for SEO
- Schema markup: Product, Review, Breadcrumb types improve SERP appearance
- Google Shopping: Ensure Google product category, GTIN/MPN if available
- Conversion: Social proof language, scarcity indicators, clear CTAs
- Page speed impacts SEO — optimize image sizes
`,
};

const SCORE_CRITERIA = {
  amazon: ["Title keyword optimization", "Bullet point quality", "Description completeness", "Backend keywords", "Image count", "Price competitiveness"],
  amazon_vendor: ["Retail-readiness", "Brand content", "Attribute completeness", "Bundle potential"],
  flipkart: ["Title clarity", "Key features specificity", "Category attributes", "Pricing vs competition"],
  meesho: ["Reseller appeal", "Catalog clarity", "Price margin potential", "Image quality"],
  shopify: ["SEO title", "Meta description", "Tags relevance", "URL structure", "Content depth"],
};

async function callClaude(prompt, apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  // FIX BUG 3: Guard against missing key with a clear error message
  if (!key) {
    throw new Error("Anthropic API key not set. Add ANTHROPIC_API_KEY to .env or pass anthropic_key in the request body.");
  }

  // FIX BUG 3: Add AbortController timeout so the request doesn't hang indefinitely
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Claude API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.content?.map((c) => c.text || "").join("") || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Optimize a listing for a specific platform.
 * Returns structured optimization data.
 */
export async function optimizeForPlatform(product, platform, apiKey) {
  const guide = PLATFORM_GUIDES[platform] || "";
  const criteria = SCORE_CRITERIA[platform] || [];

  const prompt = `You are a world-class e-commerce listing optimizer for Indian marketplaces, specializing in ${platform}.

${guide}

Analyze and optimize this product listing for maximum sales and visibility on ${platform}:

CURRENT LISTING:
Title: ${product.title || "(empty)"}
Brand: ${product.brand || "(empty)"}
Category: ${product.category || "(empty)"}
Description: ${product.description || "(empty)"}
Bullet 1: ${product.bullet1 || "(empty)"}
Bullet 2: ${product.bullet2 || "(empty)"}
Bullet 3: ${product.bullet3 || "(empty)"}
Price: ₹${product.price || "0"}
MRP: ₹${product.mrp || "0"}
Keywords: ${product.keywords || "(empty)"}
Weight: ${product.weight || ""}g

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "score": <0-100 integer>,
  "score_breakdown": {
    ${criteria.map(c => `"${c}": <0-20 integer>`).join(",\n    ")}
  },
  "optimized": {
    "title": "<optimized title>",
    "bullet1": "<optimized bullet 1 — start with key benefit, be specific>",
    "bullet2": "<optimized bullet 2>",
    "bullet3": "<optimized bullet 3>",
    "description": "<optimized description, 100-200 words>",
    "keywords": "<comma-separated optimized keywords, 15-20 terms, include Hindi alternatives>"
  },
  "recommendations": [
    {"type": "critical", "field": "title", "current": "<current value>", "issue": "<what's wrong>", "fix": "<specific fix>"},
    {"type": "warning", "field": "description", "current": "<current value>", "issue": "<what's wrong>", "fix": "<specific fix>"},
    {"type": "tip", "field": "keywords", "current": "<current value>", "issue": "<what's missing>", "fix": "<what to add>"},
    {"type": "tip", "field": "images", "current": "N/A", "issue": "<image gap>", "fix": "<what images to add>"},
    {"type": "tip", "field": "pricing", "current": "₹${product.price}", "issue": "<pricing observation>", "fix": "<pricing strategy>"}
  ],
  "platform_insights": "<2-3 sentences about this platform's specific algorithm/buyer behavior relevant to this product>",
  "estimated_improvement": "<e.g. '20-35% more impressions, 15% higher CTR'>",
  "ab_test_suggestion": "<one specific A/B test to run on this platform>"
}`;

  const raw = await callClaude(prompt, apiKey);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/**
 * Generate an optimal image prompt for AI image generation.
 */
export async function generateImagePrompt(product, imageType, platform, apiKey) {
  const typeGuides = {
    white_bg: "Professional product photography on pure white background (#FFFFFF). Even lighting, no shadows, product centered, high detail.",
    lifestyle: "Product in natural use environment. Real people, authentic setting, warm lighting, aspirational but relatable for Indian consumers.",
    size_reference: "Product next to common reference objects (ruler, A4 paper, hand, coin) to clearly show scale. Clean background.",
    infographic: "Product with labeled feature callouts and benefit icons. Clean, modern infographic style. Text areas visible.",
    comparison: "Side-by-side comparison chart style. Product vs generic/competitor. Clear visual checkmarks for advantages.",
    aplus_hero: "Full-width lifestyle banner image. Product as hero. Premium feel. Brand colors. Space for text overlay on sides.",
    aplus_feature: "Three-column product feature highlight layout. Each column shows one key feature with product detail shot.",
    aplus_brand: "Brand story visual. Artisan/quality/heritage feel. Behind-the-scenes or craftsmanship narrative.",
    size_chart: "Clean size/dimension chart infographic. Measurements clearly labeled. Neutral background.",
    packaging: "Product packaging detail shot. Unboxing feel. Shows what customer receives.",
  };

  const prompt = `You are an expert product photography art director for Indian e-commerce (${platform}).

Product: ${product.title}
Category: ${product.category}
Brand: ${product.brand || "Generic"}
Key features: ${[product.bullet1, product.bullet2, product.bullet3].filter(Boolean).join("; ")}

Create an optimized image generation prompt for a "${imageType}" type image.
Style guide: ${typeGuides[imageType] || "Professional e-commerce product image"}

Return ONLY valid JSON:
{
  "prompt": "<detailed Stable Diffusion / DALL-E prompt, 50-100 words, technically specific>",
  "negative_prompt": "<things to avoid in the image>",
  "style_notes": "<1-2 sentences on style direction>",
  "usage": "<where this image should be used in the listing>",
  "platform_spec": "<specific dimension/format requirement for ${platform}>"
}`;

  const raw = await callClaude(prompt, apiKey);
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

/**
 * Generate A+ content layout plan.
 */
export async function generateAplusLayout(product, platform, apiKey) {
  const prompt = `You are an expert A+ Content strategist for ${platform === "amazon" ? "Amazon India" : "Flipkart"} Enhanced Content.

Product: ${product.title}
Category: ${product.category}
Brand: ${product.brand}
Description: ${product.description}
Key Features: ${[product.bullet1, product.bullet2, product.bullet3].filter(Boolean).join(" | ")}

Design a complete A+ Content layout with 5 modules. Return ONLY valid JSON:
{
  "modules": [
    {
      "type": "hero_banner",
      "headline": "<compelling hero headline, ≤50 chars>",
      "subheadline": "<supporting text, ≤100 chars>",
      "image_prompt": "<image generation prompt for this module>",
      "layout": "full_width"
    },
    {
      "type": "feature_trio",
      "headline": "<section headline>",
      "features": [
        {"icon_suggestion": "<emoji or icon type>", "title": "<feature title>", "text": "<50 words>"},
        {"icon_suggestion": "<emoji>", "title": "<feature title>", "text": "<50 words>"},
        {"icon_suggestion": "<emoji>", "title": "<feature title>", "text": "<50 words>"}
      ],
      "image_prompt": "<module image prompt>"
    },
    {
      "type": "lifestyle",
      "headline": "<lifestyle headline>",
      "body": "<lifestyle narrative, 80 words>",
      "image_prompt": "<lifestyle image generation prompt>",
      "layout": "image_left"
    },
    {
      "type": "comparison",
      "headline": "Why Choose ${product.brand || "Our Product"}?",
      "rows": [
        {"attribute": "<key attr>", "ours": "<our advantage>", "generic": "<competitor weakness>"},
        {"attribute": "<key attr>", "ours": "<our advantage>", "generic": "<competitor weakness>"},
        {"attribute": "<key attr>", "ours": "<our advantage>", "generic": "<competitor weakness>"}
      ]
    },
    {
      "type": "brand_story",
      "headline": "<brand story headline>",
      "story": "<brand narrative, 100 words, focus on quality/heritage/mission>",
      "image_prompt": "<brand story image prompt>",
      "layout": "image_right"
    }
  ],
  "color_scheme": "<suggested brand color palette>",
  "font_suggestion": "<typography direction>",
  "overall_strategy": "<2-3 sentences on A+ content strategy for this product>"
}`;

  const raw = await callClaude(prompt, apiKey);
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}
