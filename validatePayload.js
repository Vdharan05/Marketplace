const REQUIRED_PRODUCT_FIELDS = ["title", "price", "sku"];
const VALID_PLATFORMS = ["amazon", "amazon_vendor", "flipkart", "meesho", "shopify"];

export function validateListingPayload(req, res, next) {
  const { platforms, product } = req.body;

  // Validate platforms array
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({
      error: "platforms must be a non-empty array.",
      valid_platforms: VALID_PLATFORMS,
    });
  }

  const invalid = platforms.filter((p) => !VALID_PLATFORMS.includes(p));
  if (invalid.length > 0) {
    return res.status(400).json({
      error: `Invalid platforms: ${invalid.join(", ")}`,
      valid_platforms: VALID_PLATFORMS,
    });
  }

  return validateProduct(product, res, next);
}

// FIX BUG 13: /single route uses { platform } (singular) not { platforms } (array).
// Separate validator for single-platform requests.
export function validateSingleListingPayload(req, res, next) {
  const { platform, product } = req.body;

  if (!platform || typeof platform !== "string") {
    return res.status(400).json({ error: "platform (string) is required." });
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `Invalid platform: ${platform}`, valid_platforms: VALID_PLATFORMS });
  }

  return validateProduct(product, res, next);
}

function validateProduct(product, res, next) {
  if (!product || typeof product !== "object") {
    return res.status(400).json({ error: "product object is required." });
  }

  const missing = REQUIRED_PRODUCT_FIELDS.filter((f) => !product[f]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required product fields: ${missing.join(", ")}`,
    });
  }

  if (isNaN(parseFloat(product.price))) {
    return res.status(400).json({ error: "product.price must be a valid number." });
  }

  next();
}
