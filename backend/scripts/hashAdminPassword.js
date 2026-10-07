const readline = require('readline');
const { hashPassword } = require('../services/authService');

if (!process.stdin.isTTY) {
  console.error('Run this script in an interactive terminal so the password is not echoed.');
  process.exit(1);
}

const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
process.stdout.write('Admin password: ');
if (process.stdin.setRawMode) process.stdin.setRawMode(true);
let password = '';
process.stdin.resume();
process.stdin.on('data', async chunk => {
  const char = chunk.toString('utf8');
  if (char === '\u0003') process.exit(1);
  if (char === '\r' || char === '\n') {
    process.stdin.pause();
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    input.close();
    process.stdout.write('\n');
    if (password.length < 10 || password.length > 128) {
      console.error('Password must be 10 to 128 characters.');
      process.exit(1);
    }
    const passwordHash = await hashPassword(password);
    password = '';
    process.stdout.write(`ADMIN_PASSWORD_HASH=${passwordHash}\n`);
    return;
  }
  if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
  else if (char.length === 1 && password.length < 128) password += char;
});
