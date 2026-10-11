const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const router = require('../Routes/notificationRoutes');

const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const walletA = '0x' + 'a'.repeat(40);
const walletB = '0x' + 'b'.repeat(40);
const notificationId = String(new mongoose.Types.ObjectId());

function handler(method, path) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route, `${method} ${path} route exists`);
  assert.equal(route.route.stack.length, 2, 'route requires authentication middleware');
  return route.route.stack[1].handle;
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('company list and count queries use authenticated company and wallet', async () => {
  const originalFind = Notification.find;
  const originalCount = Notification.countDocuments;
  const filters = [];
  try {
    Notification.find = filter => {
      filters.push(filter);
      return { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [] };
    };
    Notification.countDocuments = async filter => { filters.push(filter); return 2; };
    for (const company of [{ _id: companyA, walletAddress: walletA }, { _id: companyB, walletAddress: walletB }]) {
      const req = { company };
      await handler('get', '/company/notifications')(req, response());
      await handler('get', '/company/notifications/unread-count')(req, response());
    }
    assert.deepEqual(filters.map(f => String(f.recipientCompanyId)), [String(companyA), String(companyA), String(companyB), String(companyB)]);
    assert.deepEqual(filters.map(f => f.recipientWallet), [walletA, walletA, walletB, walletB]);
  } finally {
    Notification.find = originalFind;
    Notification.countDocuments = originalCount;
  }
});

test('individual and bulk reads cannot update another company record', async () => {
  const originalOne = Notification.findOneAndUpdate;
  const originalMany = Notification.updateMany;
  const filters = [];
  try {
    Notification.findOneAndUpdate = filter => {
      filters.push(filter);
      return { select: async () => null };
    };
    Notification.updateMany = async filter => { filters.push(filter); return { modifiedCount: 0 }; };
    const req = { company: { _id: companyA, walletAddress: walletA }, params: { id: notificationId } };
    const single = response();
    await handler('patch', '/company/notifications/:id/read')(req, single);
    assert.equal(single.statusCode, 404);
    await handler('patch', '/company/notifications/read-all')(req, response());
    await handler('patch', '/company/notifications/clear-all')(req, response());
    assert.equal(filters.length, 3);
    for (const filter of filters) {
      assert.equal(String(filter.recipientCompanyId), String(companyA));
      assert.equal(filter.recipientWallet, walletA);
    }
  } finally {
    Notification.findOneAndUpdate = originalOne;
    Notification.updateMany = originalMany;
  }
});
