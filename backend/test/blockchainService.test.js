const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ethers } = require('ethers');
const blockchain = require('../services/blockchainService');

const contractAddress = '0x02018b847da98a987ee59d7f235b2c690085f044';
const buyer = `0x${'a'.repeat(40)}`;
const owner = `0x${'b'.repeat(40)}`;
const other = `0x${'c'.repeat(40)}`;
const iface = new ethers.Interface([
  'function dataCount() view returns (uint256)',
  'function getData(uint256) view returns (uint256,string,string,string,uint256,address,string,string)',
  'function buyData(uint256)',
  'event DataPurchased(uint indexed dataId,address indexed buyer,address indexed owner,uint amount)',
  'event AccessAuthorized(uint indexed dataId,address indexed requester)'
]);

function rpcLog(eventName, values, hash, blockNumber, index) {
  const encoded = iface.encodeEventLog(iface.getEvent(eventName), values);
  return {
    address: contractAddress,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: ethers.toQuantity(blockNumber),
    transactionHash: hash,
    transactionIndex: '0x0',
    blockHash: `0x${'1'.repeat(64)}`,
    logIndex: ethers.toQuantity(index),
    removed: false
  };
}

function blockscoutLog(log) {
  return {
    topics: log.topics,
    data: log.data,
    block_number: Number(log.blockNumber),
    transaction_hash: log.transactionHash,
    index: Number(log.logIndex),
    block_timestamp: '2026-10-12T00:00:00Z'
  };
}

test('purchase event lookup supplements missing indexed events from successful receipts and deduplicates', async () => {
  const originals = {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
    contract: process.env.CONTRACT_ADDRESS,
    fetch: global.fetch
  };
  const txs = [
    { id: 31n, hash: `0x${'1'.repeat(64)}`, buyer, owner, amount: 1_000_000_000_000_000n, block: 500 },
    { id: 32n, hash: `0x${'2'.repeat(64)}`, buyer: owner, owner: other, amount: 2_500_000_000_000_000n, block: 600 },
    { id: 33n, hash: `0x${'3'.repeat(64)}`, buyer, owner, amount: 3_000_000_000_000_000n, block: 700, failed: true }
  ];
  const receipts = new Map(txs.map((tx, txIndex) => [tx.hash, {
    transactionHash: tx.hash,
    blockHash: `0x${'1'.repeat(64)}`,
    blockNumber: ethers.toQuantity(tx.block),
    transactionIndex: '0x0',
    from: tx.buyer,
    to: contractAddress,
    cumulativeGasUsed: '0x5208',
    gasUsed: '0x5208',
    logsBloom: `0x${'0'.repeat(512)}`,
    status: tx.failed ? '0x0' : '0x1',
    effectiveGasPrice: '0x1',
    type: '0x2',
    logs: tx.failed ? [] : [
      rpcLog('DataPurchased', [tx.id, tx.buyer, tx.owner, tx.amount], tx.hash, tx.block, txIndex * 2),
      rpcLog('AccessAuthorized', [tx.id, tx.buyer], tx.hash, tx.block, txIndex * 2 + 1)
    ]
  }]));

  const rpcServer = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const requests = JSON.parse(body);
    const respond = (request) => {
      let result;
      if (request.method === 'eth_chainId') result = '0xaa36a7';
      else if (request.method === 'eth_getTransactionReceipt') result = receipts.get(request.params[0]) || null;
      else if (request.method === 'eth_call') {
        const parsed = iface.parseTransaction({ data: request.params[0].data });
        if (parsed.name === 'dataCount') result = iface.encodeFunctionResult('dataCount', [2]);
        else if (parsed.name === 'getData') {
          const id = BigInt(parsed.args[0]);
          result = iface.encodeFunctionResult('getData', [id, `Dataset ${id}`, 'Research', 'Test', 1n, owner, '', '']);
        } else throw new Error(`Unexpected eth_call: ${parsed.name}`);
      } else throw new Error(`Unexpected RPC method: ${request.method}`);
      return { jsonrpc: '2.0', id: request.id, result };
    };
    const response = Array.isArray(requests) ? requests.map(respond) : respond(requests);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });

  await new Promise((resolve) => rpcServer.listen(0, '127.0.0.1', resolve));
  process.env.BLOCKCHAIN_RPC_URL = `http://127.0.0.1:${rpcServer.address().port}`;
  process.env.CONTRACT_ADDRESS = contractAddress;

  const indexedDuplicate = blockscoutLog(receipts.get(txs[0].hash).logs[0]);
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/logs')) {
      return new Response(JSON.stringify({ items: [indexedDuplicate], next_page_params: null }), { status: 200 });
    }
    if (url.pathname.endsWith('/transactions')) {
      return new Response(JSON.stringify({
        items: txs.map((tx) => ({
          hash: tx.hash,
          to: { hash: contractAddress },
          raw_input: iface.encodeFunctionData('buyData', [tx.id])
        })),
        next_page_params: null
      }), { status: 200 });
    }
    return originals.fetch(input);
  };

  try {
    const all = await blockchain.getPurchaseEvents();
    assert.deepEqual(all.map((purchase) => purchase.dataId), ['32', '31']);
    assert.equal(all.length, 2, 'the indexed event and receipt copy are deduplicated');
    assert.deepEqual(Object.keys(all[0]).sort(), [
      'amount', 'blockNumber', 'buyer', 'category', 'dataId', 'name', 'owner', 'status', 'timestamp', 'txHash'
    ].sort(), 'the existing purchase API response shape is preserved');
    assert.equal(all[0].amount, '0.0025');
    assert.equal(all[0].status, 'confirmed');

    const filtered = await blockchain.getPurchaseEvents(buyer);
    assert.deepEqual(filtered.map((purchase) => purchase.dataId), ['31']);
    const ownerFiltered = await blockchain.getPurchaseEvents(owner);
    assert.deepEqual(ownerFiltered.map((purchase) => purchase.dataId), ['32', '31']);
    assert.deepEqual(await blockchain.getPurchaseEvents(other), ['32'].map((id) => all.find((purchase) => purchase.dataId === id)));

    const audit = await blockchain.getCompanyPurchaseAudit(buyer);
    assert.equal(audit.confirmedPurchaseCount, 1);
    assert.equal(audit.totalPaymentEth, '0.001');
    assert.equal(audit.missingFromDataChain.length, 0);
    assert.deepEqual(audit.pageAgreement, {
      homeDashboard: true,
      myList: true,
      transactions: true
    });
  } finally {
    global.fetch = originals.fetch;
    if (originals.rpcUrl === undefined) delete process.env.BLOCKCHAIN_RPC_URL;
    else process.env.BLOCKCHAIN_RPC_URL = originals.rpcUrl;
    if (originals.contract === undefined) delete process.env.CONTRACT_ADDRESS;
    else process.env.CONTRACT_ADDRESS = originals.contract;
    await new Promise((resolve) => rpcServer.close(resolve));
  }
});
