const test = require('node:test');
const assert = require('node:assert/strict');
const Company = require('../models/Company');
const User = require('../models/User');
const Notification = require('../models/Notification');
const blockchain = require('../services/blockchainService');

const walletA = '0x' + 'a'.repeat(40);
const walletB = '0x' + 'b'.repeat(40);
const owner = '0x' + 'c'.repeat(40);
const hash = '0x' + '1'.repeat(64);
const originals = {
  companyFindOne: Company.findOne,
  companyFindById: Company.findById,
  userFindOne: User.findOne,
  updateOne: Notification.updateOne,
  receipt: blockchain.getConfirmedMarketplaceTransaction,
  dataset: blockchain.getDataset
};

test.afterEach(() => {
  Company.findOne = originals.companyFindOne;
  Company.findById = originals.companyFindById;
  User.findOne = originals.userFindOne;
  Notification.updateOne = originals.updateOne;
  blockchain.getConfirmedMarketplaceTransaction = originals.receipt;
  blockchain.getDataset = originals.dataset;
  delete require.cache[require.resolve('../services/notificationService')];
});

function setup(receipt) {
  const records = new Map();
  Company.findOne = filter => ({ select: async () => filter.walletAddress === walletA
    ? { _id: 'company-a', walletAddress: walletA } : null });
  Company.findById = id => ({ select: async () => id === 'company-a'
    ? { _id: id, walletAddress: walletA, verificationStatus: 'verified' } : null });
  User.findOne = () => ({ select: async () => null });
  Notification.updateOne = async (filter, update) => {
    if (records.has(filter.notificationKey)) return { upsertedCount: 0 };
    records.set(filter.notificationKey, update.$setOnInsert);
    return { upsertedCount: 1 };
  };
  blockchain.getConfirmedMarketplaceTransaction = async () => receipt;
  blockchain.getDataset = async () => ({ name: 'Climate data', owner });
  delete require.cache[require.resolve('../services/notificationService')];
  return { service: require('../services/notificationService'), records };
}

test('confirmed company request is scoped and deduplicated', async () => {
  const { service, records } = setup({ transactionHash: hash, from: walletA,
    events: [{ name: 'AccessRequested', args: { dataId: 7n, requester: walletA } }] });
  const input = { transactionHash: hash, actorRole: 'company', actorWallet: walletA };
  await service.ingestConfirmedTransaction(input);
  await service.ingestConfirmedTransaction(input);
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].recipientCompanyId, 'company-a');
  assert.equal([...records.values()][0].type, 'ACCESS_REQUEST_SUBMITTED');
});

test('unrelated sender and failed receipt create no company notification', async () => {
  const { service, records } = setup({ transactionHash: hash, from: walletB,
    events: [{ name: 'DataPurchased', args: { dataId: 7n, buyer: walletA, owner, amount: 1000000000000000000n } }] });
  await assert.rejects(service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'company', actorWallet: walletA }), /sender/);
  assert.equal(records.size, 0);
  blockchain.getConfirmedMarketplaceTransaction = async () => { throw new Error('not confirmed'); };
  delete require.cache[require.resolve('../services/notificationService')];
  await assert.rejects(require('../services/notificationService').ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'company', actorWallet: walletA }), /not confirmed/);
  assert.equal(records.size, 0);
});

test('purchase debit uses the confirmed event amount and transaction hash', async () => {
  const { service, records } = setup({ transactionHash: hash, from: walletA,
    events: [{ name: 'DataPurchased', args: { dataId: 7n, buyer: walletA, owner, amount: 1250000000000000000n } }] });
  await service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'company', actorWallet: walletA });
  const item = [...records.values()][0];
  assert.equal(item.type, 'ETH_DEBITED');
  assert.match(item.message, /1\.25 ETH/);
  assert.equal(item.relatedTransactionHash, hash);
});

test('zero-value purchase does not claim an ETH credit or debit', async () => {
  const { service, records } = setup({ transactionHash: hash, from: walletA,
    events: [{ name: 'DataPurchased', args: { dataId: 7n, buyer: walletA, owner, amount: 0n } }] });
  await service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'company', actorWallet: walletA });
  assert.equal(records.size, 0);
});

test('confirmed owner payment creates a credit for the matching company', async () => {
  const { service, records } = setup({ transactionHash: hash, from: walletB,
    events: [{ name: 'DataPurchased', args: { dataId: 7n, buyer: walletB, owner: walletA, amount: 500000000000000000n } }] });
  await service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'user', actorWallet: walletB });
  const item = [...records.values()][0];
  assert.equal(item.type, 'ETH_CREDITED');
  assert.match(item.message, /0\.5 ETH/);
});

test('confirmed owner decisions notify only the requesting company', async () => {
  const { service, records } = setup({ transactionHash: hash, from: owner,
    events: [{ name: 'AccessApproved', args: { dataId: 7n, requester: walletA } }] });
  await service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'user', actorWallet: owner });
  assert.equal([...records.values()][0].type, 'ACCESS_REQUEST_APPROVED');
  assert.equal([...records.values()][0].recipientCompanyId, 'company-a');
});

test('off-chain request notice follows persisted request identity and status', async () => {
  const { service, records } = setup(null);
  const request = { _id: 'request-1', companyId: 'company-a', buyerWallet: walletA,
    dataId: { _id: 'dataset-1', name: 'Climate data' } };
  await service.notifyCompanyAccessRequest(request, 'pending');
  await service.notifyCompanyAccessRequest(request, 'pending');
  await service.notifyCompanyAccessRequest(request, 'approved');
  assert.equal(records.size, 2);
  assert.deepEqual([...records.values()].map(x => x.type), ['ACCESS_REQUEST_SUBMITTED', 'ACCESS_REQUEST_APPROVED']);
});

test('user notifications are persisted even when the preference is disabled', async () => {
  const { service, records } = setup({ transactionHash: hash, from: owner,
    events: [{ name: 'DataAdded', args: { dataId: 7n, owner } }] });
  User.findOne = () => ({ select: async () => ({ _id: 'user-owner', walletAddress: owner, notificationsEnabled: false }) });
  await service.ingestConfirmedTransaction({ transactionHash: hash, actorRole: 'user', actorWallet: owner });
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].recipientUserId, 'user-owner');
  assert.equal([...records.values()][0].read, false);
});

test('company notifications are persisted even when the preference is disabled', async () => {
  const { service, records } = setup(null);
  Company.findById = () => ({ select: async () => ({
    _id: 'company-a', walletAddress: walletA, verificationStatus: 'verified', notificationsEnabled: false
  }) });
  await service.notifyCompanyAccessRequest({
    _id: 'request-off', companyId: 'company-a', buyerWallet: walletA,
    dataId: { _id: 'dataset-off', name: 'Climate data' }
  }, 'pending');
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].recipientCompanyId, 'company-a');
  assert.equal([...records.values()][0].read, false);
});
