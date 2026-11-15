const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePurchaseAudit } = require('../services/purchaseAudit');

const txA = `0x${'a'.repeat(64)}`;
const txB = `0x${'b'.repeat(64)}`;

function purchase(dataId, txHash, amountWei, gasFeeWei, logIndex = 0) {
  return { dataId, txHash, amountWei, gasFeeWei, logIndex };
}

test('purchase audit calculates ETH totals and identifies missing event/API rows', () => {
  const verified = [
    purchase('41', txA, '1500000000000000000', '21000000000000'),
    purchase('42', txB, '250000000000000000', '30000000000000')
  ];
  const audit = calculatePurchaseAudit({
    verifiedPurchases: verified,
    dataChainPurchases: [verified[0]],
    indexedPurchases: [],
    receiptDiscoveryComplete: true,
    eventIndexAvailable: true
  });

  assert.equal(audit.confirmedPurchaseCount, 2);
  assert.equal(audit.totalPaymentEth, '1.75');
  assert.equal(audit.totalGasFeesEth, '0.000051');
  assert.deepEqual(audit.missingFromDataChain, [{ datasetId: '42', transactionHash: txB }]);
  assert.deepEqual(audit.missingFromEventIndex, [
    { datasetId: '41', transactionHash: txA },
    { datasetId: '42', transactionHash: txB }
  ]);
  assert.deepEqual(audit.pageAgreement, {
    homeDashboard: false,
    myList: false,
    transactions: false
  });
  assert.equal(audit.discovery.exhaustive, false);
});

test('purchase audit reports duplicate DataChain records and incomplete gas totals', () => {
  const first = purchase('41', txA, '1500000000000000000', null);
  const duplicate = { ...first };
  const audit = calculatePurchaseAudit({
    verifiedPurchases: [first],
    dataChainPurchases: [first, duplicate],
    indexedPurchases: [first, duplicate],
    receiptDiscoveryComplete: false,
    eventIndexAvailable: false
  });

  assert.equal(audit.confirmedPurchaseCount, 1);
  assert.equal(audit.totalPaymentEth, '1.5');
  assert.equal(audit.totalGasFeesEth, null);
  assert.equal(audit.gasFeeReceiptCount, 0);
  assert.equal(audit.duplicateRecords.length, 1);
  assert.equal(audit.duplicateRecords[0].duplicateCount, 1);
  assert.equal(audit.duplicateIndexedEvents.length, 1);
});

test('purchase audit marks all Company page calculations consistent when the records match', () => {
  const rows = [
    purchase('41', txA, '1500000000000000000', '21000000000000'),
    purchase('42', txB, '250000000000000000', '30000000000000')
  ];
  const audit = calculatePurchaseAudit({
    verifiedPurchases: rows,
    dataChainPurchases: rows,
    indexedPurchases: rows,
    receiptDiscoveryComplete: true,
    eventIndexAvailable: true
  });

  assert.deepEqual(audit.missingFromDataChain, []);
  assert.deepEqual(audit.unexpectedInDataChain, []);
  assert.deepEqual(audit.duplicateRecords, []);
  assert.deepEqual(audit.pageAgreement, {
    homeDashboard: true,
    myList: true,
    transactions: true
  });
});
