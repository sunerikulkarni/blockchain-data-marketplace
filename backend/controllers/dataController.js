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
    getDataset,
    listDatasets,
    getAccessStatus
} = require("../services/blockchainService");

function resolvePayload(body) {
    if (body.payload !== undefined && body.payload !== null && body.payload !== "") {
        return typeof body.payload === "string"
            ? body.payload
            : JSON.stringify(body.payload);
    }

    if (body.content) {
        return String(body.content);
    }

    if (body.name && body.age && body.city) {
        return JSON.stringify({
            name: body.name,
            age: body.age,
            city: body.city
        });
    }

    return null;
}

async function uploadDataset(req, res) {
    try {
        const {
            name,
            category,
            description,
            price,
            registerOnChain
        } = req.body;

        const originalData = resolvePayload(req.body);

        if (!originalData) {
            return res.status(400).json({
                success: false,
                message:
                    "Dataset payload is required. Send payload (text or JSON), content, or name/age/city."
            });
        }

        if (!process.env.PINATA_JWT) {
            return res.status(500).json({
                success: false,
                message: "PINATA_JWT is missing in backend/.env. IPFS upload cannot proceed."
            });
        }

        if (!process.env.ENCRYPTION_KEY) {
            return res.status(500).json({
                success: false,
                message: "ENCRYPTION_KEY is missing in backend/.env."
            });
        }

        const dataHash = generateHash(originalData);
        const encrypted = encryptData(originalData);

        const encryptedPackage = {
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            authTag: encrypted.authTag
        };

        const cid = await uploadToIPFS(
            JSON.stringify(encryptedPackage),
            `dataset-${Date.now()}.json`
        );

        let blockchainResult = null;
        const shouldRegister = registerOnChain === true || registerOnChain === "true";

        if (shouldRegister) {
            if (!name || !category || !description || price === undefined) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Category, description, name and price are required when registerOnChain is true"
                });
            }

            blockchainResult = await addDataset(
                name,
                category,
                description,
                price,
                cid,
                dataHash
            );
        }

        res.status(201).json({
            success: true,
            message: shouldRegister
                ? "Dataset encrypted, hashed, uploaded to IPFS and registered on blockchain"
                : "Dataset encrypted, hashed and uploaded to IPFS. Register it on-chain with MetaMask addData().",
            cid,
            hash: dataHash,
            datasetId: blockchainResult ? blockchainResult.datasetId : null,
            transactionHash: blockchainResult ? blockchainResult.transactionHash : null
        });
    } catch (error) {
        console.error("Upload Dataset Error:", error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

async function verifyDataset(req, res) {
    try {
        const { datasetId } = req.params;

        if (!datasetId) {
            return res.status(400).json({
                success: false,
                message: "Blockchain dataset ID is required"
            });
        }

        const blockchainData = await getDataset(datasetId);

        if (!blockchainData.ipfsCID) {
            return res.status(400).json({
                success: false,
                message: "This dataset has no IPFS CID stored on-chain."
            });
        }

        const encryptedText = await retrieveFromIPFS(blockchainData.ipfsCID);
        let decryptedData = null;
        let isDecrypted = false;
        let currentHash = null;

        try {
            const encryptedPackage = JSON.parse(encryptedText);
            if (encryptedPackage.encryptedData && encryptedPackage.iv && encryptedPackage.authTag) {
                decryptedData = decryptData(
                    encryptedPackage.encryptedData,
                    encryptedPackage.iv,
                    encryptedPackage.authTag
                );
                isDecrypted = true;
                currentHash = generateHash(decryptedData);
            } else {
                currentHash = generateHash(encryptedText);
            }
        } catch {
            currentHash = generateHash(encryptedText);
        }

        const isValid = currentHash === blockchainData.dataHash;

        res.json({
            success: true,
            datasetId: blockchainData.id,
            cid: blockchainData.ipfsCID,
            originalHash: blockchainData.dataHash,
            currentHash,
            integrityVerified: isValid,
            decrypted: isDecrypted,
            status: isValid ? "DATA_UNCHANGED" : "DATA_MODIFIED"
        });
    } catch (error) {
        console.error("Verification Error:", error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}
async function getIPFSData(req, res) {
    try {
        const cid = req.params.cid?.trim();
        if (!cid) {
            return res.status(400).json({ success: false, message: "IPFS CID is required" });
        }

        // 1. Wallet ALWAYS required — no anonymous access to encrypted data.
        const userWallet =
            req.query.wallet ||
            req.query.user ||
            req.headers["x-wallet-address"] ||
            (req.headers.authorization && req.headers.authorization.startsWith("Bearer 0x")
                ? req.headers.authorization.slice(7)
                : null);

        if (!userWallet) {
            return res.status(401).json({
                success: false,
                message: "Wallet address required. Provide ?wallet=0x... or x-wallet-address header."
            });
        }

        // 2. Find dataset record for this CID (on-chain first, then MongoDB).
        let matched = null;

        if (req.query.datasetId) {
            try { matched = await getDataset(req.query.datasetId); }
            catch (e) { console.warn(`Lookup by datasetId #${req.query.datasetId}:`, e.message); }
        }

        if (!matched) {
            try {
                const { datasets } = await listDatasets();
                matched = datasets.find(
                    (d) => d.ipfsCID === cid ||
                           (d.ipfsCID && d.ipfsCID.toLowerCase() === cid.toLowerCase())
                );
            } catch (chainErr) { console.warn("On-chain dataset lookup:", chainErr.message); }
        }

        if (!matched) {
            try {
                const Data = require("../models/Data");
                const doc = await Data.findOne({ ipfsCID: cid });
                if (doc) {
                    matched = {
                        id: doc.blockchainId ? doc.blockchainId.toString() : doc._id.toString(),
                        name: doc.name,
                        category: doc.category,
                        description: doc.description,
                        owner: doc.seller,
                        ipfsCID: doc.ipfsCID,
                        dataHash: doc.dataHash
                    };
                }
            } catch (dbErr) { console.warn("MongoDB dataset lookup:", dbErr.message); }
        }

        // 3. No dataset record = deny access. Unregistered CIDs cannot be served.
        if (!matched || !matched.owner) {
            return res.status(404).json({
                success: false,
                message: `No registered dataset found for CID "${cid}". Register it on-chain first.`,
                cid
            });
        }

        // 4. Authorisation: owner OR on-chain AUTHORIZED buyer.
        const normalizedUser = userWallet.toLowerCase();
        const isOwner = matched.owner.toLowerCase() === normalizedUser;

        let isAuthorized = false;
        let statusLabel = "NONE";

        if (matched.id && !isNaN(Number(matched.id))) {
            try {
                const access = await getAccessStatus(matched.id, userWallet);
                statusLabel = access.label;
                isAuthorized = access.status === 4 || access.label === "AUTHORIZED";
            } catch (accessErr) {
                console.warn(`On-chain access check for ${userWallet}:`, accessErr.message);
            }
        }

        if (!isOwner && !isAuthorized) {
            return res.status(403).json({
                success: false,
                message: `Access denied. On-chain status for ${userWallet} is ${statusLabel}. Purchase authorized access first.`,
                status: statusLabel,
                datasetId: matched.id,
                datasetName: matched.name
            });
        }

        // 5. Retrieve encrypted payload from IPFS.
        let encryptedText;
        try {
            encryptedText = await retrieveFromIPFS(cid);
        } catch (ipfsErr) {
            return res.status(502).json({
                success: false,
                message: `Unable to retrieve CID "${cid}" from IPFS: ${ipfsErr.message}`,
                cid, datasetId: matched.id
            });
        }

        // 6. AES-256-GCM decryption.
        let payloadData = null;
        let isDecrypted = false;
        let currentHash = null;

        try {
            const encryptedPackage = JSON.parse(encryptedText);
            if (encryptedPackage.encryptedData && encryptedPackage.iv && encryptedPackage.authTag) {
                try {
                    const plaintext = decryptData(
                        encryptedPackage.encryptedData,
                        encryptedPackage.iv,
                        encryptedPackage.authTag
                    );
                    payloadData = plaintext;
                    isDecrypted = true;
                    currentHash = generateHash(plaintext);
                } catch (decErr) {
                    console.warn("AES-GCM decryption failed:", decErr.message);
                    return res.status(500).json({
                        success: false,
                        message: `Decryption failed. Dataset may use a different encryption key. (${decErr.message})`,
                        cid, datasetId: matched.id, datasetName: matched.name,
                        decrypted: false, integrityVerified: false
                    });
                }
            } else {
                payloadData = encryptedText;
                isDecrypted = false;
                currentHash = generateHash(encryptedText);
            }
        } catch (parseErr) {
            payloadData = encryptedText;
            isDecrypted = false;
            currentHash = generateHash(encryptedText);
        }

        // 7. Integrity: compare SHA-256 with on-chain hash. Only true on genuine match.
        const expectedHash = matched.dataHash || matched.hash || null;
        const integrityVerified = !!(expectedHash && currentHash && currentHash === expectedHash);

        let parsedPayload = payloadData;
        if (isDecrypted && typeof payloadData === "string") {
            try { parsedPayload = JSON.parse(payloadData); } catch { /* leave as string */ }
        }

        res.json({
            success: true,
            cid,
            datasetId: matched.id,
            datasetName: matched.name,
            owner: matched.owner,
            accessStatus: isOwner ? "OWNER" : statusLabel,
            data: parsedPayload,
            decrypted: isDecrypted,
            originalHash: expectedHash,
            currentHash,
            integrityVerified,
            status: integrityVerified ? "VERIFIED" : "UNVERIFIED"
        });
    } catch (error) {
        console.error("GET /ipfs/:cid Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = { uploadDataset, verifyDataset, getIPFSData };
