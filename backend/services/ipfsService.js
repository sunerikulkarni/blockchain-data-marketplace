async function uploadToIPFS(content, fileName) {
    if (!process.env.PINATA_JWT) {
        throw new Error("PINATA_JWT is missing");
    }

    const blob = new Blob(
        [content],
        { type: "application/json" }
    );

    const formData = new FormData();

    formData.append(
        "file",
        blob,
        fileName
    );

    const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.PINATA_JWT}`
            },
            body: formData
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `IPFS upload failed: ${errorText}`
        );
    }

    const result = await response.json();

    return result.IpfsHash;
}

async function retrieveFromIPFS(cid) {
    const response = await fetch(
        `https://gateway.pinata.cloud/ipfs/${cid}`
    );

    if (!response.ok) {
        throw new Error("Unable to retrieve data from IPFS");
    }

    return await response.text();
}

module.exports = {
    uploadToIPFS,
    retrieveFromIPFS
};