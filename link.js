/**
 * SKU Link routes
 *
 * GET    /api/links              — list all links
 * POST   /api/links              — add/update a manual link entry
 * DELETE /api/links/:sku         — delete a SKU link entirely
 * DELETE /api/links/:sku/:platform — remove one platform from a link
 * POST   /api/links/auto-scan    — auto-detect matching SKUs across platforms
 * POST   /api/links/sync         — sync a linked listing from source to all linked targets
 */

import { Router } from "express";
import {
  getAllLinks,
  getLinkBySku,
  addPlatformToLink,
  removePlatformFromLink,
  deleteLink,
  autoLink,
} from "../utils/skuLinker.js";
import { pullFromAmazon } from "../services/puller/amazon.js";
import { pullFromAmazonVendor } from "../services/puller/amazonVendor.js";
import { pullFromFlipkart } from "../services/puller/flipkart.js";
import { pullFromMeesho } from "../services/puller/meesho.js";
import { pullFromShopify } from "../services/puller/shopify.js";
import { listOnAmazon } from "../services/amazon.js";
import { listOnAmazonVendor } from "../services/amazonVendor.js";
import { listOnFlipkart } from "../services/flipkart.js";
import { listOnMeesho } from "../services/meesho.js";
import { listOnShopify } from "../services/shopify.js";

const router = Router();

const PULLERS = { amazon: pullFromAmazon, amazon_vendor: pullFromAmazonVendor, flipkart: pullFromFlipkart, meesho: pullFromMeesho, shopify: pullFromShopify };
const LISTERS = { amazon: listOnAmazon, amazon_vendor: listOnAmazonVendor, flipkart: listOnFlipkart, meesho: listOnMeesho, shopify: listOnShopify };

// GET /api/links
router.get("/", (req, res) => {
  res.json({ links: getAllLinks(), count: getAllLinks().length });
});

// POST /api/links — Add a manual platform→SKU link (BEFORE /:sku routes)
// Body: { sku, platform, platform_id, title }
router.post("/", (req, res) => {
  const { sku, platform, platform_id, title } = req.body;
  if (!sku || !platform || !platform_id) {
    return res.status(400).json({ error: "sku, platform, and platform_id are required." });
  }
  const link = addPlatformToLink(sku, platform, platform_id, title || "", false);
  res.json({ success: true, link });
});

// FIX BUG 14: Named POST routes MUST come before /:sku param routes to avoid Express matching
// "auto-scan" and "sync" as :sku values.

/**
 * POST /api/links/auto-scan
 */
router.post("/auto-scan", async (req, res, next) => {
  try {
    const { credentials = {} } = req.body;

    const platformListings = await Promise.all(
      Object.entries(PULLERS).map(async ([platform, puller]) => {
        const creds = credentials[platform];
        if (!creds) return { platform, listings: [] };
        try {
          const listings = await puller(creds);
          return { platform, listings: listings.map((l) => ({ sku: l.sku, platform_id: l.platform_id, title: l.title })) };
        } catch {
          return { platform, listings: [] };
        }
      })
    );

    const result = autoLink(platformListings);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/links/sync
 */
router.post("/sync", async (req, res, next) => {
  try {
    const { sku, source_platform, credentials = {} } = req.body;
    if (!sku || !source_platform) {
      return res.status(400).json({ error: "sku and source_platform are required." });
    }

    const link = getLinkBySku(sku);
    if (!link) return res.status(404).json({ error: "SKU not linked. Add a link first." });

    const puller = PULLERS[source_platform];
    if (!puller) return res.status(400).json({ error: `No puller for ${source_platform}` });

    const sourceCreds = credentials[source_platform] || {};
    const sourceListings = await puller(sourceCreds);
    const product = sourceListings.find((l) => l.sku === sku);
    if (!product) return res.status(404).json({ error: `SKU ${sku} not found on ${source_platform}` });

    const targets = Object.keys(link.platforms).filter((p) => p !== source_platform);
    const syncResults = await Promise.allSettled(
      targets.map(async (platform) => {
        const lister = LISTERS[platform];
        if (!lister) throw new Error(`No lister for ${platform}`);
        const creds = credentials[platform] || {};
        return lister(product, creds);
      })
    );

    const response = {};
    targets.forEach((platform, i) => {
      const r = syncResults[i];
      response[platform] = r.status === "fulfilled"
        ? { success: true, ...r.value }
        : { success: false, error: r.reason?.message };
    });

    res.json({ sku, source: source_platform, synced: response });
  } catch (err) {
    next(err);
  }
});

// Parameterised routes AFTER named routes
// GET /api/links/:sku
router.get("/:sku", (req, res) => {
  const link = getLinkBySku(req.params.sku);
  if (!link) return res.status(404).json({ error: "SKU not linked." });
  res.json({ link });
});

// DELETE /api/links/:sku/:platform  (more specific, must come first)
router.delete("/:sku/:platform", (req, res) => {
  const deleted = removePlatformFromLink(req.params.sku, req.params.platform);
  res.json({ success: deleted });
});

// DELETE /api/links/:sku
router.delete("/:sku", (req, res) => {
  const deleted = deleteLink(req.params.sku);
  res.json({ success: deleted });
});

export default router;
