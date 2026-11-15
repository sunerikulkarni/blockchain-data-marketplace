const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
const notificationCenter = appSource.slice(appSource.indexOf('function installUserNotificationCenter'), appSource.indexOf('const Transactions ='));

test('notification center loads role preference and gates badge and pop-ups', () => {
  assert.match(notificationCenter, /const preferencePath = `\$\{basePath\}\/preferences`/);
  assert.match(notificationCenter, /preferenceReady && notificationsEnabled \? unreadCount : 0/);
  assert.match(notificationCenter, /preferenceReady && notificationsEnabled\) showNotificationToast/);
  assert.match(notificationCenter, /window\.addEventListener\('dc:notification-preference-updated'/);
});

test('polling deduplicates pop-ups by account and notification ID', () => {
  assert.match(notificationCenter, /const seenKey = `dc_notification_seen_v1_\$\{role\}_\$\{accountKey\}`/);
  assert.match(notificationCenter, /seenIds\.has\(id\)/);
  assert.match(notificationCenter, /window\.setInterval\(pollNotifications, 15000\)/);
  assert.doesNotMatch(notificationCenter, /companyKey/);
});

test('both Profile roles use their authenticated preference endpoints and notify the center after saving', () => {
  assert.match(profileSource, /role === 'company' \? '\/company\/notifications\/preferences' : '\/notifications\/preferences'/);
  assert.match(profileSource, /await bindNotificationPreference\('company'\)/);
  assert.match(profileSource, /await bindNotificationPreference\('user'\)/);
  assert.match(profileSource, /dc:notification-preference-updated/);
});

test('opening the panel loads records without marking them as read', () => {
  assert.match(notificationCenter, /if \(open\) loadNotifications\(\)/);
  assert.doesNotMatch(notificationCenter, /setOpen\s*=\s*open\s*=>[\s\S]{0,180}read-all/);
});
