const { ethers } = require("hardhat");

async function main() {
  const [buyer] = await ethers.getSigners();

  const contractAddress =
    "0x02018B847dA98a987EE59d7F235b2c690085F044";

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract =
    DataMarketplace.attach(contractAddress);

  console.log("Buyer address:", buyer.address);
  console.log("Requesting access to Dataset #1...");

  const tx = await contract.requestAccess(1);

  await tx.wait();

  console.log("Access request submitted successfully!");
  console.log("Transaction hash:", tx.hash);

  const status =
    await contract.getAccessStatus(1, buyer.address);

  console.log("Access status:", status.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});