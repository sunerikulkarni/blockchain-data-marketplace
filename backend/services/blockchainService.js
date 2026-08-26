const { ethers } = require("ethers");

const contractABI = [
    "function addData(string,string,string,uint256,string,string)",
    "function getData(uint256) view returns (uint256,string,string,string,uint256,address,string,string)",
    "function dataCount() view returns (uint256)",
    "event DataAdded(uint indexed id, address indexed owner, uint price)"
];

function getContract() {

    const provider = new ethers.JsonRpcProvider(
        process.env.BLOCKCHAIN_RPC_URL
    );

    const wallet = new ethers.Wallet(
        process.env.PRIVATE_KEY,
        provider
    );

    return new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        contractABI,
        wallet
    );
}


/*
 * Add a dataset to the existing DataMarketplace contract.
 *
 * Returns the actual blockchain dataset ID created
 * by the transaction.
 */
async function addDataset(
    name,
    category,
    description,
    price,
    ipfsCID,
    dataHash
) {

    const contract = getContract();

    const priceInWei =
        ethers.parseEther(String(price));

    const transaction =
        await contract.addData(
            name,
            category,
            description,
            priceInWei,
            ipfsCID,
            dataHash
        );

    const receipt =
        await transaction.wait();

    /*
     * Find the DataAdded event.
     */
    let datasetId = null;

    for (const log of receipt.logs) {

        try {

            const parsed =
                contract.interface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

            if (parsed && parsed.name === "DataAdded") {

                datasetId =
                    parsed.args.id.toString();

                break;
            }

        } catch (error) {
            // Ignore logs belonging to other events/contracts.
        }
    }

    /*
     * Safety fallback:
     * dataCount is read AFTER the transaction.
     *
     * This is not a hard-coded dataset ID.
     */
    if (!datasetId) {

        const dataCount =
            await contract.dataCount();

        datasetId =
            dataCount.toString();
    }

    return {
        datasetId,
        transactionHash: receipt.hash
    };
}


/*
 * Retrieve an existing dataset from the blockchain.
 */
async function getDataset(datasetId) {

    const contract = getContract();

    const dataset =
        await contract.getData(datasetId);

    return {

        id:
            dataset[0].toString(),

        name:
            dataset[1],

        category:
            dataset[2],

        description:
            dataset[3],

        price:
            dataset[4].toString(),

        owner:
            dataset[5],

        ipfsCID:
            dataset[6],

        dataHash:
            dataset[7]
    };
}


module.exports = {
    addDataset,
    getDataset
};