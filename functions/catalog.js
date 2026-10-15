const PRODUCTS = Object.freeze({
  'classic-logo-tee': { name: 'Character T-Shirt', unitAmount: 2499 },
  'directors-cut-tee': { name: 'Movie Poster Tee', unitAmount: 2999 },
  'cinema-legends-poster': { name: 'Movie Poster', unitAmount: 1499 },
  'midnight-poster': { name: 'Premiere Scene Print', unitAmount: 1899 },
  'popcorn-pin': { name: 'Character Enamel Pin', unitAmount: 899 },
  'movie-fan-mug': { name: 'Movie Scene Mug', unitAmount: 1299 },
});

const calculateOrder = (requestedItems) => {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 20) {
    throw new Error('The cart must contain between 1 and 20 products.');
  }

  const items = requestedItems.map(({ id, quantity }) => {
    const product = PRODUCTS[id];
    if (!product) throw new Error(`Unknown product: ${id}`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error(`Invalid quantity for ${product.name}.`);
    }

    return {
      id,
      name: product.name,
      quantity,
      unitAmount: product.unitAmount,
      lineAmount: product.unitAmount * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineAmount, 0);
  const tax = Math.round(subtotal * 0.05);
  return { items, subtotal, tax, total: subtotal + tax };
};

module.exports = { calculateOrder };
