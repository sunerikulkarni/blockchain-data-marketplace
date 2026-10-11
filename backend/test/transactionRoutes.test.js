const test = require('node:test');
const assert = require('node:assert/strict');
const Transaction = require('../models/Transaction');
const blockchain = require('../services/blockchainService');

const wallet = `0x${'a'.repeat(40)}`;
const hash = `0x${'1'.repeat(64)}`;

function buyHandler() {
  delete require.cache[require.resolve('../Routes/Transactionroutes')];
  const router = require('../Routes/Transactionroutes');
  const route = router.stack.find(layer => layer.route?.path === '/buyData' && layer.route.methods.post);
  assert.ok(route, 'POST /buyData route exists');
  assert.equal(route.route.stack.length, 3, 'route requires authentication and request validation');
  return route.route.stack[2].handle;
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('purchase recording rejects client supplied success details without a transaction hash', async () => {
  const res = response();
  await buyHandler()({
    body: { dataId: '7', buyer: wallet, seller: wallet, amount: '999', name: 'Forged purchase' },
    auth: { role: 'user' },
    user: { walletAddress: wallet }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /transaction hash/i);
});

test('purchase details are persisted from the confirmed contract event, not request fields', async () => {
  const originals = {
    findOne: Transaction.findOne,
    create: Transaction.create,
    receipt: blockchain.getConfirmedMarketplaceTransaction,
    dataset: blockchain.getDataset
  };
  const stored = [];
  try {
    Transaction.findOne = async () => null;
    Transaction.create = async value => { stored.push(value); return value; };
    blockchain.getConfirmedMarketplaceTransaction = async () => ({
      transactionHash: hash,
      events: [{ name: 'DataPurchased', args: { dataId: 7n, buyer: wallet, owner: `0x${'b'.repeat(40)}`, amount: 1250000000000000000n } }]
    });
    blockchain.getDataset = async () => ({ name: 'Verified dataset', category: 'Research' });

    const res = response();
    await buyHandler()({
      body: { dataId: '7', txHash: hash, buyer: `0x${'c'.repeat(40)}`, seller: wallet, amount: '999', name: 'Forged purchase' },
      auth: { role: 'user' },
      user: { walletAddress: wallet }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].dataName, 'Verified dataset');
    assert.equal(stored[0].amount, '1.25');
    assert.equal(stored[0].buyer, wallet);
    assert.equal(stored[0].category, 'Research');
  } finally {
    Transaction.findOne = originals.findOne;
    Transaction.create = originals.create;
    blockchain.getConfirmedMarketplaceTransaction = originals.receipt;
    blockchain.getDataset = originals.dataset;
  }
});
