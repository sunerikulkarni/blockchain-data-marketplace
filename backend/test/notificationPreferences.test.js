const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Company = require('../models/Company');
const router = require('../Routes/notificationRoutes');

function route(method, path) {
  const layer = router.stack.find(entry => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route exists`);
  assert.equal(layer.route.stack.length, 2, 'route requires role authentication middleware');
  return layer.route.stack[1].handle;
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('new and legacy User and Company accounts default to notifications enabled', () => {
  assert.equal(User.schema.path('notificationsEnabled').defaultValue, true);
  assert.equal(Company.schema.path('notificationsEnabled').defaultValue, true);
});

test('preference reads default legacy accounts to enabled for their own role account', async () => {
  const userResponse = response();
  const companyResponse = response();
  await route('get', '/notifications/preferences')({ user: { _id: 'user-a' } }, userResponse);
  await route('get', '/company/notifications/preferences')({ company: { _id: 'company-a' } }, companyResponse);
  assert.equal(userResponse.body.notificationsEnabled, true);
  assert.equal(companyResponse.body.notificationsEnabled, true);
});

test('User and Company preference writes use authenticated account IDs, not request data', async () => {
  const originals = { user: User.findByIdAndUpdate, company: Company.findByIdAndUpdate };
  const writes = [];
  try {
    User.findByIdAndUpdate = async (id, update) => {
      writes.push({ role: 'user', id, value: update.$set.notificationsEnabled });
      return { notificationsEnabled: update.$set.notificationsEnabled };
    };
    Company.findByIdAndUpdate = async (id, update) => {
      writes.push({ role: 'company', id, value: update.$set.notificationsEnabled });
      return { notificationsEnabled: update.$set.notificationsEnabled };
    };
    const userResponse = response();
    const companyResponse = response();
    await route('patch', '/notifications/preferences')({
      user: { _id: 'user-a' }, body: { notificationsEnabled: false, accountId: 'user-b' }
    }, userResponse);
    await route('patch', '/company/notifications/preferences')({
      company: { _id: 'company-a' }, body: { notificationsEnabled: true, accountId: 'company-b' }
    }, companyResponse);
    assert.deepEqual(writes, [
      { role: 'user', id: 'user-a', value: false },
      { role: 'company', id: 'company-a', value: true }
    ]);
    assert.equal(userResponse.body.notificationsEnabled, false);
    assert.equal(companyResponse.body.notificationsEnabled, true);
  } finally {
    User.findByIdAndUpdate = originals.user;
    Company.findByIdAndUpdate = originals.company;
  }
});

test('preference writes reject non-boolean values', async () => {
  const userResponse = response();
  const companyResponse = response();
  await route('patch', '/notifications/preferences')({ user: { _id: 'user-a' }, body: { notificationsEnabled: 'false' } }, userResponse);
  await route('patch', '/company/notifications/preferences')({ company: { _id: 'company-a' }, body: { notificationsEnabled: 0 } }, companyResponse);
  assert.equal(userResponse.statusCode, 400);
  assert.equal(companyResponse.statusCode, 400);
});
