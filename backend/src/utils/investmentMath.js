function weightedAverageBuy(oldUnits, oldPrice, boughtUnits, buyPrice) {
    const newUnits = oldUnits + boughtUnits;
    const newPrice = newUnits > 0
        ? ((oldUnits * oldPrice) + (boughtUnits * buyPrice)) / newUnits
        : buyPrice;
    return { newUnits, newPrice };
}

module.exports = { weightedAverageBuy };
