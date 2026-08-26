const {
    encryptData,
    decryptData,
    generateHash
} = require("../services/encryptionServices");

const {
    uploadToIPFS,
    retrieveFromIPFS
} = require("../services/ipfsService");

const {
    addDataset,
    getDataset
} = require("../services/blockchainService");


/*
 * Upload Dataset
 *
 * Flow:
 * Personal Data
 *      ↓
 * SHA-256 Hash
 *      ↓
 * AES-256-GCM Encryption
 *      ↓
 * Encrypted Data
 *      ↓
 * IPFS
 *      ↓
 * CID
 *      ↓
 * Existing DataMarketplace.addData()
 *      ↓
 * Real blockchain dataset ID
 */
async function uploadDataset(req, res) {

    try {

        /*
         * Personal/private data
         */
        const {
            name,
            age,
            city,

            /*
             * Marketplace information
             */
            category,
            description,
            price
        } = req.body;


        /*
         * Validate required fields
         */
        if (!name || !age || !city) {
            return res.status(400).json({
                success: false,
                message: "Name, age and city are required"
            });
        }

        if (!category || !description || price === undefined) {
            return res.status(400).json({
                success: false,
                message:
                    "Category, description and price are required"
            });
        }


        /*
         * Personal dataset.
         *
         * This is the data that will be encrypted
         * and stored on IPFS.
         */
        const dataset = {
            name,
            age,
            city
        };


        /*
         * Convert personal dataset to text.
         */
        const originalData =
            JSON.stringify(dataset);


        /*
         * Generate SHA-256 hash BEFORE encryption.
         */
        const dataHash =
            generateHash(originalData);


        /*
         * Encrypt personal data using AES-256-GCM.
         */
        const encrypted =
            encryptData(originalData);


        /*
         * Create encrypted package.
         *
         * The encryption key itself is NOT stored here.
         */
        const encryptedPackage = {

            encryptedData:
                encrypted.encryptedData,

            iv:
                encrypted.iv,

            authTag:
                encrypted.authTag
        };


        /*
         * Upload encrypted package to IPFS.
         */
        const cid =
            await uploadToIPFS(
                JSON.stringify(encryptedPackage),
                `dataset-${Date.now()}.json`
            );


        /*
         * Register the dataset using the EXISTING
         * Phase 2 DataMarketplace contract.
         *
         * No new contract is created.
         */
        const blockchainResult =
            await addDataset(
                name,
                category,
                description,
                price,
                cid,
                dataHash
            );


        /*
         * Return the ACTUAL blockchain dataset ID.
         */
        res.status(201).json({

            success: true,

            message:
                "Dataset encrypted, hashed, uploaded to IPFS and registered on blockchain",

            datasetId:
                blockchainResult.datasetId,

            cid,

            hash:
                dataHash,

            transactionHash:
                blockchainResult.transactionHash
        });

    } catch (error) {

        console.error(
            "Upload Dataset Error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                error.message
        });
    }
}


/*
 * Verify Dataset Integrity
 *
 * Flow:
 * Blockchain dataset ID
 *      ↓
 * Existing DataMarketplace.getData()
 *      ↓
 * Retrieve IPFS CID + SHA-256 hash
 *      ↓
 * Retrieve encrypted data from IPFS
 *      ↓
 * Decrypt
 *      ↓
 * Generate SHA-256 again
 *      ↓
 * Compare hashes
 */
async function verifyDataset(req, res) {

    try {

        const {
            datasetId
        } = req.params;


        /*
         * Validate that a dataset ID was supplied.
         */
        if (!datasetId) {

            return res.status(400).json({

                success: false,

                message:
                    "Blockchain dataset ID is required"
            });
        }


        /*
         * Get the dataset from the existing
         * DataMarketplace contract.
         */
        const blockchainData =
            await getDataset(datasetId);


        /*
         * Retrieve encrypted data from IPFS
         * using the CID stored on-chain.
         */
        const encryptedText =
            await retrieveFromIPFS(
                blockchainData.ipfsCID
            );


        /*
         * Convert the IPFS response back into
         * the encrypted package.
         */
        const encryptedPackage =
            JSON.parse(encryptedText);


        /*
         * Decrypt the original personal data.
         */
        const decryptedData =
            decryptData(
                encryptedPackage.encryptedData,
                encryptedPackage.iv,
                encryptedPackage.authTag
            );


        /*
         * Generate SHA-256 hash of the
         * decrypted original data.
         */
        const currentHash =
            generateHash(decryptedData);


        /*
         * Compare the newly generated hash
         * against the hash stored on-chain.
         */
        const isValid =
            currentHash ===
            blockchainData.dataHash;


        res.json({

            success: true,

            datasetId:
                blockchainData.id,

            cid:
                blockchainData.ipfsCID,

            originalHash:
                blockchainData.dataHash,

            currentHash,

            integrityVerified:
                isValid,

            status:
                isValid
                    ? "DATA_UNCHANGED"
                    : "DATA_MODIFIED"
        });

    } catch (error) {

        console.error(
            "Verification Error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                error.message
        });
    }
}


module.exports = {
    uploadDataset,
    verifyDataset
};