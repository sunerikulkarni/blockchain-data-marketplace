const { ethers } = require("ethers");

const contractABI = [
    "function addData(string,string,string,uint256,string,string)",
    "function getData(uint256) view returns (uint256,string,string,string,uint256,address,string,string)",
    "function dataCount() view returns (uint256)",
    "function getAccessStatus(uint256,address) view returns (uint8)",
    "function hasAccess(uint256,address) view returns (bool)",
    "event DataAdded(uint indexed dataId, address indexed owner, uint price)",
    "event AccessRequested(uint indexed dataId, address indexed requester)",
    "event AccessApproved(uint indexed dataId, address indexed requester)",
    "event AccessRejected(uint indexed dataId, address indexed requester)",
    "event DataPurchased(uint indexed dataId, address indexed buyer, address indexed owner, uint amount)",
    "event AccessAuthorized(uint indexed dataId, address indexed requester)"
];

const ACCESS_STATUS = {
    0: "NONE",
    1: "PENDING",
    2: "APPROVED",
    3: "REJECTED",
    4: "AUTHORIZED"
};

const BLOCKSCOUT_API = "https://eth-sepolia.blockscout.com/api/v2";
const MAX_EVENT_LOG_PAGES = 20;

function requireRpc() {
    if (!process.env.BLOCKCHAIN_RPC_URL) {
        throw new Error("BLOCKCHAIN_RPC_URL is missing in .env");
    }
    if (!process.env.CONTRACT_ADDRESS) {
        throw new Error("CONTRACT_ADDRESS is missing in .env");
    }
}

function getReadContract() {
    requireRpc();
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
    return new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        contractABI,
        provider
    );
}

function getWriteContract() {
    requireRpc();
    if (!process.env.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY is missing in .env");
    }

    const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    return new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        contractABI,
        wallet
    );
}

function mapDataset(dataset) {
    return {
        id: dataset[0].toString(),
        name: dataset[1],
        category: dataset[2],
        description: dataset[3],
        priceWei: dataset[4].toString(),
        price: ethers.formatEther(dataset[4]),
        owner: dataset[5],
        ipfsCID: dataset[6],
        dataHash: dataset[7]
    };
}

async function listDatasets() {
    const contract = getReadContract();
    const count = Number(await contract.dataCount());
    const datasets = [];

    for (let i = 1; i <= count; i++) {
        try {
            datasets.push(mapDataset(await contract.getData(i)));
        } catch (error) {
            console.warn(`Could not read dataset #${i}:`, error.message);
        }
    }

    return { count, datasets };
}

async function addDataset(name, category, description, price, ipfsCID, dataHash) {
    const contract = getWriteContract();
    const priceInWei = ethers.parseEther(String(price));

    const transaction = await contract.addData(
        name,
        category,
        description,
        priceInWei,
        ipfsCID,
        dataHash
    );

    const receipt = await transaction.wait();
    let datasetId = null;

    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog({
                topics: log.topics,
                data: log.data
            });

            if (parsed && parsed.name === "DataAdded") {
                datasetId = (parsed.args.dataId ?? parsed.args[0]).toString();
                break;
            }
        } catch {
            // Ignore logs from other contracts.
        }
    }

    if (!datasetId) {
        const dataCount = await contract.dataCount();
        datasetId = dataCount.toString();
    }

    return {
        datasetId,
        transactionHash: receipt.hash
    };
}

async function getDataset(datasetId) {
    const contract = getReadContract();
    return mapDataset(await contract.getData(datasetId));
}

async function getAccessStatus(datasetId, user) {
    const contract = getReadContract();
    const status = Number(await contract.getAccessStatus(datasetId, user));
    return {
        status,
        label: ACCESS_STATUS[status] || "UNKNOWN"
    };
}

async function queryEventLogs(eventName) {
    const contract = getReadContract();
    const eventTopic = contract.interface.getEvent(eventName).topicHash.toLowerCase();
    const address = process.env.CONTRACT_ADDRESS.toLowerCase();
    const logs = [];
    let nextPage = null;
    let pagesRead = 0;

    // Blockscout indexes the contract's logs and paginates them newest first.
    // This avoids asking pruned/free-tier JSON-RPC nodes for broad eth_getLogs ranges.
    do {
        const url = new URL(`${BLOCKSCOUT_API}/addresses/${address}/logs`);
        if (nextPage) {
            for (const [key, value] of Object.entries(nextPage)) {
                if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
            }
        }

        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        } catch (error) {
            throw new Error(`Sepolia event index request failed: ${error.message}`, { cause: error });
        }
        if (!response.ok) {
            throw new Error(`Sepolia event index returned HTTP ${response.status}`);
        }

        const page = await response.json();
        if (!Array.isArray(page.items)) {
            throw new Error("Sepolia event index returned an invalid log page");
        }

        for (const item of page.items) {
            if (item.topics?.[0]?.toLowerCase() !== eventTopic) continue;
            try {
                // Blockscout may include trailing null topic slots; ethers expects only hex topics.
                const topics = item.topics.filter((topic) => typeof topic === "string");
                const parsed = contract.interface.parseLog({ topics, data: item.data });
                logs.push({
                    args: parsed.args,
                    blockNumber: Number(item.block_number),
                    transactionHash: item.transaction_hash,
                    timestamp: item.block_timestamp || item.timestamp || null
                });
            } catch (error) {
                console.warn(`Could not decode indexed ${eventName} log:`, error.message);
            }
        }

        nextPage = page.next_page_params;
        pagesRead += 1;
        if (nextPage && pagesRead >= MAX_EVENT_LOG_PAGES) {
            throw new Error(`${eventName} event history exceeds the bounded ${MAX_EVENT_LOG_PAGES}-page read limit`);
        }
    } while (nextPage);

    return logs;
}

async function getAccessRequestsForOwner(ownerWallet) {
    if (!ownerWallet || !ethers.isAddress(ownerWallet)) {
        throw new Error("A valid owner wallet is required");
    }

    const contract = getReadContract();
    const { datasets } = await listDatasets();
    const owned = datasets.filter(
        (d) => d.owner.toLowerCase() === ownerWallet.toLowerCase()
    );
    const ownedIds = new Set(owned.map((d) => d.id));

    const logs = await queryEventLogs("AccessRequested");
    const seen = new Set();
    const requests = [];

    for (const log of logs) {
        const dataId = (log.args.dataId ?? log.args[0]).toString();
        const requester = log.args.requester ?? log.args[1];
        if (!ownedIds.has(dataId)) continue;

        const key = `${dataId}_${requester.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const access = await getAccessStatus(dataId, requester);
        const dataset = owned.find((d) => d.id === dataId);

        requests.push({
            dataId,
            datasetName: dataset ? dataset.name : `Dataset #${dataId}`,
            requester,
            status: access.label,
            statusCode: access.status,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash
        });
    }

    requests.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
    return { owned, requests };
}

async function getAccessRequestsForRequester(requesterWallet) {
    if (!requesterWallet || !ethers.isAddress(requesterWallet)) {
        throw new Error("A valid requester wallet is required");
    }

    const contract = getReadContract();
    const requester = requesterWallet.toLowerCase();
    const { datasets } = await listDatasets();
    const byId = Object.fromEntries(datasets.map((dataset) => [dataset.id, dataset]));
    const logs = await queryEventLogs("AccessRequested");
    const requests = [];

    for (const log of logs) {
        const dataId = (log.args.dataId ?? log.args[0]).toString();
        const wallet = log.args.requester ?? log.args[1];
        if (!wallet || wallet.toLowerCase() !== requester) continue;

        const dataset = byId[dataId];
        const access = await getAccessStatus(dataId, wallet);
        requests.push({
            dataId,
            datasetName: dataset ? dataset.name : `Dataset #${dataId}`,
            requester: wallet,
            owner: dataset ? dataset.owner : null,
            status: access.label,
            statusCode: access.status,
            blockNumber: log.blockNumber,
            timestamp: log.timestamp,
            transactionHash: log.transactionHash
        });
    }

    return requests.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
}

async function getPurchaseEvents(wallet) {
    const logs = await queryEventLogs("DataPurchased");
    const normalized = wallet ? wallet.toLowerCase() : null;
    const { datasets } = await listDatasets();
    const byId = Object.fromEntries(datasets.map((d) => [d.id, d]));

    return Promise.all(logs.map(async (log) => {
            const dataId = (log.args.dataId ?? log.args[0]).toString();
            const buyer = log.args.buyer ?? log.args[1];
            const owner = log.args.owner ?? log.args[2];
            const amount = log.args.amount ?? log.args[3];
            const dataset = byId[dataId];
            return {
                dataId,
                name: dataset ? dataset.name : `Dataset #${dataId}`,
                category: dataset ? dataset.category : "",
                buyer,
                owner,
                amount: ethers.formatEther(amount),
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                timestamp: log.timestamp,
                status: "confirmed"
            };
        }))
        .then((events) => events.filter((tx) => {
            if (!normalized) return true;
            return (
                tx.buyer.toLowerCase() === normalized ||
                tx.owner.toLowerCase() === normalized
            );
        }));
}

module.exports = {
    addDataset,
    getDataset,
    listDatasets,
    getAccessStatus,
    getAccessRequestsForOwner,
    getAccessRequestsForRequester,
    getPurchaseEvents,
    ACCESS_STATUS
};
