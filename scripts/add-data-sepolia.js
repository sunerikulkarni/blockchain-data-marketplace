const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();

  const contractAddress =
    "0x02018B847dA98a987EE59d7F235b2c690085F044";

  const DataMarketplace =
    await ethers.getContractFactory("DataMarketplace");

  const contract =
    DataMarketplace.attach(contractAddress);

  const price = ethers.parseEther("0.001");

  console.log("Dataset owner:", owner.address);
  console.log("Adding dataset...");

  const tx = await contract.addData(
    "Health Data",
    "Health",
    "User fitness and heart rate data",
    price,
    "QmExampleCID123",
    "example-hash-123456789"
  );

  await tx.wait();

  console.log("Data added successfully!");
  console.log("Transaction hash:", tx.hash);

  const dataCount = await contract.dataCount();

  console.log(
    "Total datasets:",
    dataCount.toString()
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});