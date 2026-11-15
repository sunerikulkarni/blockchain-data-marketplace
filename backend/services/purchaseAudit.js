const { ethers } = require('ethers');

function purchaseKey(purchase) {
  const hash = String(purchase.txHash || purchase.transactionHash || '').toLowerCase();
  if (!hash) return null;
  const index = purchase.logIndex ?? 0;
  return `${hash}:${index}`;
}

function findDuplicateRecords(records) {
  const counts = new Map();
  for (const record of records) {
    const key = purchaseKey(record);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ transactionHash: key.split(':')[0], duplicateCount: count - 1 }));
}

function uniqueByPurchase(records) {
  const unique = new Map();
  for (const record of records) {
    const key = purchaseKey(record);
    if (key && !unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function toEth(wei) {
  return ethers.formatEther(BigInt(wei || 0));
}

function samePurchases(left, right) {
  const leftKeys = new Set(uniqueByPurchase(left).map(purchaseKey));
  const rightKeys = new Set(uniqueByPurchase(right).map(purchaseKey));
  return leftKeys.size === rightKeys.size && [...leftKeys].every((key) => rightKeys.has(key));
}

function calculatePurchaseAudit({
  verifiedPurchases = [],
  dataChainPurchases = [],
  indexedPurchases = [],
  receiptDiscoveryComplete = false,
  eventIndexAvailable = false
}) {
  const verified = uniqueByPurchase(verifiedPurchases);
  const dataChain = uniqueByPurchase(dataChainPurchases);
  const verifiedKeys = new Set(verified.map(purchaseKey));
  const dataChainKeys = new Set(dataChain.map(purchaseKey));
  const missing = verified.filter((purchase) => !dataChainKeys.has(purchaseKey(purchase)));
  const unexpected = dataChain.filter((purchase) => !verifiedKeys.has(purchaseKey(purchase)));
  const indexedKeys = new Set(uniqueByPurchase(indexedPurchases).map(purchaseKey));
  const missingFromIndex = verified.filter((purchase) => !indexedKeys.has(purchaseKey(purchase)));

  const paymentWei = verified.reduce((sum, purchase) => sum + BigInt(purchase.amountWei || 0), 0n);
  const gasByTransaction = new Map();
  for (const purchase of verified) {
    const hash = String(purchase.txHash || purchase.transactionHash || '').toLowerCase();
    if (hash && purchase.gasFeeWei !== null && purchase.gasFeeWei !== undefined) {
      gasByTransaction.set(hash, BigInt(purchase.gasFeeWei));
    }
  }
  const knownGasWei = [...gasByTransaction.values()].reduce((sum, fee) => sum + fee, 0n);
  const gasFeesComplete = gasByTransaction.size === new Set(verified.map(p => String(p.txHash || p.transactionHash || '').toLowerCase())).size;
  const pageAgrees = samePurchases(verified, dataChain);

  return {
    confirmedPurchaseCount: verified.length,
    purchases: verified.map((purchase) => ({
      datasetId: String(purchase.dataId),
      transactionHash: purchase.txHash || purchase.transactionHash,
      paymentEth: toEth(purchase.amountWei),
      gasFeeEth: purchase.gasFeeWei === null || purchase.gasFeeWei === undefined
        ? null : toEth(purchase.gasFeeWei)
    })),
    totalPaymentEth: toEth(paymentWei),
    totalGasFeesEth: gasFeesComplete ? toEth(knownGasWei) : null,
    knownGasFeesEth: toEth(knownGasWei),
    gasFeeReceiptCount: gasByTransaction.size,
    gasFeeReceiptTotal: new Set(verified.map(p => String(p.txHash || p.transactionHash || '').toLowerCase())).size,
    missingFromDataChain: missing.map((purchase) => ({
      datasetId: String(purchase.dataId),
      transactionHash: purchase.txHash || purchase.transactionHash
    })),
    missingFromEventIndex: missingFromIndex.map((purchase) => ({
      datasetId: String(purchase.dataId),
      transactionHash: purchase.txHash || purchase.transactionHash
    })),
    unexpectedInDataChain: unexpected.map((purchase) => ({
      datasetId: String(purchase.dataId),
      transactionHash: purchase.txHash || purchase.transactionHash
    })),
    duplicateRecords: findDuplicateRecords(dataChainPurchases),
    duplicateIndexedEvents: findDuplicateRecords(indexedPurchases),
    pageAgreement: {
      homeDashboard: pageAgrees,
      myList: pageAgrees,
      transactions: pageAgrees
    },
    discovery: {
      source: 'Blockscout contract transaction index with configured Sepolia RPC receipt verification',
      receiptDiscoveryComplete,
      eventIndexAvailable,
      exhaustive: false,
      limitation: 'The explorer transaction index is the transaction-discovery source. Its completeness cannot be independently guaranteed because the configured RPC does not support the broad log scan needed to enumerate every contract transaction.'
    }
  };
}

module.exports = { calculatePurchaseAudit, findDuplicateRecords };
