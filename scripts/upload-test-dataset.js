/**
 * upload-test-dataset.js
 *
 * Uploads a fresh health dataset using the CURRENT ENCRYPTION_KEY.
 * Run this once to create a properly-encrypted IPFS record tied
 * to the current key, then register the result on-chain via:
 *   addData.html  OR  scripts/register-on-chain.js
 *
 * Usage:
 *   node scripts/upload-test-dataset.js
 */

require('dotenv').config({ path: './backend/.env' });

const { encryptData, generateHash } = require('./backend/services/encryptionServices');
const { uploadToIPFS }              = require('./backend/services/ipfsService');

// ── Test payload (not hard-coded in the app — only used for this seed) ──────
const TEST_PAYLOAD = {
  userId:       'TEST001',
  heartRate:    78,
  fitnessLevel: 'Moderate',
  activity:     'Walking'
};

async function main() {
  console.log('\n=== DataChain — Upload Test Dataset ===\n');

  // 1. Stringify
  const plaintext = JSON.stringify(TEST_PAYLOAD);
  console.log('Plaintext payload:', plaintext);

  // 2. SHA-256 of plaintext  ← this goes on-chain as dataHash
  const dataHash = generateHash(plaintext);
  console.log('\nSHA-256 hash (store this on-chain as dataHash):\n', dataHash);

  // 3. AES-256-GCM encrypt
  const encrypted = encryptData(plaintext);
  const ipfsPayload = JSON.stringify({
    encryptedData: encrypted.encryptedData,
    iv:            encrypted.iv,
    authTag:       encrypted.authTag
  });
  console.log('\nEncrypted IPFS payload (JSON):\n', ipfsPayload);

  // 4. Upload to Pinata/IPFS
  console.log('\nUploading to IPFS via Pinata…');
  const cid = await uploadToIPFS(ipfsPayload, `datachain-test-${Date.now()}.json`);
  console.log('IPFS CID:', cid);

  // 5. Summary
  console.log('\n=== RESULT — Use these values when calling addData() on-chain ===\n');
  console.log('  name:        "Test Health Dataset"');
  console.log('  category:    "Health"');
  console.log('  description: "Fitness and heart-rate data for DataChain demo"');
  console.log('  price:       0.001 ETH  → 1000000000000000 wei');
  console.log('  ipfsCID:    ', cid);
  console.log('  dataHash:   ', dataHash);
  console.log('\n→ Open addData.html, fill in the above fields, and confirm with MetaMask.');
  console.log('→ Or call the backend: POST /upload (body below)\n');
  console.log(JSON.stringify({
    name:           'Test Health Dataset',
    category:       'Health',
    description:    'Fitness and heart-rate data for DataChain demo',
    price:          '0.001',
    payload:        TEST_PAYLOAD,
    registerOnChain: false
  }, null, 2));
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
