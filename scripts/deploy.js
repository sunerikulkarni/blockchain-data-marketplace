const { ethers } = require("hardhat");

async function main() {

  // Get test accounts
  const [owner, buyer] = await ethers.getSigners();

  // Deploy contract
  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract = await DataMarketplace.deploy();

  await contract.waitForDeployment();

  console.log("Contract deployed to:", contract.target);

  console.log("Owner address:", owner.address);
  console.log("Buyer address:", buyer.address);


  // =========================================================
  // 1. ADD DATASET
  // =========================================================

  const price = ethers.parseEther("0.001");

  const ipfsCID = "QmExampleCID123";

  const dataHash =
    "example-hash-123456789";

  const addTx = await contract.connect(owner).addData(
    "Health Data",
    "Health",
    "User fitness and heart rate data",
    price,
    ipfsCID,
    dataHash
  );

  await addTx.wait();

  console.log("Data added successfully!");


  // =========================================================
  // 2. REQUEST ACCESS
  // =========================================================

  const requestTx =
    await contract.connect(buyer).requestAccess(1);

  await requestTx.wait();

  console.log("Access requested by buyer!");


  // =========================================================
  // 3. OWNER APPROVES ACCESS
  // =========================================================

  const approveTx =
    await contract.connect(owner).approveAccess(
      1,
      buyer.address
    );

  await approveTx.wait();

  console.log("Access approved by owner!");


  // =========================================================
  // 4. BUY DATA
  // =========================================================

  const buyTx =
    await contract.connect(buyer).buyData(1, {
      value: price
    });

  const receipt = await buyTx.wait();

  console.log("Data purchased successfully!");
  console.log("Transaction hash:", receipt.hash);


  // =========================================================
  // 5. CHECK ACCESS
  // =========================================================

  const hasAccess =
    await contract.hasAccess(1, buyer.address);

  console.log("Buyer has access:", hasAccess);


  // =========================================================
  // 6. GET DATA
  // =========================================================

  const data = await contract.getData(1);

  console.log("Fetched Data:");
  console.log("ID:", data[0]);
  console.log("Name:", data[1]);
  console.log("Category:", data[2]);
  console.log("Description:", data[3]);
  console.log("Price:", ethers.formatEther(data[4]), "ETH");
  console.log("Owner:", data[5]);
  console.log("IPFS CID:", data[6]);
  console.log("Data Hash:", data[7]);


  // =========================================================
  // 7. CHECK ACCESS STATUS
  // =========================================================

  const status =
    await contract.getAccessStatus(1, buyer.address);

  console.log("Access status:", status);
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});